import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const file of readdirSync(resolve(root, 'scripts')).filter((name) => /\.(mjs|js)$/.test(name))) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, 'scripts', file)], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(`JavaScript syntax check failed: scripts/${file}`); process.exit(1); }
}
for (const project of ['packages/sdk', 'packages/sentinel', 'packages/cli', 'packages/testing', 'apps/dashboard']) {
  const result = spawnSync('pnpm', ['exec', 'tsc', '--noEmit', '--project', `${project}/tsconfig.json`], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { console.error(`TypeScript static check failed: ${project}`); process.exit(1); }
  console.log(`PASS static check: ${project}`);
}
console.log('PASS first-party JavaScript syntax and TypeScript static checks');
