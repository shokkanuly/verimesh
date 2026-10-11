import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeFunctionData } from 'viem';
import { createSigner } from '../packages/sdk/dist/index.js';
import { getActiveTripwireModel, loadReplayFeed, processEvent } from '../packages/sentinel/dist/index.js';
import { root, loadEnvironment, loadManifest, gitState, buildArtifacts, publicClient, requireCheck, equalHex, addressOf,
  explorerVerifier, isMain, runCommand } from './deployment-checks.mjs';
import { credentialContext, requireCredentials } from './deploy-preflight.mjs';
import { demoPreflight } from './demo-preflight.mjs';
import { runDemoScene, demoPlan } from './demo-scenes.mjs';
import { livePolicyId, nativeP256Address } from './demo-live-checks.mjs';
import { createShipWriter } from './ship-budget.mjs';

export async function main() {
  requireCheck(process.argv.slice(2).join(' ') === '--broadcast', 'ship:demo requires --broadcast; runs one authorized bridge replay and owner reset');
  const output = resolve(root, 'evidence/live/replay.json');
  requireCheck(!existsSync(output), 'A live replay is already recorded; do not overwrite or automatically repeat it');
  const env = loadEnvironment();
  const manifest = loadManifest();
  const model = getActiveTripwireModel();
  const credentials = credentialContext(root, env, model.hash);
  requireCredentials(credentials);
  const provenance = gitState(root, manifest.commit);
  const artifacts = buildArtifacts();
  const client = publicClient(manifest, env);
  const ready = await demoPreflight({ manifest, credentials, provenance, artifacts, client, verifyExplorer: explorerVerifier({}) });
  requireCheck(ready.ready, 'Combined deployment, seed and live-state checks failed');
  requireCheck(!(await client.getCode({ address: nativeP256Address }))?.replace(/^0x$/, ''), 'Native P256 address contains fallback code');
  const writer = await createShipWriter(env, client);
  const contract = name => ({ address: addressOf(manifest, name), abi: artifacts[name].abi });
  const registry = contract('VerdictRegistry');
  const guardian = contract('TripwireGuardianV2');
  const bridge = contract('MockBridge');
  const cap = BigInt(manifest.guardian.outflowCap);
  const plan = demoPlan(cap, 1);
  const gas = 500000n;
  const assertSource = () => {
    const current = gitState(root, manifest.commit);
    requireCheck(!current.dirty && current.head === provenance.head && current.contractsUnchanged,
      'Source changed during live replay; stop before the next transaction');
  };
  requireCheck(writer.spentWei() + gas * await client.getGasPrice() * 20n + plan.perRun + 10000000000000000n <= 2500000000000000000n,
    'STOP: the full replay cannot fit in the remaining total 2.5 MON allowance');
  const balance = await client.getBalance({ address: bridge.address });
  if (balance < plan.perRun) await writer.send({ label: 'fund:bridge', to: bridge.address, value: plan.perRun - balance });
  const signer = createSigner(env.SENTINEL_P256_PRIVATE_KEY);
  const sentinel = { chainId: 10143, agentId: BigInt(manifest.agent.agentId), registryAddress: registry.address,
    policyId: livePolicyId, model, publicKey: signer.publicKey(),
    verdictFor({ incident = 'freeze', observedAt, nonce }) {
      const entry = loadReplayFeed({ observedAt, nonce }).find(item => item.id === incident);
      requireCheck(!!entry, 'Unknown live replay scene');
      return processEvent({ ...entry.events[0], nonce }, entry.features, this.agentId, this.policyId, model.hash,
        signer, 10143, this.registryAddress, model.version);
    } };
  const staged = resolve(root, 'deployments/.pending/ship-replay.json');
  requireCheck(!existsSync(staged), 'A prior partial live replay exists; inspect it before any repeat');
  const calls = [];
  const writeGuard = async (request, label) => {
    assertSource();
    requireCheck(calls.length < 20 && equalHex(request.account.address, writer.deployer.address)
      && [registry.address, guardian.address, bridge.address].some(address => equalHex(address, request.address))
      && (request.value === undefined || request.value === 0n), 'Replay call is outside its approved contract/account scope');
    const expected = label.startsWith('reject:') || ['release:delay', 'release:freeze'].includes(label) ? 'reverted' : 'success';
    const { receipt } = await writer.send({ label, to: request.address,
      data: encodeFunctionData(request), gas, expected });
    calls.push(receipt.transactionHash);
    return receipt.transactionHash;
  };
  writeGuard.confirm = async ({ receipt, transaction }) => {
    const saved = writer.ledger.transactions.find(item => equalHex(item.txHash, receipt.transactionHash));
    requireCheck(saved && saved.status === receipt.status && transaction.gas === gas
      && receipt.blockHash === saved.blockHash, 'Replay receipt differs from the durable budget ledger');
  };
  const nonce = BigInt(`0x${randomBytes(8).toString('hex')}`) & (2n ** 63n - 1n);
  let scene;
  try {
    scene = await runDemoScene({ client, walletClient: { chain: writer.chain }, account: writer.deployer,
      registry, guardian, bridge, sentinel, recipient: writer.owner.address, cap, nonce, chainId: 10143, writeGuard,
      onProgress(current) { writeFileSync(staged, JSON.stringify({ mode: 'LIVE', inputProvenance: 'SYNTHETIC', ...current }, null, 2) + '\n', { mode: 0o600 }); } });
    requireCheck(scene.status === 'passed' && calls.length === 20, 'Live replay did not finish every scene');
  } finally {
    mkdirSync(resolve(root, 'evidence/live'), { recursive: true });
    if (existsSync(staged)) cpSync(staged, output);
  }
  for (const { incident, bundle } of scene.bundles) {
    writeFileSync(resolve(root, `evidence/live/bundle-${incident}.json`), JSON.stringify(bundle, null, 2) + '\n');
  }
  writeFileSync(output, JSON.stringify({ mode: 'LIVE', inputProvenance: 'SYNTHETIC', chainId: 10143,
    sourceCommit: provenance.head, deploymentCommit: manifest.commit, ...scene,
    transactions: writer.ledger.transactions.filter(item => calls.includes(item.txHash)),
    deployerSpentWei: writer.spentWei().toString(), budgetIncludesOwnerFunding: true,
    explorerLinks: calls.map(hash => `https://testnet.monadscan.com/tx/${hash}`),
    trustAssumption: 'One operator-controlled P256 signer. Feature inputs are synthetic; enforcement and receipts are live.' }, null, 2) + '\n');
  return { status: scene.status, calls: calls.length, verdicts: scene.incidents.length, mode: 'LIVE', inputProvenance: 'SYNTHETIC',
    report: 'evidence/live/replay.json', deployerSpentWei: writer.spentWei().toString(), checks: scene.checks };
}

if (isMain(import.meta.url)) await runCommand('Budgeted live replay', main);
