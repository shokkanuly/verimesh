import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSigner, submitVerdict, getConfiguredDeploymentAddresses, TRIPWIRE_GUARDIAN_ABI, VERDICT_REGISTRY_ABI, type P256Signer } from '@horkos/sdk';
import { loadReplayFeed, type ReplayIncident } from './observers/replay.js';
import { processEvent } from './pipeline.js';
import { executeGuardianAction, type ExecutorOptions } from './executor.js';
import { getActiveTripwireModel, verifyTripwireBundle } from './score/model.js';

export interface ReplayOptions {
  signer: P256Signer;
  agentId: bigint;
  policyId: Hex;
  registryAddress: Address;
  chainId: number;
  incidents?: ReplayIncident[];
  executor?: ExecutorOptions;
}

export async function runReplay(options: ReplayOptions) {
  const model = getActiveTripwireModel();
  const results = [];
  for (const incident of options.incidents ?? loadReplayFeed()) {
    for (const event of incident.events) {
      const { verdict, bundle } = await processEvent(
        event, incident.features, options.agentId, options.policyId, model.hash,
        options.signer, options.chainId, options.registryAddress, model.version,
      );
      const report = verifyTripwireBundle(bundle);
      if (!report.valid) throw new Error(`Replay evidence failed verification: ${report.mismatches.join('; ')}`);
      let submitTxHash: Hex | undefined;
      let action: Awaited<ReturnType<typeof executeGuardianAction>> | undefined;
      if (options.executor) {
        const { walletClient, publicClient, account } = options.executor;
        const accepted = await submitVerdict(walletClient, publicClient, options.registryAddress, verdict, {
          r: bundle.signature.r, s: bundle.signature.s,
        }, account);
        if (accepted.verdictId.toLowerCase() !== bundle.verdictId.toLowerCase()) {
          throw new Error('Accepted verdict ID does not match replay digest');
        }
        submitTxHash = accepted.txHash;
        if (verdict.scoreBps >= 6500) {
          action = await executeGuardianAction(bundle.verdictId, options.agentId, options.executor);
        }
      }
      results.push({ incidentId: incident.id, bundle, submitTxHash, action });
    }
  }
  return results;
}

