import { existsSync, lstatSync, realpathSync, readFileSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { keccak256, toHex } from 'viem';
import { root, contractNames, CheckError, requireCheck, equalHex, addressOf, validateManifest, validateRegistration, assertUndeployedManifest, checkProvenance, loadEnvironment, gitState, buildArtifacts, publicClient, constructorArgs, verifyDeployment, explorerVerifier, runCommand, isMain } from './deployment-checks.mjs';
import { credentialContext, requireCredentials } from './deploy-preflight.mjs';
import { doctor } from './doctor.mjs';
import { verifySeed } from './deploy-seed-check.mjs';

const candidatePath = directory => resolve(directory, 'deployments/.pending/candidate.json');
const manifestPath = directory => resolve(directory, 'deployments/monad-testnet.json');
const digest = text => keccak256(toHex(text));
const hash = value => typeof value === 'string' && /^0x[\da-fA-F]{64}$/.test(value);
const positiveUint = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && BigInt(value) < 2n ** 256n;
function stageContracts(stage) {
  requireCheck(stage === 'phase1' || stage === 'demo', 'Unknown public deployment stage');
  return stage === 'demo' ? [...contractNames, 'MockBridge'] : contractNames;
}

function onlyKeys(object, names) {
  requireCheck(object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).every(key => names.includes(key)), 'Manifest has unrecognized fields; publication/archive refused');
}

// Closed public schema: never carry through environment or raw Foundry payloads.
export function assertPublicManifest(manifest) {
  if (manifest?.stage === 'undeployed') {
    assertUndeployedManifest(manifest);
    return;
  }
  onlyKeys(manifest, ['chainId', 'network', 'rpcUrl', 'explorerUrl', 'contracts', 'commit', 'solc', 'deployer', 'agent', 'allowlists', 'owners', 'guardian', 'previousManifestHash', 'stage', 'seed']);
  requireCheck(manifest.chainId === 10143 && manifest.network === 'monad-testnet'
    && manifest.rpcUrl === 'https://testnet-rpc.monad.xyz' && manifest.explorerUrl === 'https://testnet.monadscan.com',
  'Manifest must use public Monad testnet metadata; private provider URLs are not publishable');
  onlyKeys(manifest.contracts, ['ERC8004Identity', ...contractNames, 'MockBridge']);
  for (const name of Object.keys(manifest.contracts)) {
    addressOf(manifest, name);
    if (typeof manifest.contracts[name] !== 'string') onlyKeys(manifest.contracts[name],
      [...contractNames, 'MockBridge'].includes(name) ? ['address', 'txHash', 'block', 'runtimeCodehash', 'constructorArgsHash'] : ['address']);
  }
  for (const name of ['ERC8004Identity', ...contractNames]) addressOf(manifest, name);
  if (manifest.commit !== undefined) {
    validateManifest(manifest);
    onlyKeys(manifest.agent, ['agentId', 'keyX', 'keyY', 'epoch', 'registration']);
    if (manifest.agent.registration) validateRegistration(manifest.agent.registration);
    onlyKeys(manifest.owners, ['agent', 'guardian', 'demo']);
    onlyKeys(manifest.allowlists, ['agents', 'models']);
    if (manifest.guardian) {
      onlyKeys(manifest.guardian, ['outflowCap']);
      requireCheck(positiveUint(manifest.guardian.outflowCap), 'Invalid public outflow cap');
    }
  } else {
    onlyKeys(manifest, ['chainId', 'network', 'rpcUrl', 'explorerUrl', 'contracts']);
    requireCheck(Object.values(manifest.contracts).every(value => typeof value === 'string'), 'Historical manifest must contain only address strings');
  }
  if (manifest.previousManifestHash !== undefined) requireCheck(hash(manifest.previousManifestHash), 'Invalid previous-manifest hash');
  if (manifest.stage !== undefined) {
    stageContracts(manifest.stage);
    requireCheck(manifest.stage !== 'phase1' || manifest.contracts.MockBridge === undefined, 'Phase 1 cannot include a bridge; prepare an explicit demo candidate');
    requireCheck(manifest.stage !== 'demo' || (manifest.contracts.MockBridge !== undefined && positiveUint(manifest.guardian?.outflowCap)),
      'Demo stage requires a confirmed bridge record and positive uint256 outflow cap');
  }
  if (manifest.seed !== undefined) {
    const actions = ['bindKey', 'setTrustedAgent', 'setTrustedModel', ...(manifest.contracts.MockBridge === undefined ? [] : ['configureBridge'])];
    requireCheck(Array.isArray(manifest.seed) && manifest.seed.length === actions.length, 'Public seed receipt list has the wrong number of actions');
    for (const [index, record] of manifest.seed.entries()) {
      onlyKeys(record, ['action', 'txHash', 'block']);
      requireCheck(record.action === actions[index] && hash(record.txHash)
        && Number.isSafeInteger(record.block) && record.block > 0, 'Public seed receipt record is invalid');
    }
  }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new CheckError('Deployment input could not be read as JSON; contents withheld'); }
}

