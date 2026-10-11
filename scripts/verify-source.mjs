import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, loadEnvironment, loadManifest, validateManifest, buildArtifacts, addressOf, constructorArgs, requireCheck, runCommand, isMain } from './deployment-checks.mjs';

export async function main() {
  requireCheck(process.argv.length === 2, 'verify:source takes no flags');
  const manifest = validateManifest(loadManifest());
  const env = loadEnvironment();
  const artifacts = buildArtifacts();
  const scratch = mkdtempSync(resolve(tmpdir(), 'horkos-source-'));
  const results = [];
  try {
    for (const name of ['src', 'lib', 'foundry.toml']) cpSync(resolve(root, 'contracts', name), resolve(scratch, name), { recursive: true });
    const paths = { VerdictRegistry: 'src/VerdictRegistry.sol', TripwireGuardianV2: 'src/examples/TripwireGuardianV2.sol',
      SimpleGate: 'src/examples/SimpleGate.sol', MockBridge: 'src/examples/MockBridge.sol' };
    for (const name of Object.keys(paths)) {
      if (!manifest.contracts[name]) continue;
      const address = addressOf(manifest, name);
      for (const provider of ['sourcify', ...(env.ETHERSCAN_API_KEY?.trim() ? ['monadscan'] : [])]) {
        const command = ['verify-contract', address, `${paths[name]}:${name}`, '--chain', '10143',
          '--constructor-args', constructorArgs(manifest, name, artifacts[name]), '--watch'];
        if (provider === 'sourcify') command.push('--verifier', 'sourcify', '--verifier-url', 'https://sourcify-api-monad.blockvision.org');
        const result = spawnSync('forge', command, { cwd: scratch, timeout: 120000, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
          env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, MONAD_RPC_URL: '', NO_COLOR: '1',
            ...(provider === 'monadscan' ? { ETHERSCAN_API_KEY: env.ETHERSCAN_API_KEY } : {}) } });
        const verified = result.status === 0 && /successfully verified|already verified/i.test(result.stdout + result.stderr);
        results.push({ name, address, provider, status: verified ? 'verified' : 'not-verified', exitCode: result.status,
          reason: verified ? 'Forge confirmed source verification' : result.error?.code === 'ETIMEDOUT' ? 'Source verification timed out'
            : 'Forge did not confirm source verification; no success claimed',
          explorer: `https://testnet.monadvision.com/address/${address}?tab=Contract` });
        console.log(JSON.stringify(results.at(-1)));
      }
    }
    mkdirSync(resolve(root, 'evidence/live'), { recursive: true });
    writeFileSync(resolve(root, 'evidence/live/source-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
      chainId: 10143, deploymentCommit: manifest.commit, results }, null, 2) + '\n');
    return { confirmed: results.filter(item => item.status === 'verified').length, attempted: results.length,
      report: 'evidence/live/source-verification.json', sourceVerificationIsNonBlocking: true };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (isMain(import.meta.url)) await runCommand('Post-deploy source verification', main);
