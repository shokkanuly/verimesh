import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(resolve(tmpdir(), 'horkos-scan-'));
const template = resolve(temp, 'metadata.tmpl');
try {
  writeFileSync(template, '[{{range $i, $f := .}}{{if $i}},{{end}}{"file":{{quote $f.File}},"commit":{{quote $f.Commit}},"type":{{quote $f.RuleID}}}{{end}}]', { mode: 0o600 });
  const result = spawnSync(process.env.GITLEAKS_BIN || 'gitleaks', [
    'git', '--log-opts=--all', '--config', '.gitleaks.toml', '--redact=100', '--no-banner',
    '--log-level', 'error', '--report-format', 'template', '--report-template', template, '--report-path', '-', root,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GITLEAKS_CONFIG: '', GITLEAKS_CONFIG_TOML: '' } });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Secret scanner unavailable or failed; raw diagnostics withheld');
  let findings;
  try { findings = JSON.parse(result.stdout); } catch { throw new Error('Invalid scanner metadata; raw output withheld'); }
  if (!Array.isArray(findings) || findings.some((row) => Object.keys(row).some((key) => !['file', 'commit', 'type'].includes(key)))) {
    throw new Error('Scanner metadata schema rejected');
  }
  console.log(JSON.stringify({ scope: 'all-local-git-history', passed: result.status === 0, findingsCount: findings.length,
    findings: findings.map(({ file, commit, type }) => ({ file, commit, type })) }, null, 2));
  process.exitCode = result.status;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { rmSync(temp, { recursive: true, force: true }); }