function regularFile(path) {
  const stat = lstatSync(path);
  requireCheck(stat.isFile() && !stat.isSymbolicLink(), 'Deployment file must be regular, not a symlink');
}

function safeDirectory(directory, path, create = false) {
  const relative = path.slice(resolve(directory).length + 1);
  requireCheck(path.startsWith(`${resolve(directory)}/`) && !relative.includes('..'), 'Deployment path is outside the workspace');
  let current = resolve(directory);
  for (const part of relative.split('/')) {
    current = resolve(current, part);
    if (!existsSync(current)) {
      requireCheck(create, 'Deployment directory does not exist');
      mkdirSync(current);
    }
    const stat = lstatSync(current);
    requireCheck(stat.isDirectory() && !stat.isSymbolicLink(), 'Deployment directory must not be a symlink');
  }
  requireCheck(realpathSync(path) === resolve(realpathSync(directory), relative), 'Deployment directory escapes the workspace');
}

export function readCanonical(directory) {
  safeDirectory(directory, dirname(manifestPath(directory)));
  regularFile(manifestPath(directory));
  const text = readFileSync(manifestPath(directory), 'utf8');
  let manifest;
  try { manifest = JSON.parse(text); }
  catch { throw new CheckError('Canonical manifest is not valid JSON; contents withheld'); }
  assertPublicManifest(manifest);
  return { text, manifest, hash: digest(text) };
}

export function creationHashes(broadcast, stage = 'phase1') {
  const names = stageContracts(stage);
  requireCheck(Array.isArray(broadcast?.transactions) && broadcast.transactions.length === names.length,
    'Broadcast must contain exactly the intended stage creation transactions (not a dry run)');
  const hashes = {};
  for (const [index, transaction] of broadcast.transactions.entries()) {
    const name = names[index];
    requireCheck(transaction.contractName === name && transaction.transactionType === 'CREATE' && hash(transaction.hash),
      'Broadcast contains missing hashes or unexpected contracts/order');
    hashes[name] = transaction.hash;
  }
  requireCheck(new Set(Object.values(hashes).map(value => value.toLowerCase())).size === names.length, 'Broadcast repeats a creation hash');
  return hashes;
}

export function parsePrepareArguments(args) {
  requireCheck((args.length === 4 || args.length === 7) && args[0] === '--broadcast' && !!args[1]
    && args[2] === '--commit' && /^[\da-f]{40}$/.test(args[3]),
  'deploy:prepare requires --broadcast <Foundry run JSON> --commit <source SHA> [--demo --outflow-cap <uint256>]');
  const demo = args.length === 7;
  requireCheck(!demo || (args[4] === '--demo' && args[5] === '--outflow-cap' && positiveUint(args[6])),
    'Demo preparation requires --demo --outflow-cap <positive uint256 decimal string>');
  return { broadcastPath: args[1], sourceCommit: args[3], stage: demo ? 'demo' : 'phase1', outflowCap: demo ? args[6] : undefined };
}

