import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('deterministic vector check accepts the committed public-only fixture', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-vectors.js', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const data = JSON.parse(readFileSync(new URL('../test-vectors/verdict-vectors.json', import.meta.url), 'utf8'));
  assert.ok(data.vectors.every(vector => !Object.hasOwn(vector.signer, 'privateKey')));
});

test('the CI vector check fails for a deliberately mismatched digest', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-parity-drift-'));
  try {
    const path = resolve(directory, 'vectors.json');
    const data = JSON.parse(readFileSync(new URL('../test-vectors/verdict-vectors.json', import.meta.url), 'utf8'));
    data.vectors[0].digest = `0x${(BigInt(data.vectors[0].digest) ^ 1n).toString(16).padStart(64, '0')}`;
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-vectors.js', import.meta.url)), '--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Shared vectors differ from deterministic generator/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deterministic input check accepts all twelve public normalized-event vectors', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-input-vectors.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(readFileSync(new URL('../test-vectors/input-vectors.json', import.meta.url), 'utf8'));
  assert.equal(data.vectorCount, 12);
  assert.equal(data.vectors.length, 12);
  assert.ok(data.vectors.every(vector => ['amount', 'sourceChainId', 'targetChainId', 'timestamp', 'nonce']
    .every(field => typeof vector.event[field] === 'string')));
});

for (const field of ['inputHash', 'encoded']) {
  test(`the CI input check fails for a deliberately mismatched ${field}`, () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'horkos-input-drift-'));
    try {
      const path = resolve(directory, 'vectors.json');
      const data = JSON.parse(readFileSync(new URL('../test-vectors/input-vectors.json', import.meta.url), 'utf8'));
      const value = data.vectors[0][field];
      data.vectors[0][field] = `0x${(BigInt(value) ^ 1n).toString(16).padStart(value.length - 2, '0')}`;
      writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-input-vectors.mjs', import.meta.url)), '--check', path], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Shared input vectors differ from deterministic generator/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('the CI input check rejects a missing vector even when the count is updated', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-input-missing-'));
  try {
    const path = resolve(directory, 'vectors.json');
    const data = JSON.parse(readFileSync(new URL('../test-vectors/input-vectors.json', import.meta.url), 'utf8'));
    data.vectors.pop();
    data.vectorCount = data.vectors.length;
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./gen-input-vectors.mjs', import.meta.url)), '--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Shared input vectors differ from deterministic generator/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
