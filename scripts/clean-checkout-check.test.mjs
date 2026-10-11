import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { quickstartCommands } from './clean-checkout-check.mjs';

test('quickstart acceptance is extracted from the real document', () => {
  assert.deepEqual(quickstartCommands(readFileSync(new URL('../QUICKSTART.md', import.meta.url), 'utf8')), [
    'pnpm install --frozen-lockfile', 'pnpm sandbox',
    'pnpm verify-bundle evidence/replay/sandbox/bundle-freeze.json', 'node examples/ts-sentinel/demo.mjs',
  ]);
});

test('ambiguous, shell-expanded and incomplete acceptance blocks fail closed', () => {
  assert.throws(() => quickstartCommands('No block'));
  assert.throws(() => quickstartCommands('```bash\npnpm build\n```'));
  assert.throws(() => quickstartCommands('```bash\na\nb\nc\nd; bad\n```'));
  assert.throws(() => quickstartCommands('```bash\na\nb\nc\nd\n```\n```bash\na\nb\nc\nd\n```'));
});
