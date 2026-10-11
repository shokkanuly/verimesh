import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const contracts = fileURLToPath(new URL('../../contracts', import.meta.url));
const result = spawnSync('forge', ['test', '--match-contract', 'IntegrationGuideTest'], {
  cwd: contracts, encoding: 'utf8', timeout: 120000,
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, MONAD_RPC_URL: '' },
});
if (result.status !== 0) {
  console.error('Integration fixture failed; private diagnostics withheld');
  process.exitCode = 1;
} else {
  const summary = result.stdout.match(/Suite result:.*$/m)?.[0];
  if (!summary || !summary.includes('0 failed')) throw new Error('Missing integration test result');
  console.log('LOCAL / SYNTHETIC / ephemeral P256 key and Solidity fallback only');
  console.log(summary);
}
