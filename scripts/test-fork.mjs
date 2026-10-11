import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createPublicClient, http } from 'viem';
import { loadEnvironment } from './deployment-checks.mjs';

const evidence = new URL('../evidence/fork-tests.txt', import.meta.url);
const deployment = JSON.parse(readFileSync(new URL('../deployments/monad-testnet.json', import.meta.url), 'utf8'));
const env = loadEnvironment();
const requested = env.MONAD_RPC_URL;
const expectedTests = [
  'test_Fork_FullVerdictFlow_WithLivePrecompileAndERC8004',
  'test_Fork_LiveERC8004_QueryOwner',
  'test_Fork_P256Precompile_AcceptsVectorSignature',
  'test_Fork_P256Precompile_RejectsTamperedDigest',
  'test_Fork_P256Precompile_RejectsTamperedPublicKey',
  'test_Fork_P256Precompile_RejectsTamperedSignature',
];
let header = `F-13 read-only fork evidence\nChecked: ${new Date().toISOString()}\n`;
let runOutput = '';
function safeOutput(value) {
  return requested ? String(value).replaceAll(requested, '[MONAD_RPC_URL]') : String(value);
}
try {
  if (!requested) throw new Error('Set MONAD_RPC_URL explicitly; this runner never silently skips.');
  const client = createPublicClient({ transport: http(requested, { timeout: 15000, retryCount: 0 }) });
  if (await client.getChainId() !== deployment.chainId) throw new Error('RPC chain ID differs from deployment manifest');
  const block = env.MONAD_FORK_BLOCK ? BigInt(env.MONAD_FORK_BLOCK) : await client.getBlockNumber();
  if (block <= 0n) throw new Error('MONAD_FORK_BLOCK must be a positive block number');
  header += `Chain: ${deployment.chainId}\nPinned block: ${block}\nCommand: forge test --rpc-url [MONAD_RPC_URL] --fork-block-number ${block} --match-contract ForkTest -vv\n\n`;
  const result = spawnSync('forge', ['test', '--rpc-url', requested, '--fork-block-number', String(block), '--match-contract', 'ForkTest', '-vv'], {
    cwd: fileURLToPath(new URL('../contracts/', import.meta.url)),
    env: { ...env, MONAD_FORK_BLOCK: String(block) }, encoding: 'utf8', timeout: 120000,
  });
  const output = safeOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  runOutput = output;
  const missing = expectedTests.filter(name => !output.includes(`[PASS] ${name}()`));
  const passed = result.status === 0 && !result.error && missing.length === 0 && !output.includes('[SKIP]');
  writeFileSync(evidence, header + output + `\nResult: ${passed ? 'PASS: all six tests ran, no skips' : 'FAIL'}\n`);
  process.stdout.write(output);
  if (!passed) throw new Error(`Fork suite failed. Tests without a passing result: ${missing.join(', ') || 'none; inspect process error'}. ${safeOutput(result.error?.message ?? '')}`);
  console.log('Saved evidence/fork-tests.txt. Fork-only simulation; no transactions broadcast.');
} catch (error) {
  const reason = safeOutput(error.message);
  // Setup/RPC failures affect every test; retain that fact rather than six apparent skips.
  writeFileSync(evidence, header + runOutput + '\n' + expectedTests.map(name => `${name}: ${reason}`).join('\n') + '\nResult: FAIL\n');
  console.error(reason);
  process.exitCode = 1;
}
