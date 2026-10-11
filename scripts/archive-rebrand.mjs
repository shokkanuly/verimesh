import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { keccak256, toHex } from 'viem';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inventory = JSON.parse(readFileSync(resolve(root, 'evidence/rebrand/RB-1-inventory.json'), 'utf8'));
assert.deepEqual(process.argv.slice(2), ['--apply'], 'This one-time archive requires --apply');
for (const record of [...inventory.bundles, ...inventory.protectedFiles]) {
  assert.equal(sha256(readFileSync(resolve(root, record.path))), record.sha256, `Frozen artifact changed: ${record.path}`);
}
const manifestBytes = readFileSync(resolve(root, 'deployments/monad-testnet.json'));
const manifestHash = keccak256(toHex(manifestBytes)).slice(2);
const moves = [
  ...inventory.bundles.filter(record => record.tracked).map(record => [record.path, `evidence/archive/pre-horkos/${record.path.slice('evidence/'.length)}`]),
  ...['recorded/run.json', 'testnet-proof.json', 'phase2-demo-rehearsal.json', 'phase2-demo-rehearsal.md']
    .map(path => [`evidence/${path}`, `evidence/archive/pre-horkos/${path}`]),
  ['deployments/monad-testnet.json', `deployments/archive/${manifestHash}.json`],
];
for (const [, target] of moves) assert.equal(existsSync(resolve(root, target)), false, `Archive already exists: ${target}`);
const localTarget = 'evidence/archive-local/pre-horkos-replay';
assert.equal(existsSync(resolve(root, localTarget)), false, 'Local archive already exists');
const ledger = moves.map(([source, target]) => ({ source, target, sha256: sha256(readFileSync(resolve(root, source))) }));
for (const [source, target] of moves) {
  mkdirSync(dirname(resolve(root, target)), { recursive: true });
  execFileSync('git', ['mv', '--', source, target], { cwd: root });
}
mkdirSync(dirname(resolve(root, localTarget)), { recursive: true });
renameSync(resolve(root, 'evidence/replay'), resolve(root, localTarget));
for (const record of ledger) assert.equal(sha256(readFileSync(resolve(root, record.target))), record.sha256);
const ignoredBundles = inventory.bundles.filter(record => !record.tracked).map(record => ({
  source: record.path, target: `${localTarget}/${record.path.slice('evidence/replay/'.length)}`, sha256: record.sha256,
}));
for (const record of ignoredBundles) assert.equal(sha256(readFileSync(resolve(root, record.target))), record.sha256);
writeFileSync(resolve(root, 'evidence/rebrand/RB-3-archive.json'), `${JSON.stringify({
  status: 'STALE / DEPRECATED', reason: 'Signed under the retired domain; not current Horkos evidence.',
  manifestHash, tracked: ledger, ignoredBundles, archivedBundleCount: inventory.bundles.length,
  rawBytesPreserved: true, transactionsBroadcast: 0,
}, null, 2)}\n`);
console.log(`Archived ${inventory.bundles.length} inventoried bundles (${ignoredBundles.length} ignored), old proof/rehearsal records and the deployment manifest; raw bytes verified.`);
console.log(`Deployment archive: deployments/archive/${manifestHash}.json`);
