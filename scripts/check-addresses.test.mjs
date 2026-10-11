import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkAddresses, checkAddressSource } from './check-addresses.mjs';

// Deliberate address drift is injected in memory, never into operator files.
const stale = `0x${'91'.repeat(20)}`;
for (const path of ['README.md', 'docs/deploy.md', '.env.example', 'apps/dashboard/src/config.ts', 'packages/sdk/test/drift.test.ts', 'contracts/script/Seed.s.sol']) {
  test(`rejects injected address drift in ${path}`, () => {
    const source = path.endsWith('.ts') ? `export const registry = '${stale}';`
      : path.endsWith('.sol') ? `address constant REGISTRY = ${stale};`
      : path.endsWith('.example') ? `VERDICT_REGISTRY_ADDRESS=${stale}` : `Registry: ${stale}`;
    assert.ok(checkAddressSource(path, source).length > 0);
  });
}
test('allows manifest reads and deliberate protocol/mock domains', () => {
  assert.deepEqual(checkAddressSource('apps/dashboard/src/config.ts', 'export const addresses = deployment.contracts;'), []);
  assert.deepEqual(checkAddressSource('contracts/test/Vector.t.sol', `address constant FIXTURE = 0x${'0'.repeat(36)}bEEF;`), []);
});
test('workspace has no duplicated live address configuration', () => {
  assert.deepEqual(checkAddresses(), []);
});
test('the command exits nonzero for a deliberately stale deployment address', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-address-drift-'));
  try {
    for (const folder of ['apps', 'packages', 'contracts', 'scripts', 'docs', 'deployments']) mkdirSync(resolve(directory, folder));
    cpSync(new URL('../deployments/monad-testnet.json', import.meta.url), resolve(directory, 'deployments/monad-testnet.json'));
    writeFileSync(resolve(directory, '.env.example'), '');
    writeFileSync(resolve(directory, 'README.md'), `Registry: ${stale}`);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-addresses.mjs', import.meta.url)), directory], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README.md:1: address literal/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
