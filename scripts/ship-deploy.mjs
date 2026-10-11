import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { encodeDeployData, encodeFunctionData, parseAbi, keccak256, toHex } from 'viem';
import { root, requireCheck, loadEnvironment, gitState, buildArtifacts, publicClient, addressOf, explorerVerifier, runCommand, isMain, equalHex } from './deployment-checks.mjs';
import { credentialContext, requireCredentials, preflight } from './deploy-preflight.mjs';
import { registrationFromReceipt, saveRegistration } from './deploy-seed.mjs';
import { readCanonical, prepareCandidate, saveCandidate, publishCandidate, checkCandidateRoles } from './deploy-workflow.mjs';
import { getActiveTripwireModel } from '../packages/sentinel/dist/score/model.js';
import { createShipWriter } from './ship-budget.mjs';

function commitManifest(message) {
  for (const args of [['add', 'deployments/monad-testnet.json'], ['commit', '-m', message]]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    requireCheck(result.status === 0, 'Public manifest commit failed; no further transactions sent');
  }
}

async function finalizeDeployment({ manifest, artifacts, client, configuration, writer }) {
  checkCandidateRoles(manifest, configuration);
  const sourceCommit = manifest.commit;
  const published = await publishCandidate({ manifest, directory: root, artifacts, client, provenance: gitState(root, sourceCommit),
    verifyExplorer: explorerVerifier({}), publicKey: configuration.publicKey, modelHash: configuration.modelHash, write: true,
    assertInputsUnchanged(paths = []) { requireCheck(!gitState(root, sourceCommit, paths).dirty, 'Source changed during deployment publication'); } });
  const canonical = readCanonical(root).manifest;
  mkdirSync(resolve(root, 'evidence/live'), { recursive: true });
  writeFileSync(resolve(root, 'evidence/live/deployment.json'), JSON.stringify({ mode: 'LIVE', chainId: 10143,
    inputProvenance: 'single-signer operator configuration', ...writer.ledger, manifest: canonical }, null, 2) + '\n');
  for (const args of [['add', 'deployments/monad-testnet.json', 'deployments/archive', 'evidence/live/deployment.json'],
    ['commit', '-m', 'P2: publish receipt-confirmed Monad testnet deployment']]) {
    requireCheck(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).status === 0, 'Deployment evidence commit failed');
  }
  return { ...published, manifest: 'deployments/monad-testnet.json', budget: writer.spentWei().toString() };
}

export async function main() {
  const mode = process.argv.slice(2).join(' ');
  requireCheck(mode === '--broadcast' || mode === '--finalize', 'Use --broadcast to register/deploy/seed, or --finalize to verify and publish the saved candidate without sending transactions');
  let env = loadEnvironment();
  let base = readCanonical(root);
  requireCheck(base.manifest.stage === 'undeployed', 'Canonical manifest is already deployed; rerun refused');
  const modelHash = getActiveTripwireModel().hash;
  let credentials = credentialContext(root, env, modelHash, { allowRegistration: !base.manifest.agent });
  let configuration = requireCredentials(credentials);
  requireCheck(!equalHex(configuration.deployer, configuration.agentOwner), 'Use the distinct fresh agent-owner wallet');
  const client = publicClient(base.manifest, env);
  const ready = await preflight({ manifest: base.manifest, client, credentials, provenance: gitState(), forDeployment: true });
  requireCheck(ready.ready, 'Ship preflight failed');
  const writer = await createShipWriter(env, client);
  if (mode === '--finalize') {
    const manifest = JSON.parse(readFileSync(resolve(root, 'deployments/.pending/candidate.json'), 'utf8'));
    return finalizeDeployment({ manifest, artifacts: buildArtifacts(), client, configuration, writer });
  }
  if (!configuration.agentId) {
    const registration = await writer.send({ label: 'registerAgent', role: 'owner', to: addressOf(base.manifest, 'ERC8004Identity'),
      data: encodeFunctionData({ abi: parseAbi(['function register() returns (uint256)']), functionName: 'register' }) });
    const agent = await registrationFromReceipt({ client, manifest: base.manifest, txHash: registration.receipt.transactionHash, owner: configuration.agentOwner });
    saveRegistration(root, agent);
    commitManifest('P2: record confirmed ERC-8004 registration');
    env = loadEnvironment(); base = readCanonical(root);
    credentials = credentialContext(root, env, modelHash);
    configuration = requireCredentials(credentials);
  }
  const artifacts = buildArtifacts();
  const sourceCommit = gitState().head;
  const deployed = {};
  const broadcast = { transactions: [] };
  const constructors = {
    VerdictRegistry: () => [addressOf(base.manifest, 'ERC8004Identity')],
    TripwireGuardianV2: () => [deployed.VerdictRegistry, keccak256(toHex('TRIPWIRE_CIRCUIT_BREAKER_POLICY'))],
    SimpleGate: () => [deployed.VerdictRegistry, BigInt(configuration.agentId), keccak256(toHex('SIMPLE_GATE_POLICY')), 8000, 300n],
    MockBridge: () => [deployed.TripwireGuardianV2],
  };
  for (const name of ['VerdictRegistry', 'TripwireGuardianV2', 'SimpleGate', 'MockBridge']) {
    const previous = writer.ledger.transactions.find(item => item.label === `deploy:${name}`);
    requireCheck(!previous || previous.status === 'success', 'Failed deployment found; reconcile before isolated redeployment');
    const data = encodeDeployData({ abi: artifacts[name].abi, bytecode: artifacts[name].bytecode.object, args: constructors[name]() });
    const receipt = previous ? await client.getTransactionReceipt({ hash: previous.txHash })
      : (await writer.send({ label: `deploy:${name}`, data })).receipt;
    requireCheck(receipt.status === 'success' && receipt.contractAddress && (await client.getCode({ address: receipt.contractAddress }))?.length > 2,
      'Deployment receipt has no successful runtime code');
    deployed[name] = receipt.contractAddress;
    broadcast.transactions.push({ contractName: name, transactionType: 'CREATE', hash: receipt.transactionHash });
  }
  const manifest = await prepareCandidate({ base, broadcast, sourceCommit, configuration, artifacts, client,
    provenance: gitState(root, sourceCommit), verifyExplorer: explorerVerifier({}), stage: 'demo', outflowCap: '1000000000000000' });
  const actions = [
    ['bindKey', 'VerdictRegistry', [BigInt(configuration.agentId), configuration.publicKey.x, configuration.publicKey.y], 'owner'],
    ['setTrustedAgent', 'TripwireGuardianV2', [BigInt(configuration.agentId), true], 'deployer'],
    ['setTrustedModel', 'TripwireGuardianV2', [configuration.modelHash, true], 'deployer'],
    ['configureBridge', 'TripwireGuardianV2', [deployed.MockBridge, BigInt(manifest.guardian.outflowCap)], 'deployer'],
  ];
  for (const [name, target, args, role] of actions) {
    const previous = writer.ledger.transactions.find(item => item.label === `seed:${name}`);
    if (previous) requireCheck(previous.status === 'success', 'Failed seed found; reconcile before retrying');
    else await writer.send({ label: `seed:${name}`, role, to: deployed[target],
      data: encodeFunctionData({ abi: artifacts[target].abi, functionName: name, args }) });
  }
  saveCandidate(root, manifest);
  return finalizeDeployment({ manifest, artifacts, client, configuration, writer });
}

if (isMain(import.meta.url)) await runCommand('Ship deployment', main);