export async function prepareCandidate({ base, broadcast, sourceCommit, configuration, artifacts, client, provenance, verifyExplorer, stage = 'phase1', outflowCap }) {
  assertPublicManifest(base.manifest);
  if (base.manifest.agent?.registration) requireCheck(base.manifest.agent.agentId === configuration.agentId
    && equalHex(base.manifest.agent.registration.owner, configuration.agentOwner), 'Prepared agent differs from confirmed registration');
  requireCheck(/^[\da-f]{40}$/.test(sourceCommit) && !provenance.dirty && (provenance.head === sourceCommit || provenance.contractsUnchanged),
    'Preparation requires clean, matching committed contract sources');
  const names = stageContracts(stage);
  requireCheck(stage === 'demo' ? positiveUint(outflowCap) : outflowCap === undefined, 'Only demo preparation accepts a required positive uint256 outflow cap');
  const hashes = creationHashes(broadcast, stage);
  const manifest = {
    chainId: 10143, network: 'monad-testnet', rpcUrl: base.manifest.rpcUrl, explorerUrl: base.manifest.explorerUrl,
    commit: sourceCommit, solc: '0.8.24', deployer: configuration.deployer, stage, previousManifestHash: base.hash,
    contracts: { ERC8004Identity: addressOf(base.manifest, 'ERC8004Identity') },
    agent: { agentId: configuration.agentId, keyX: configuration.publicKey.x, keyY: configuration.publicKey.y, epoch: 1,
      ...(base.manifest.agent?.registration ? { registration: base.manifest.agent.registration } : {}) },
    allowlists: { agents: [configuration.agentId], models: [configuration.modelHash] },
    owners: { agent: configuration.agentOwner, guardian: configuration.deployer, demo: configuration.deployer },
    ...(stage === 'demo' ? { guardian: { outflowCap } } : {}),
  };
  requireCheck(await client.getChainId() === 10143, 'RPC chain differs from Monad testnet');
  const block = await client.getBlock();
  for (const name of names) {
    const receipt = await client.getTransactionReceipt({ hash: hashes[name] });
    requireCheck(receipt.status === 'success' && receipt.contractAddress && receipt.blockNumber > 0n && receipt.blockNumber <= BigInt(Number.MAX_SAFE_INTEGER),
      `${name} creation receipt is missing or failed`);
    const code = await client.getCode({ address: receipt.contractAddress, blockNumber: block.number });
    requireCheck(typeof code === 'string' && code.length > 2, `${name} creation has no runtime code`);
    manifest.contracts[name] = { address: receipt.contractAddress, txHash: hashes[name], block: Number(receipt.blockNumber), runtimeCodehash: keccak256(code) };
  }
  for (const name of names) manifest.contracts[name].constructorArgsHash = keccak256(constructorArgs(manifest, name, artifacts[name]));
  assertPublicManifest(manifest);
  await verifyDeployment({ manifest, artifacts, client, provenance, verifyExplorer });
  return manifest;
}