function requireKey(name: string): Hex {
  const key = process.env[name];
  if (!key || !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error(`Set ${name} to a testnet-only 32-byte key`);
  return key as Hex;
}

export async function runReplayCli(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: replay [--live] [--out directory]\nDefault: five deterministic synthetic incidents. --live submits five verdicts and three guardian actions to Monad testnet.');
    return;
  }
  const live = args.includes('--live');
  const outputIndex = args.indexOf('--out');
  if (outputIndex !== -1 && !args[outputIndex + 1]) throw new Error('--out requires a directory');
  const output = outputIndex === -1
    ? fileURLToPath(new URL('../../../evidence/replay/', import.meta.url)) : resolve(args[outputIndex + 1]);
  const deployment = JSON.parse(readFileSync(new URL('../../../deployments/monad-testnet.json', import.meta.url), 'utf8'));
  const addresses = live ? getConfiguredDeploymentAddresses(deployment) : null;
  if (live && !addresses) throw new Error('Horkos is not deployed; live replay is unavailable');
  if (addresses) {
    for (const [name, address] of Object.entries({
      VERDICT_REGISTRY_ADDRESS: addresses.VerdictRegistry,
      TRIPWIRE_GUARDIAN_ADDRESS: addresses.TripwireGuardianV2,
      ERC8004_IDENTITY_ADDRESS: addresses.ERC8004Identity,
    })) {
      if (process.env[name] && process.env[name]!.toLowerCase() !== String(address).toLowerCase()) {
        throw new Error(`${name} disagrees with deployments/monad-testnet.json; remove the obsolete override`);
      }
    }
  }
  // The offline domain is a tiny mock address, never a historical deployment.
  const registryAddress = addresses?.VerdictRegistry ?? '0x000000000000000000000000000000000000bEEF';
  const guardianAddress = addresses?.TripwireGuardianV2;
  const agentId = BigInt(process.env.SENTINEL_AGENT_ID || '2009');
  const policyId = (process.env.TRIPWIRE_POLICY_ID || '0x525d333562560ca0925ad5f53938a213d76d3de1867ee9bec81b5f298906cc7d') as Hex;
  // Offline fixtures derive an unfunded key in memory from a public label, never operator secrets.
  const signer = createSigner(live ? requireKey('SENTINEL_P256_PRIVATE_KEY')
    : keccak256(toHex('Horkos:offline-synthetic-replay:never-fund')));
  let executor: ExecutorOptions | undefined;
  let incidents: ReplayIncident[] | undefined;
  if (live) {
    if (!guardianAddress) throw new Error('Live replay requires an active guardian deployment');
    const chain = defineChain({
      id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: { default: { http: [deployment.rpcUrl] } },
    });
    const transport = http(process.env.MONAD_RPC_URL || deployment.rpcUrl);
    const account = privateKeyToAccount(requireKey('DEPLOYER_PRIVATE_KEY'));
    const publicClient = createPublicClient({ chain, transport });
    if (await publicClient.getChainId() !== chain.id) throw new Error('Live replay requires Monad testnet chain ID 10143');
    const [x, y, , active] = await publicClient.readContract({
      address: registryAddress, abi: VERDICT_REGISTRY_ABI, functionName: 'currentKey', args: [agentId],
    });
    const key = signer.publicKey();
    if (!active || x.toLowerCase() !== key.x.toLowerCase() || y.toLowerCase() !== key.y.toLowerCase()) {
      throw new Error('Sentinel key is not bound and active for this agent');
    }
    const model = getActiveTripwireModel();
    const trustedAgent = await publicClient.readContract({ address: guardianAddress, abi: TRIPWIRE_GUARDIAN_ABI, functionName: 'trustedAgents', args: [agentId] });
    const trustedModel = await publicClient.readContract({ address: guardianAddress, abi: TRIPWIRE_GUARDIAN_ABI, functionName: 'trustedModels', args: [model.hash] });
    const currentPolicy = await publicClient.readContract({ address: guardianAddress, abi: TRIPWIRE_GUARDIAN_ABI, functionName: 'policyId' });
    const tier = await publicClient.readContract({ address: guardianAddress, abi: TRIPWIRE_GUARDIAN_ABI, functionName: 'currentTier' });
    if (!trustedAgent || !trustedModel) throw new Error(`Seed the guardian with agent ${agentId} and model ${model.hash} before replay`);
    if (currentPolicy.toLowerCase() !== policyId.toLowerCase()) throw new Error('Guardian policy does not match replay policy');
    if (tier !== 0) throw new Error('Guardian has an active restriction; its owner must reset it before a new three-tier demo');
    const block = await publicClient.getBlock();
    incidents = loadReplayFeed({ observedAt: block.timestamp, nonce: BigInt(Date.now()) });
    executor = { publicClient, walletClient: createWalletClient({ account, chain, transport }), account, guardianAddress };
  }
  mkdirSync(output, { recursive: true });
  const results = await runReplay({ signer, agentId, policyId, registryAddress, chainId: 10143, incidents, executor });
  for (const result of results) {
    const path = resolve(output, `bundle-${result.incidentId}.json`);
    writeFileSync(path, JSON.stringify(result.bundle, null, 2) + '\n');
    console.log(`${live ? 'CONFIRMED' : 'OFFLINE'} ${result.incidentId}: ${result.bundle.verdict.scoreBps} bps | ${path}`);
    if (result.submitTxHash) {
      console.log(`${deployment.explorerUrl}/tx/${result.submitTxHash}`);
      if (result.action) console.log(`${deployment.explorerUrl}/tx/${result.action.txHash}`);
    }
  }
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({
    mode: live ? 'live' : 'offline', provenance: 'synthetic', model: getActiveTripwireModel(),
    results: results.map(({ incidentId, bundle, submitTxHash, action }) => ({
      incidentId, verdictId: bundle.verdictId, scoreBps: bundle.verdict.scoreBps, submitTxHash, action,
    })),
  }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n');
  if (!live) console.log('Offline replay verified signed evidence only. No verdict or guardian action was submitted onchain.');
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  runReplayCli().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
