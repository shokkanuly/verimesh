import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createSigner, type EvidenceBundle } from '@horkos/sdk';
import { createEvidenceServer, DiskBundleStore, MemoryBundleStore } from '../src/server.js';
import { MAX_BUNDLE_BYTES } from '../src/bundle-store.js';
import { runReplay } from '../src/replay.js';

let bundles: EvidenceBundle[];
const apps: ReturnType<typeof createEvidenceServer>[] = [];
const directories: string[] = [];
beforeAll(async () => {
  bundles = (await runReplay({
    signer: createSigner(`0x${randomBytes(31).toString('hex').padStart(64, '0')}`),
    agentId: 7n, policyId: `0x${'ab'.repeat(32)}`, chainId: 31337,
    registryAddress: '0x0000000000000000000000000000000000000001',
  })).map(({ bundle }) => bundle);
});
afterEach(async () => {
  for (const app of apps.splice(0)) if (app.server.listening) await app.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory() { const path = mkdtempSync(join(tmpdir(), 'horkos-api-')); directories.push(path); return path; }
async function start(options: Parameters<typeof createEvidenceServer>[0] = {}) {
  const app = createEvidenceServer({ preloadDirectories: [], readOnly: false, ...options });
  apps.push(app); await app.listen(0);
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  return { app, base, post: (bundle: unknown, path = '/bundle', headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(bundle),
  }) };
}

describe('Verified evidence service', () => {
  it('persists five verified bundles and reloads them after server restart', async () => {
    const path = directory();
    const first = await start({ store: new DiskBundleStore(path) });
    for (const bundle of bundles) expect((await first.post(bundle)).status).toBe(201);
    await first.app.close();
    const second = await start({ store: new DiskBundleStore(path), readOnly: true });
    expect(await (await fetch(second.base + '/health')).json()).toMatchObject({
      status: 'ok', mode: 'read-only', storedBundlesCount: 5, rejectedFiles: 0,
    });
    for (const bundle of bundles) {
      expect(await (await fetch(second.base + '/bundle/' + bundle.verdictId)).json()).toEqual(bundle);
    }
  });

  it.each(['chainId', 'registry', 'verdictId', 'event', 'features', 'model', 'verdict', 'signature', 'key'])('rejects %s tampering before storage', async (field) => {
    const { app, post } = await start();
    const bundle = structuredClone(bundles[2]);
    if (field === 'chainId') bundle.chainId++;
    if (field === 'registry') bundle.registry = '0x0000000000000000000000000000000000000002';
    if (field === 'verdictId') bundle.verdictId = `0x${'cd'.repeat(32)}`;
    if (field === 'event') bundle.normalizedEvent.amount = '1';
    if (field === 'features') bundle.features.sizeRatioBps = 0;
    if (field === 'model') bundle.model.hash = `0x${'cd'.repeat(32)}`;
    if (field === 'verdict') bundle.verdict.scoreBps++;
    if (field === 'signature') bundle.signature.r = `0x${'cd'.repeat(32)}`;
    if (field === 'key') bundle.signature.keyX = `0x${'cd'.repeat(32)}`;
    const response = await post(bundle);
    expect(response.status).toBe(422);
    expect((await response.json()).valid).toBe(false);
    expect(app.store.keys()).toHaveLength(0);
  });

  it('rejects malformed schemas and unknown fields without reflecting their values', async () => {
    const { post, app } = await start();
    const invalid = [null, [], {}, { ...bundles[0], unknown: 'sensitive-marker' },
      { ...bundles[0], signature: {} }, { ...bundles[0], verdict: { ...bundles[0].verdict, nonce: '-1' } },
      { ...bundles[0], features: { ...bundles[0].features, sizeRatioBps: 0.5 } }];
    for (const value of invalid) {
      const response = await post(value);
      expect(response.status).toBe(422);
      expect(await response.text()).not.toContain('sensitive-marker');
    }
    expect(app.store.keys()).toHaveLength(0);
  });

  it('supports verification in read-only mode without storing', async () => {
    const { post, app } = await start({ readOnly: true });
    expect((await post(bundles[0])).status).toBe(405);
    expect((await post(bundles[0], '/verify')).status).toBe(200);
    expect(app.store.keys()).toHaveLength(0);
  });

  it('bounds ordinary and chunked request bodies', async () => {
    const { base } = await start({ bodyLimitBytes: 1024 });
    const oversized = 'x'.repeat(1025);
    const regular = await fetch(base + '/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversized });
    expect(regular.status).toBe(413);
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(oversized)); controller.close();
    } });
    const chunked = await fetch(base + '/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    expect(chunked.status).toBe(413);
  });

  it('rejects invalid JSON/content type and malformed/path-like IDs', async () => {
    const { base } = await start();
    expect((await fetch(base + '/bundle', { method: 'POST', body: '{}' })).status).toBe(415);
    expect((await fetch(base + '/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400);
    expect((await fetch(base + '/bundle/not-an-id')).status).toBe(400);
    expect((await fetch(base + '/bundle/%2e%2e%2f.env')).status).toBe(400);
  });

  it('allows only explicit CORS origins and never reflects Host into the response', async () => {
    const { base } = await start({ allowedOrigins: ['https://dashboard.example'] });
    const denied = await fetch(base + '/health', { headers: { Origin: 'https://untrusted.example' } });
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    const allowed = await fetch(base + '/health', { headers: { Origin: 'https://dashboard.example', Host: 'evil.example' } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://dashboard.example');
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await allowed.text()).not.toContain('evil.example');
    expect(() => createEvidenceServer({ allowedOrigins: ['*'] })).toThrow('Wildcard');
  });

  it('rate-limits by socket address, ignoring spoofed forwarding headers', async () => {
    const { base } = await start({ requestsPerMinute: 2 });
    expect((await fetch(base + '/health')).status).toBe(200);
    expect((await fetch(base + '/health')).status).toBe(200);
    const limited = await fetch(base + '/health', { headers: { 'X-Forwarded-For': '192.0.2.1' } });
    expect(limited.status).toBe(429);
    expect(limited.headers.has('retry-after')).toBe(true);
  });

  it('does not expose invalid/symlinked/oversized disk evidence', () => {
    const path = directory();
    writeFileSync(join(path, `${bundles[0].verdictId}.json`), JSON.stringify({ ...bundles[0], features: {} }));
    writeFileSync(join(path, `${bundles[1].verdictId}.json`), 'x'.repeat(MAX_BUNDLE_BYTES + 1));
    const valid = join(path, 'valid.json');
    writeFileSync(valid, JSON.stringify(bundles[2]));
    symlinkSync(valid, join(path, `${bundles[2].verdictId}.json`));
    const store = new DiskBundleStore(path);
    expect(store.keys()).toHaveLength(0);
    expect(store.rejectedFiles).toBe(3);
    const link = join(directory(), 'linked'); symlinkSync(path, link);
    expect(() => new DiskBundleStore(link)).toThrow('regular directory');
  });

  it('imports only verified preload evidence and reports rejected files', async () => {
    const path = directory();
    writeFileSync(join(path, 'bundle-valid.json'), JSON.stringify(bundles[0]));
    writeFileSync(join(path, 'bundle-bad.json'), '{}');
    const { base } = await start({ preloadDirectories: [path] });
    expect(await (await fetch(base + '/health')).json()).toMatchObject({ storedBundlesCount: 1, rejectedFiles: 1 });
  });

  it('bounds stored bundles and returns copies immutable to callers', async () => {
    const store = new MemoryBundleStore(1);
    store.set(bundles[0].verdictId, bundles[0]);
    const copy = store.get(bundles[0].verdictId)!; copy.verdict.scoreBps++;
    expect(store.get(bundles[0].verdictId)).toEqual(bundles[0]);
    const { post } = await start({ store });
    expect((await post(bundles[1])).status).toBe(409);
  });

  it('writes only public JSON, leaves no temporary files, and permits exact retries', () => {
    const path = directory(); const store = new DiskBundleStore(path);
    store.set(bundles[0].verdictId, bundles[0]); store.set(bundles[0].verdictId, bundles[0]);
    expect(readdirSync(path)).toEqual([`${bundles[0].verdictId}.json`]);
    expect(JSON.parse(readFileSync(join(path, readdirSync(path)[0]), 'utf8'))).toEqual(bundles[0]);
  });
});