export function saveCandidate(directory, manifest) {
  assertPublicManifest(manifest);
  requireCheck(equalHex(readCanonical(directory).hash, manifest.previousManifestHash), 'Canonical manifest changed during preparation; do not publish');
  safeDirectory(directory, dirname(candidatePath(directory)), true);
  let fd;
  try {
    fd = openSync(candidatePath(directory), 'wx', 0o600);
    writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
    fsyncSync(fd);
  } catch { throw new CheckError('Candidate could not be saved (existing candidates are never overwritten); contents withheld'); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function checkCandidateRoles(manifest, configuration) {
  requireCheck(equalHex(manifest.deployer, configuration.deployer) && equalHex(manifest.owners.guardian, configuration.deployer)
    && equalHex(manifest.owners.demo, configuration.deployer) && equalHex(manifest.owners.agent, configuration.agentOwner)
    && manifest.agent.agentId === configuration.agentId && equalHex(manifest.agent.keyX, configuration.publicKey.x)
    && equalHex(manifest.agent.keyY, configuration.publicKey.y) && manifest.allowlists.models.length === 1
    && equalHex(manifest.allowlists.models[0], configuration.modelHash), 'Candidate roles/key/agent/model differ from safe local credentials');
}

export async function verifyPreparedState({ manifest, artifacts, client, provenance, verifyExplorer, publicKey, modelHash, snapshot: providedSnapshot }) {
  assertPublicManifest(manifest);
  requireCheck((manifest.stage === 'phase1' || manifest.stage === 'demo') && hash(manifest.previousManifestHash), 'Only a prepared Phase 1 or demo candidate can be verified');
  checkProvenance(manifest, provenance);
  requireCheck(await client.getChainId() === manifest.chainId, 'RPC chain differs from Monad testnet');
  const snapshot = providedSnapshot ?? await client.getBlock();
  const verification = await verifyDeployment({ manifest, artifacts, client, provenance, verifyExplorer, snapshot });
  const state = await doctor({ manifest, artifacts, client, publicKey, modelHash, scope: manifest.stage, snapshot });
  const seed = await verifySeed({ manifest, client, snapshotBlock: snapshot.number, snapshotHash: snapshot.hash });
  return { verification, state, seed };
}

export async function publishCandidate({ directory = root, manifest, artifacts, client, provenance, verifyExplorer, publicKey, modelHash, write = false, assertInputsUnchanged = () => {} }) {
  assertPublicManifest(manifest);
  requireCheck((manifest.stage === 'phase1' || manifest.stage === 'demo') && hash(manifest.previousManifestHash), 'Only a prepared Phase 1 or demo candidate can be published');
  const previous = readCanonical(directory);
  requireCheck(equalHex(previous.hash, manifest.previousManifestHash), 'Canonical manifest changed since preparation; publication refused');
  requireCheck(equalHex(addressOf(previous.manifest, 'ERC8004Identity'), addressOf(manifest, 'ERC8004Identity')), 'Candidate identity differs from the canonical identity');
  const { verification, state, seed } = await verifyPreparedState({ manifest, artifacts, client, provenance, verifyExplorer, publicKey, modelHash });
  const publishedManifest = { ...manifest, seed };
  assertPublicManifest(publishedManifest);
  assertInputsUnchanged();
  requireCheck(equalHex(readCanonical(directory).hash, previous.hash), 'Canonical manifest changed during verification; publication refused');
  if (!write) return { published: false, dryRun: true, verification, state, seed, transactionsBroadcast: 0 };

  safeDirectory(directory, dirname(candidatePath(directory)), true);
  const lock = resolve(directory, 'deployments/.pending/publish.lock');
  const temporary = resolve(directory, 'deployments/.pending/manifest.tmp');
  let lockFd;
  let tempFd;
  let temporaryCreated = false;
  try {
    lockFd = openSync(lock, 'wx', 0o600);
    requireCheck(equalHex(readCanonical(directory).hash, previous.hash), 'Canonical manifest changed before atomic replacement');
    assertInputsUnchanged();
    safeDirectory(directory, resolve(directory, 'deployments/archive'), true);
    const suffix = previous.hash.slice(2);
    const archive = resolve(directory, `deployments/archive/${suffix}.json`);
    const notice = resolve(directory, `deployments/archive/${suffix}.DEPRECATED.md`);
    const noticeText = '# Deprecated Deployment\n\nArchived for historical evidence only. Do not deploy, seed, or run live demos using these addresses.\n';
    const archiveEntries = [[archive, previous.text], [notice, noticeText]];
    for (const [path, text] of archiveEntries) {
      if (existsSync(path)) { regularFile(path); requireCheck(readFileSync(path, 'utf8') === text, 'Existing deployment archive differs; overwrite refused'); }
      else writeFileSync(path, text, { flag: 'wx', mode: 0o644 });
    }
    tempFd = openSync(temporary, 'wx', 0o600);
    temporaryCreated = true;
    writeFileSync(tempFd, `${JSON.stringify(publishedManifest, null, 2)}\n`);
    fsyncSync(tempFd);
    closeSync(tempFd); tempFd = undefined;
    assertInputsUnchanged([`deployments/archive/${suffix}.json`, `deployments/archive/${suffix}.DEPRECATED.md`]);
    for (const [path, text] of archiveEntries) {
      regularFile(path);
      requireCheck(readFileSync(path, 'utf8') === text, 'Deployment archive changed during publication');
    }
    requireCheck(equalHex(readCanonical(directory).hash, previous.hash), 'Canonical manifest changed before atomic replacement');
    renameSync(temporary, manifestPath(directory));
  } catch (error) {
    if (error instanceof CheckError) throw error;
    throw new CheckError('Atomic publication failed; diagnostics withheld. Inspect the public candidate/archives before retrying');
  } finally {
    if (tempFd !== undefined) closeSync(tempFd);
    if (temporaryCreated && existsSync(temporary)) unlinkSync(temporary);
    if (lockFd !== undefined) { closeSync(lockFd); unlinkSync(lock); }
  }
  return { published: true, dryRun: false, verification, state, seed, transactionsBroadcast: 0,
    next: manifest.stage === 'demo' ? 'Commit the public manifest/archive, then run demo:preflight before separately authorized live actions.'
      : 'Commit the public manifest/archive before rerunning verify:deployment and doctor --phase1. Full demo readiness still requires F-20.' };
}

export async function main() {
  const [mode, ...args] = process.argv.slice(2);
  requireCheck(mode === 'prepare' || mode === 'publish', 'Use deploy:prepare or deploy:publish; neither sends transactions');
  const preparation = mode === 'prepare' ? parsePrepareArguments(args) : undefined;
  if (mode === 'publish') requireCheck(args.length === 0 || (args.length === 1 && args[0] === '--write'), 'deploy:publish accepts only --write; default is verification-only');
  const env = loadEnvironment();
  const { getActiveTripwireModel } = await import('../packages/sentinel/dist/score/model.js');
  const configuration = requireCredentials(credentialContext(root, env, getActiveTripwireModel().hash));
  const base = readCanonical(root);
  const client = publicClient(base.manifest, env);
  if (mode === 'prepare') {
    const provenance = gitState(root, preparation.sourceCommit);
    requireCheck(!provenance.dirty && provenance.contractsUnchanged, 'Preparation requires clean, matching committed contract sources');
    const manifest = await prepareCandidate({ base, broadcast: readJson(resolve(preparation.broadcastPath)), ...preparation, configuration,
      artifacts: buildArtifacts(), client, provenance, verifyExplorer: explorerVerifier(env) });
    const finalProvenance = gitState(root, preparation.sourceCommit);
    requireCheck(!finalProvenance.dirty && finalProvenance.contractsUnchanged, 'Contract sources changed during preparation');
    saveCandidate(root, manifest);
    return { prepared: true, stage: manifest.stage, candidate: 'deployments/.pending/candidate.json', published: false, seeded: false, demoReady: false, transactionsBroadcast: 0 };
  }
  safeDirectory(root, dirname(candidatePath(root)));
  regularFile(candidatePath(root));
  const manifest = readJson(candidatePath(root));
  assertPublicManifest(manifest);
  checkCandidateRoles(manifest, configuration);
  const candidateText = readFileSync(candidatePath(root), 'utf8');
  const assertInputsUnchanged = (publicationArtifacts = []) => {
    requireCheck(readFileSync(candidatePath(root), 'utf8') === candidateText, 'Candidate changed during verification; publication refused');
    const provenance = gitState(root, manifest.commit, publicationArtifacts);
    requireCheck(!provenance.dirty && provenance.contractsUnchanged, 'Contract sources changed during verification; publication refused');
  };
  return publishCandidate({ manifest, directory: root, artifacts: buildArtifacts(), client, provenance: gitState(root, manifest.commit), assertInputsUnchanged,
    publicKey: configuration.publicKey, modelHash: configuration.modelHash, write: args.length === 1,
    verifyExplorer: async (...values) => {
      assertInputsUnchanged();
      await explorerVerifier(env)(...values);
    } });
}

if (isMain(import.meta.url)) await runCommand('Deployment workflow', main);
