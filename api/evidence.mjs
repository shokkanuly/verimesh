import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { createEvidenceServer } from '../packages/sentinel/dist/server.js';

const origins = new Set((process.env.CORS_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean));
for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
  if (host) origins.add(new URL(`https://${host}`).origin);
}
const app = createEvidenceServer({ readOnly: true, allowedOrigins: [...origins],
  preloadDirectories: ['recorded', 'live'].map(name => resolve(process.cwd(), 'evidence', name)) });
const handler = app.server.listeners('request')[0];

export default async function evidence(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = url.searchParams.get('path') ?? url.pathname.replace(/^\/api(?:\/evidence)?/, '');
  const apiUrl = `/${path.replace(/^\/+/, '')}`;
  // Vercel may parse JSON before invoking a Node handler; preserve the existing bounded reader.
  const req = request.body === undefined ? request : Object.assign(Readable.from([
    Buffer.isBuffer(request.body) ? request.body : Buffer.from(
      typeof request.body === 'string' ? request.body : JSON.stringify(request.body)),
  ]), { method: request.method, headers: request.headers, socket: request.socket });
  req.url = apiUrl;
  await handler(req, response);
}
