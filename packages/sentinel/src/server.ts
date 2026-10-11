import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_ID, MAX_BUNDLE_BYTES, DiskBundleStore, MemoryBundleStore,
  readPublicBundleFile, verifyPublicBundle, type BundleStore,
} from './bundle-store.js';

export { MemoryBundleStore, DiskBundleStore, type BundleStore } from './bundle-store.js';

export interface EvidenceServerOptions {
  store?: BundleStore;
  readOnly?: boolean;
  allowedOrigins?: string[];
  preloadDirectories?: string[];
  bodyLimitBytes?: number;
  requestsPerMinute?: number;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function readBody(req: http.IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let total = 0;
    let settled = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > limit) {
        settled = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request body too large'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Invalid JSON body')); }
    });
    req.on('error', () => { if (!settled) { settled = true; reject(new HttpError(400, 'Request interrupted')); } });
  });
}

export function createEvidenceServer(optionsOrStore: EvidenceServerOptions | BundleStore = {}) {
  const options = 'get' in optionsOrStore ? { store: optionsOrStore } : optionsOrStore;
  const store = options.store ?? new MemoryBundleStore();
  const readOnly = options.readOnly ?? true;
  const origins = new Set(options.allowedOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173']);
  const limit = options.bodyLimitBytes ?? MAX_BUNDLE_BYTES;
  const rate = options.requestsPerMinute ?? 120;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BUNDLE_BYTES
    || !Number.isSafeInteger(rate) || rate < 1) throw new Error('Invalid evidence server limits');
  if (origins.has('*')) throw new Error('Wildcard CORS is not allowed');
  const evidence = fileURLToPath(new URL('../../../evidence/', import.meta.url));
  let rejectedFiles = store instanceof DiskBundleStore ? store.rejectedFiles : 0;
  for (const directory of options.preloadDirectories ?? [evidence, resolve(evidence, 'recorded'), resolve(evidence, 'live'), resolve(evidence, 'replay')]) {
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory).filter((name) => /^bundle-[a-z0-9-]+\.json$/.test(name))) {
      try {
        const bundle = readPublicBundleFile(resolve(directory, file));
        store.set(bundle.verdictId, bundle);
      } catch { rejectedFiles++; }
    }
  }

  const clients = new Map<string, { count: number; reset: number }>();
  const server = http.createServer(async (req, res) => {
    const send = (status: number, value?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 413 ? { Connection: 'close' } : {}) });
      res.end(value === undefined ? undefined : JSON.stringify(value));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) { send(403, { error: 'Origin not allowed' }); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const now = Date.now();
    for (const [key, value] of clients) if (value.reset <= now) clients.delete(key);
    const ip = req.socket.remoteAddress ?? 'unknown';
    let client = clients.get(ip);
    if (!client) {
      if (clients.size >= 4096) { send(429, { error: 'Too many clients' }); return; }
      client = { count: 0, reset: now + 60000 };
      clients.set(ip, client);
    }
    if (++client.count > rate) {
      res.setHeader('Retry-After', Math.ceil((client.reset - now) / 1000));
      send(429, { error: 'Rate limit exceeded' }); return;
    }
    if (req.method === 'OPTIONS') { send(204); return; }

    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && ['/', '/health'].includes(url.pathname)) {
        send(200, { service: 'Horkos Evidence API', status: 'ok', mode: readOnly ? 'read-only' : 'read-write',
          verification: 'offline-signature-and-scorer', storedBundlesCount: store.keys().length, rejectedFiles });
      } else if (req.method === 'GET' && url.pathname === '/bundles') {
        send(200, { verdictIds: store.keys() });
      } else if (req.method === 'GET' && url.pathname.startsWith('/bundle/')) {
        const id = url.pathname.slice('/bundle/'.length);
        if (!BUNDLE_ID.test(id)) throw new HttpError(400, 'Invalid verdict ID');
        const bundle = store.get(id);
        if (!bundle) throw new HttpError(404, 'Bundle not found');
        send(200, bundle);
      } else if (req.method === 'POST' && ['/bundle', '/verify'].includes(url.pathname)) {
        if (url.pathname === '/bundle' && readOnly) throw new HttpError(405, 'Evidence storage is read-only');
        if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          throw new HttpError(415, 'Content-Type must be application/json');
        }
        if (req.headers['content-length'] && Number(req.headers['content-length']) > limit) {
          throw new HttpError(413, 'Request body too large');
        }
        const value = await readBody(req, limit);
        let verified: ReturnType<typeof verifyPublicBundle>;
        try { verified = verifyPublicBundle(value); }
        catch { throw new HttpError(422, 'Invalid public evidence schema'); }
        if (!verified.report.valid) { send(422, verified.report); return; }
        if (url.pathname === '/verify') { send(200, verified.report); return; }
        try { store.set(verified.bundle.verdictId, verified.bundle); }
        catch { throw new HttpError(409, 'Evidence conflict or storage unavailable'); }
        send(201, { stored: true, verdictId: verified.bundle.verdictId });
      } else throw new HttpError(404, 'Not found');
    } catch (error) {
      if (!res.headersSent) send(error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : 'Evidence service error' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 32;
  server.keepAliveTimeout = 5000;

  return {
    server, store,
    listen(port: number, host = '127.0.0.1') {
      return new Promise<void>((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.removeListener('error', reject); resolveListen(); });
      });
    },
    close() {
      return new Promise<void>((resolveClose, reject) => {
        server.close((error) => error ? reject(error) : resolveClose());
        server.closeIdleConnections();
      });
    },
  };
}

export function startServer(port = 3000) {
  const directory = process.env.EVIDENCE_DIRECTORY ?? fileURLToPath(new URL('../../../evidence/replay/store/', import.meta.url));
  const app = createEvidenceServer({
    store: new DiskBundleStore(directory), readOnly: process.env.EVIDENCE_READ_ONLY !== 'false',
    allowedOrigins: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean),
  });
  return app.server.listen(port, process.env.HOST ?? '127.0.0.1');
}

if (process.env.START_SERVER === 'true') startServer(Number(process.env.PORT || 3000));
