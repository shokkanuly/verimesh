import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const [command, args, cwd] of [
  [process.execPath, ['scripts/gen-vectors.js', '--check'], root],
  [process.execPath, ['scripts/gen-input-vectors.mjs', '--check'], root],
  ['pnpm', ['--filter', '@horkos/sdk', 'exec', 'vitest', 'run', 'test/sdk.test.ts', '-t', 'Test Vectors Parity'], root],
  ['pnpm', ['--filter', '@horkos/sdk', 'exec', 'vitest', 'run', 'test/normalize.test.ts'], root],
  ['forge', ['test', '--match-contract', 'VectorsTest|SharedVectorRegistryTest|InputVectorsTest'], `${root}/contracts`],
]) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, MONAD_RPC_URL: '' }, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`Parity check failed: ${command} (${result.error?.message ?? `exit ${result.status}`})`);
    process.exit(result.status || 1);
  }
}
console.log('PASS: shared normalized-input, domain, struct, digest and rejection vectors agree in TypeScript and Solidity.');
