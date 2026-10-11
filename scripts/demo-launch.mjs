import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvidenceServer } from '../packages/sentinel/dist/server.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const address = portProbe.address();
if (!address || typeof address === 'string') throw new Error('Dashboard port unavailable');
const uiPort = address.port;
await new Promise((done, reject) => portProbe.close(error => error ? reject(error) : done()));
const uiUrl = `http://127.0.0.1:${uiPort}`;
const api = createEvidenceServer({ readOnly: true, allowedOrigins: [uiUrl],
  preloadDirectories: ['recorded', 'live'].map(name => resolve(root, 'evidence', name)) });
await api.listen(0);
const apiAddress = api.server.address();
if (!apiAddress || typeof apiAddress === 'string') throw new Error('Evidence API port unavailable');
const apiUrl = `http://127.0.0.1:${apiAddress.port}`;
const child = spawn(process.execPath, [resolve(root, 'apps/dashboard/node_modules/vite/bin/vite.js'),
  '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], {
  cwd: resolve(root, 'apps/dashboard'), stdio: 'inherit',
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    EVIDENCE_API_PROXY: apiUrl },
});
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await api.close();
  process.exitCode = code;
}
child.once('error', () => { console.error('Dashboard launch failed'); void stop(1); });
child.once('exit', code => { void stop(code ?? 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop(0); });
console.log(`Horkos: ${uiUrl}/`);
console.log(`LIVE dashboard: ${uiUrl}/dashboard?mode=live`);
console.log(`Read-only API: ${apiUrl}/health`);
console.log('Synthetic inputs; existing LIVE receipts. No keys loaded or transactions sent.');
