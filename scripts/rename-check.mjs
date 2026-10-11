import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const inventory = JSON.parse(readFileSync(resolve(root, 'evidence/rebrand/RB-1-inventory.json'), 'utf8'));
const applying = process.argv.slice(2).includes('--apply');
assert.ok(process.argv.slice(2).every((arg) => arg === '--apply'), 'Usage: node scripts/rename-check.mjs [--apply]');
assert.equal(git('branch', '--show-current').trim(), 'rebrand/horkos');

// RB-3 owns the signing-domain switch, so RB-2 remains compatible with its fixtures.
const protectedDomainLiterals = new Map([
  ['packages/sdk/src/domain.ts', ["name: 'VeriMesh'"]],
  ['contracts/src/libs/VerdictLib.sol', ['NAME_HASH = keccak256("VeriMesh")']],
  ['scripts/gen-vectors.js', ["keccak256(stringToBytes('VeriMesh'))", "name: 'VeriMesh'"]],
]);
const replacements = new Map([
  ['VeriMesh', 'Horkos'], ['Verimesh', 'Horkos'], ['verimesh', 'horkos'], ['VERIMESH', 'HORKOS'],
  ['veri-mesh', 'Horkos'], ['Veri Mesh', 'Horkos'], ['Veri-Mesh', 'Horkos'],
]);
function rename(source) {
  return source.replace(/veri[-_ ]?mesh/gi, (value) => {
    assert.ok(replacements.has(value), `Unknown name variant: ${value}`);
    return replacements.get(value);
  });
}
const targetRows = inventory.inventory.filter((row) => !row.path.startsWith('evidence/')
  && row.path !== 'pnpm-lock.yaml' && !row.path.endsWith('.docx'));
const pathMap = new Map(inventory.pathRenames.map((entry) => [entry.old, entry.proposed]));
const changes = targetRows.map((row) => {
  const source = readFileSync(resolve(root, row.path), 'utf8');
  const committed = git('show', `${inventory.baselineCommit}:${row.path}`);
  assert.equal(source, committed, `Uninventoried source change: ${row.path}`);
  assert.equal((source.match(/veri[-_ ]?mesh/gi) ?? []).length, row.occurrences);
  let temporary = source;
  const literals = protectedDomainLiterals.get(row.path) ?? [];
  for (const [index, literal] of literals.entries()) {
    assert.equal(temporary.split(literal).length - 1, 1, `Unexpected domain literal in ${row.path}`);
    temporary = temporary.replace(literal, `__RB2_DOMAIN_${index}__`);
  }
  let changed = rename(temporary);
  for (const [index, literal] of literals.entries()) changed = changed.replace(`__RB2_DOMAIN_${index}__`, literal);
  assert.equal((changed.match(/veri[-_ ]?mesh/gi) ?? []).length, literals.length);
  return { oldPath: row.path, newPath: pathMap.get(row.path) ?? row.path, source: changed };
});
for (const model of inventory.models) {
  for (const path of model.inputs) assert.equal(git('show', `${inventory.baselineCommit}:${path}`), readFileSync(resolve(root, path), 'utf8'));
}
for (const protectedFile of inventory.protectedFiles) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, protectedFile.path))).digest('hex'), protectedFile.sha256);
}
const trackedChanges = git('diff', '--name-only', 'HEAD').trim();
assert.equal(trackedChanges, '', 'Tracked changes must be committed before applying the RB-2 rename');

console.log(`${applying ? 'Applying' : 'Plan'}: ${inventory.pathRenames.length} git mv operations; ${changes.length} exact-case text rewrites.`);
console.log('Preserve four domain literals for RB-3; DOCX text belongs to RB-5; lockfile belongs to pnpm install; historical evidence remains byte-preserved.');
if (applying) {
  for (const entry of inventory.pathRenames) git('mv', '--', entry.old, entry.proposed);
  for (const change of changes) writeFileSync(resolve(root, change.newPath), change.source);
  console.log('PASS mechanical rename applied only to inventoried first-party targets. Run pnpm install, builds and tests before the RB-2 commit.');
}
