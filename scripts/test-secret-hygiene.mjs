import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const binary = process.argv[2] || process.env.GITLEAKS_BIN || 'gitleaks';
const temporary = mkdtempSync(join(tmpdir(), 'horkos-secret-tests-'));
const template = join(temporary, 'metadata.tmpl');

try {
  writeFileSync(template, '[{{range $i, $f := .}}{{if $i}},{{end}}{"file":{{quote $f.File}},"commit":{{quote $f.Commit}},"type":{{quote $f.RuleID}}}{{end}}]', { mode: 0o600 });
  const ignored = [
    '.env', '.env.production', '.env.local', 'contracts/.env',
    'apps/dashboard/.env.production', 'keystore/wallet.json',
    'keystores/wallet.json', 'contracts/keystores/wallet.json',
    'credentials.key', 'secrets/wallet.key',
    'contracts/broadcast/example/run-latest.json',
  ];
  const included = ['.env.example', 'contracts/.env.example', 'apps/dashboard/.env.example'];
  for (const file of ignored) {
    assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--no-index', file], { cwd }).status, 0, `${file} must be ignored`);
  }
  for (const file of included) {
    assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--no-index', file], { cwd }).status, 1, `${file} must be includable`);
  }

  function scan(input) {
    const result = spawnSync(binary, [
      'stdin', '--config', '.gitleaks.toml', '--redact=100', '--no-banner',
      '--log-level', 'error', '--report-format', 'template',
      '--report-template', template, '--report-path', '-',
    ], { cwd, input, encoding: 'utf8', env: { ...process.env, GITLEAKS_CONFIG: '', GITLEAKS_CONFIG_TOML: '' } });
    if (result.error) throw new Error('Gitleaks could not start; install it or pass its binary path');
    let findings;
    try { findings = JSON.parse(result.stdout); }
    catch { throw new Error('Gitleaks did not return metadata JSON; output withheld'); }
    return { exit: result.status, findings, output: result.stdout };
  }

  // Fresh, unfunded test material stays in memory and is never emitted in reports.
  const synthetic = `0x${randomBytes(32).toString('hex')}`;
  for (const input of [
    `DEPLOYER_PRIVATE_KEY=${synthetic}\n`,
    `const key = process.env.DEPLOYER_PRIVATE_KEY ||\n  "${synthetic}";\n`,
  ]) {
    const result = scan(input);
    assert.equal(result.exit, 1, 'Private-key assignments must be detected');
    assert(result.findings.some(row => row.type === 'horkos-private-key-assignment'), 'Explicit wallet rule must match');
    assert(result.findings.every(row => Object.keys(row).every(key => ['file', 'commit', 'type'].includes(key))), 'Reports must contain metadata only');
    assert(!result.output.includes(synthetic), 'Report must not expose test material');
  }
  assert.equal(scan('DEPLOYER_PRIVATE_KEY=\nSENTINEL_P256_PRIVATE_KEY=\n').exit, 0, 'Empty placeholders must not trigger');
  const publicCoordinate = `  "keyX": "${synthetic}",\n`;
  assert.equal(scan(publicCoordinate).exit, 0, 'Standalone public coordinate fields are not credentials');
  assert.equal(scan(publicCoordinate + `DEPLOYER_PRIVATE_KEY=${synthetic}\n`).exit, 1,
    'An adjacent public coordinate must not suppress private-key detection');
  assert.equal(scan(`  "keyX": "${synthetic}", "PRIVATE_KEY": "${synthetic}"\n`).exit, 1,
    'A coordinate line containing a private credential must not be allowlisted');
  for (const [name, value] of Object.entries(parseEnv(readFileSync(join(cwd, '.env.example'), 'utf8')))) {
    if (/PRIVATE_?KEY/i.test(name)) assert.equal(value.length, 0, `${name} must be blank in the example`);
  }
  console.log('PASS: 11 sensitive-path checks; 3 example-inclusion checks; env/multiline detection; metadata-only reports; public-coordinate exception isolation; empty placeholders; blank .env.example credentials');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
