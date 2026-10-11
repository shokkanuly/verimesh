import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { encode } from 'cborg';
import { p256 } from '@noble/curves/nist.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { privateKeyToAccount } from 'viem/accounts';
import { bytesToHex, getAddress, keccak256, toHex, parseAbi, encodeAbiParameters, encodeEventTopics, encodeFunctionData } from 'viem';
import { CheckError, contractNames, constructorArgs, gitState, requireCheck, root } from './deployment-checks.mjs';
import { sentinelPublicKey, doctor } from './doctor.mjs';
import { credentialReadiness, environmentBlockers, preflight } from './deploy-preflight.mjs';
import { assertPublicManifest, creationHashes, parsePrepareArguments, prepareCandidate, readCanonical, saveCandidate, checkCandidateRoles, publishCandidate } from './deploy-workflow.mjs';
import { verifySeed } from './deploy-seed-check.mjs';
import { demoPreflight } from './demo-preflight.mjs';

// Synthetic RPC fixtures only; no operator keys, network or transactions.
const hash = value => keccak256(toHex(value));
const address = byte => getAddress(`0x${byte.repeat(20)}`);
function credentials() {
  const env = {
    DEPLOYER_PRIVATE_KEY: bytesToHex(secp256k1.utils.randomSecretKey()),
    AGENT_OWNER_PRIVATE_KEY: bytesToHex(secp256k1.utils.randomSecretKey()),
    SENTINEL_P256_PRIVATE_KEY: bytesToHex(p256.utils.randomSecretKey()),
    SENTINEL_AGENT_ID: '7', CHAIN_ID: '10143', ETHERSCAN_API_KEY: 'synthetic-api-token',
  };
  const args = { env, exposedAddresses: [], fixtureKeys: [], modelHash: hash('synthetic-model') };
  return { args, result: credentialReadiness(args) };
}
function fixture(directory, stage = 'phase1') {
  const demo = stage === 'demo';
  const names = demo ? [...contractNames, 'MockBridge'] : contractNames;
  const { result: readiness } = credentials();
  const configuration = readiness.configuration;
  const legacy = { chainId: 10143, network: 'monad-testnet', rpcUrl: 'https://testnet-rpc.monad.xyz', explorerUrl: 'https://testnet.monadscan.com',
    contracts: { ERC8004Identity: address('10'), VerdictRegistry: address('11'), TripwireGuardianV2: address('12'), SimpleGate: address('13') } };
  if (directory) {
    mkdirSync(resolve(directory, 'deployments'));
    writeFileSync(resolve(directory, 'deployments/monad-testnet.json'), `${JSON.stringify(legacy, null, 2)}\n`);
  }
  const base = directory ? readCanonical(directory) : { manifest: legacy, hash: hash('synthetic-base') };
  const manifest = { ...legacy, commit: 'a'.repeat(40), solc: '0.8.24', deployer: configuration.deployer,
    previousManifestHash: base.hash, stage, contracts: { ERC8004Identity: legacy.contracts.ERC8004Identity },
    agent: { agentId: '7', keyX: configuration.publicKey.x, keyY: configuration.publicKey.y, epoch: 1 },
    allowlists: { agents: ['7'], models: [configuration.modelHash] },
    owners: { agent: configuration.agentOwner, guardian: configuration.deployer, demo: configuration.deployer },
    ...(demo ? { guardian: { outflowCap: '1000' } } : {}) };
  const metadata = encode({ solc: Uint8Array.from([0, 8, 24]) });
  const code = `0x6060${bytesToHex(metadata).slice(2)}${metadata.length.toString(16).padStart(4, '0')}`;
  const types = { VerdictRegistry: ['address'], TripwireGuardianV2: ['address', 'bytes32'], SimpleGate: ['address', 'uint256', 'bytes32', 'uint16', 'uint64'], MockBridge: ['address'] };
  const artifacts = {};
  for (const [index, name] of names.entries()) {
    artifacts[name] = { abi: [{ type: 'constructor', inputs: types[name].map(type => ({ type })) }], metadata: { compiler: { version: '0.8.24+commit.e11b9ed9' } },
      bytecode: { object: '0x6061' }, deployedBytecode: { object: code, immutableReferences: {}, linkReferences: {} } };
    manifest.contracts[name] = { address: address((32 + index).toString(16)), txHash: hash(name), block: 10 + index, runtimeCodehash: keccak256(code) };
  }
  for (const name of names) manifest.contracts[name].constructorArgsHash = keccak256(constructorArgs(manifest, name, artifacts[name]));
  const find = txHash => names.find(name => manifest.contracts[name].txHash === txHash);
  const seedAbi = parseAbi([
    'event AgentKeyBound(uint256 indexed agentId, uint32 indexed epoch, bytes32 x, bytes32 y)',
    'event TrustedAgentSet(uint256 indexed agentId, bool trusted)', 'event TrustedModelSet(bytes32 indexed modelHash, bool trusted)',
    'event BridgeConfigured(address indexed bridge, uint256 outflowCap)',
    'function bindKey(uint256 agentId, bytes32 x, bytes32 y)', 'function setTrustedAgent(uint256 agentId, bool trusted)', 'function setTrustedModel(bytes32 modelHash, bool trusted)',
    'function configureBridge(address bridge, uint256 outflowCap)',
  ]);
  const seeds = [
    { action: 'bindKey', eventName: 'AgentKeyBound', target: 'VerdictRegistry', owner: 'agent',
      args: { agentId: 7n, epoch: 1, x: configuration.publicKey.x, y: configuration.publicKey.y }, values: [7n, configuration.publicKey.x, configuration.publicKey.y] },
    { action: 'setTrustedAgent', eventName: 'TrustedAgentSet', target: 'TripwireGuardianV2', owner: 'guardian', args: { agentId: 7n, trusted: true }, values: [7n, true] },
    { action: 'setTrustedModel', eventName: 'TrustedModelSet', target: 'TripwireGuardianV2', owner: 'guardian', args: { modelHash: configuration.modelHash, trusted: true }, values: [configuration.modelHash, true] },
    ...(demo ? [{ action: 'configureBridge', eventName: 'BridgeConfigured', target: 'TripwireGuardianV2', owner: 'guardian',
      args: { bridge: manifest.contracts.MockBridge.address, outflowCap: 1000n }, values: [manifest.contracts.MockBridge.address, 1000n] }] : []),
  ].map((seed, index) => {
    const event = seedAbi.find(item => item.type === 'event' && item.name === seed.eventName);
    const params = event.inputs.filter(input => !input.indexed);
    return { ...seed, log: { eventName: seed.eventName, args: seed.args, address: manifest.contracts[seed.target].address,
      blockNumber: 20n, blockHash: hash('block-20'), logIndex: index + 1, transactionHash: hash(`seed-${seed.action}`),
      topics: encodeEventTopics({ abi: seedAbi, eventName: seed.eventName, args: seed.args }), data: encodeAbiParameters(params, params.map(input => seed.args[input.name])) } };
  });
  const client = {
    async getChainId() { return 10143; },
    async getBlock({ blockNumber = 100n } = {}) { return { number: blockNumber, hash: hash(`block-${blockNumber}`), timestamp: 10000n }; },
    async getCode() { return code; },
    async getTransactionReceipt({ hash: txHash }) {
      const seed = seeds.find(seed => seed.log.transactionHash === txHash);
      if (seed) return { status: 'success', transactionHash: txHash, from: manifest.owners[seed.owner], blockNumber: seed.log.blockNumber, blockHash: seed.log.blockHash, logs: [seed.log] };
      const record = manifest.contracts[find(txHash)];
      return { status: 'success', transactionHash: txHash, contractAddress: record.address, from: configuration.deployer, blockNumber: BigInt(record.block), blockHash: hash(`block-${record.block}`) };
    },
    async getTransaction({ hash: txHash }) {
      const seed = seeds.find(seed => seed.log.transactionHash === txHash);
      if (seed) return { hash: txHash, to: seed.log.address, from: manifest.owners[seed.owner], chainId: 10143, blockNumber: seed.log.blockNumber, blockHash: seed.log.blockHash,
        input: encodeFunctionData({ abi: seedAbi, functionName: seed.action, args: seed.values }) };
      const name = find(txHash);
      const record = manifest.contracts[name];
      return { hash: txHash, to: null, chainId: 10143, from: configuration.deployer, blockNumber: BigInt(record.block), blockHash: hash(`block-${record.block}`),
        input: `${artifacts[name].bytecode.object}${constructorArgs(manifest, name, artifacts[name]).slice(2)}` };
    },
    values: { ownerOf: configuration.agentOwner, identityRegistry: legacy.contracts.ERC8004Identity,
      currentKey: [configuration.publicKey.x, configuration.publicKey.y, 1, true], horkos: manifest.contracts.VerdictRegistry.address,
      owner: configuration.deployer, pendingOwner: address('00'), policyId: hash('TRIPWIRE_CIRCUIT_BREAKER_POLICY'),
      currentTier: 0, trustedAgents: true, trustedModels: true, bridge: demo ? manifest.contracts.MockBridge.address : address('00'),
      outflowCap: 1000n, windowStartedAt: 0n, THROTTLE_WINDOW: 3600n, windowOutflow: 0n },
    bridgeValues: { guardian: manifest.contracts.TripwireGuardianV2.address, owner: configuration.deployer, pendingOwner: address('00') },
    async readContract({ address: target, functionName, blockNumber }) {
      assert.equal(blockNumber, 100n);
      return (target === manifest.contracts.MockBridge?.address ? this.bridgeValues : this.values)[functionName];
    },
    async getLogs({ event, events, fromBlock = 0n, toBlock = 100n }) {
      return seeds.filter(seed => event ? seed.eventName === event.name : events?.some(item => item.name === seed.eventName))
        .map(seed => seed.log).filter(log => log.blockNumber >= fromBlock && log.blockNumber <= toBlock);
    },
    async getBalance() { return 10n ** 18n; }, async getTransactionCount() { return 0; },
  };
  return { directory, base, manifest, client, artifacts, configuration, credentials: readiness, seeds, stage, outflowCap: demo ? '1000' : undefined,
    provenance: { head: manifest.commit, dirty: false }, sourceCommit: manifest.commit, publicKey: configuration.publicKey, modelHash: configuration.modelHash,
    broadcast: { transactions: names.map(name => ({ contractName: name, transactionType: 'CREATE', hash: manifest.contracts[name].txHash })) },
    async verifyExplorer() {} };
}
async function temporary(action, stage = 'phase1') {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-publish-'));
  try { await action(fixture(directory, stage)); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('credential validation returns public roles only; diagnostics never echo private values', () => {
  const { args, result } = credentials();
  assert.deepEqual(result.blockers, []);
  assert.equal(result.configuration.deployer, privateKeyToAccount(args.env.DEPLOYER_PRIVATE_KEY).address);
  assert.deepEqual(result.configuration.publicKey, sentinelPublicKey(args.env));
  for (const secret of [args.env.DEPLOYER_PRIVATE_KEY, args.env.AGENT_OWNER_PRIVATE_KEY, args.env.SENTINEL_P256_PRIVATE_KEY, args.env.ETHERSCAN_API_KEY]) {
    assert.ok(!JSON.stringify(result).includes(secret), 'Credential leaked in public output');
  }
  const invalid = credentialReadiness({ ...args, env: { ...args.env, DEPLOYER_PRIVATE_KEY: 'sensitive-value' } });
  assert.ok(invalid.blockers.length > 0);
  assert.ok(!JSON.stringify(invalid).includes('sensitive-value'));
});
test('known exposed wallet, P256 fixture, missing owner and stale public configuration are blocked', () => {
  const { args, result } = credentials();
  const unsafe = credentialReadiness({ ...args, exposedAddresses: [result.configuration.deployer], fixtureKeys: [result.configuration.publicKey] });
  assert.equal(unsafe.blockers.length, 2);
  assert.equal(unsafe.configuration, undefined);
  const wrong = credentialReadiness({ ...args, env: { ...args.env, AGENT_OWNER_PRIVATE_KEY: '', SENTINEL_KEY_X: hash('wrong'), SCORER_MODEL_HASH: hash('stale'), CHAIN_ID: '1', ETHERSCAN_API_KEY: '' } });
  assert.equal(wrong.blockers.length, 4);
});
test('fresh registration preflight accepts an absent ID and explorer key, but never malformed IDs or redeploys', async () => {
  const { args } = credentials();
  const env = { ...args.env, SENTINEL_AGENT_ID: '', ETHERSCAN_API_KEY: '' };
  const readiness = credentialReadiness({ ...args, env, allowRegistration: true });
  assert.deepEqual(readiness.blockers, []);
  assert.ok(credentialReadiness({ ...args, env }).blockers.some(value => value.includes('SENTINEL_AGENT_ID')));
  assert.ok(credentialReadiness({ ...args, env: { ...env, SENTINEL_AGENT_ID: '-1' }, allowRegistration: true }).blockers.length);
  const context = fixture();
  context.manifest = { ...context.manifest, stage: 'undeployed' };
  delete context.manifest.agent;
  context.credentials = readiness;
  context.client.readContract = async () => assert.fail('No ownership query before registration');
  assert.equal((await preflight(context)).registrationRequired, true);
  context.manifest.stage = 'demo';
  context.forDeployment = true;
  await assert.rejects(preflight(context), /already deployed/);
});
test('tiny and repeated fixture scalars are rejected without their values in errors', () => {
  const { args } = credentials();
  for (const value of [`0x${'0'.repeat(63)}1`, `0x${'01'.repeat(32)}`]) {
    const result = credentialReadiness({ ...args, env: { ...args.env, DEPLOYER_PRIVATE_KEY: value, SENTINEL_P256_PRIVATE_KEY: value } });
    assert.equal(result.configuration, undefined);
    assert.ok(result.blockers.length >= 2);
    assert.ok(!JSON.stringify(result).includes(value), 'Fixture private value leaked');
  }
});
test('environment checks reject public-readable root files and symlinks, ignoring unused contracts dotenv', async () => {
  await temporary(async ({ directory }) => {
    mkdirSync(resolve(directory, 'contracts'));
    writeFileSync(resolve(directory, '.env'), 'SENTINEL_AGENT_ID=7\n', { mode: 0o644 });
    writeFileSync(resolve(directory, 'contracts/.env'), 'SENTINEL_AGENT_ID=8\n', { mode: 0o600 });
    assert.equal(environmentBlockers(directory, { SENTINEL_AGENT_ID: '7' }).length, 1);
    chmodSync(resolve(directory, '.env'), 0o600);
    assert.deepEqual(environmentBlockers(directory, { SENTINEL_AGENT_ID: '7' }), []);
    symlinkSync(resolve(directory, '.env'), resolve(directory, 'sentinel-p256.key'));
    assert.equal(environmentBlockers(directory, { SENTINEL_AGENT_ID: '7' }).length, 1);
  });
});
test('preflight fails before RPC when unsafe credentials or dirty source are present', async () => {
  const context = fixture();
  context.client.getChainId = async () => { throw new Error('must not contact RPC'); };
  context.credentials.blockers = ['unsafe credentials'];
  await assert.rejects(preflight(context), /unsafe credentials/);
  context.credentials.blockers = [];
  context.provenance.dirty = true;
  await assert.rejects(preflight(context), /dirty/);
});
test('preflight pins funding, ownership and nonce reads and returns a zero-broadcast report', async () => {
  const result = await preflight(fixture());
  assert.equal(result.ready, true);
  assert.equal(result.transactionsBroadcast, 0);
  assert.equal(result.wallets.length, 2);
});
for (const failure of ['chain', 'identity-code', 'owner', 'balance', 'pending', 'reorg']) {
  test(`preflight rejects ${failure}`, async () => {
    const context = fixture();
    if (failure === 'chain') context.client.getChainId = async () => 1;
    if (failure === 'identity-code') context.client.getCode = async () => '0x';
    if (failure === 'owner') context.client.values.ownerOf = address('ff');
    if (failure === 'balance') context.client.getBalance = async () => 0n;
    if (failure === 'pending') context.client.getTransactionCount = async args => args.blockTag === 'pending' ? 1 : 0;
    if (failure === 'reorg') {
      const original = context.client.getBlock;
      context.client.getBlock = async args => ({ ...await original(args), ...(args ? { hash: hash('reorg') } : {}) });
    }
    await assert.rejects(preflight(context), CheckError);
  });
}
test('receipt preparation uses only whitelisted public fields, ignoring raw broadcast secrets', async () => {
  const context = fixture();
  context.broadcast.privateKey = 'sensitive-value';
  const result = await prepareCandidate(context);
  assert.deepEqual(result, context.manifest);
  assert.ok(!JSON.stringify(result).includes('sensitive-value'));
  assert.doesNotThrow(() => checkCandidateRoles(result, context.configuration));
});
test('explicit undeployed configuration supports fresh preparation and receipt-verified publication', async () => {
  await temporary(async context => {
    const path = resolve(context.directory, 'deployments/monad-testnet.json');
    const undeployed = { ...context.base.manifest, stage: 'undeployed',
      contracts: { ERC8004Identity: context.base.manifest.contracts.ERC8004Identity } };
    const original = `${JSON.stringify(undeployed, null, 2)}\n`;
    writeFileSync(path, original);
    context.base = readCanonical(context.directory);
    context.manifest.previousManifestHash = context.base.hash;
    const candidate = await prepareCandidate(context);
    assert.deepEqual(candidate, context.manifest);
    const result = await publishCandidate({ ...context, manifest: candidate, write: true });
    assert.equal(result.published, true);
    assert.equal(readFileSync(resolve(context.directory, 'deployments/archive', `${context.base.hash.slice(2)}.json`), 'utf8'), original);
    assert.equal(readCanonical(context.directory).manifest.stage, 'phase1');
  });
});
test('undeployed configuration cannot hide addresses, receipts, secrets or a publishable candidate', async () => {
  const context = fixture();
  const undeployed = { ...context.base.manifest, stage: 'undeployed',
    contracts: { ERC8004Identity: context.base.manifest.contracts.ERC8004Identity } };
  assert.doesNotThrow(() => assertPublicManifest(undeployed));
  for (const manifest of [{ ...undeployed, contracts: {} },
    { ...undeployed, contracts: context.base.manifest.contracts },
    { ...undeployed, seed: [] }, { ...undeployed, privateKey: 'sensitive-value' },
    { ...undeployed, commit: context.manifest.commit }, { ...undeployed, rpcUrl: 'https://private.invalid/token' }]) {
    assert.throws(() => assertPublicManifest(manifest), CheckError);
  }
  context.client.getChainId = async () => { assert.fail('Undeployed configuration must not contact RPC'); };
  await assert.rejects(publishCandidate({ ...context, manifest: undeployed }), /Only a prepared/);
});
test('dry-run, missing/duplicate hashes, wrong creation order and dirty sources cannot prepare a candidate', async () => {
  const context = fixture();
  for (const transactions of [[], context.broadcast.transactions.map(tx => ({ ...tx, hash: null })), [...context.broadcast.transactions].reverse(), context.broadcast.transactions.map(tx => ({ ...tx, hash: hash('same') }))]) {
    assert.throws(() => creationHashes({ transactions }), CheckError);
  }
  context.provenance.dirty = true;
  await assert.rejects(prepareCandidate(context), /committed contract sources/);
});
test('failed receipts and explorer verification cannot produce prepared candidates', async () => {
  const context = fixture();
  context.client.getTransactionReceipt = async () => ({ status: 'reverted' });
  await assert.rejects(prepareCandidate(context), /receipt/);
  const explorerFailure = fixture();
  explorerFailure.verifyExplorer = async () => { throw new CheckError('Explorer unavailable'); };
  await assert.rejects(prepareCandidate(explorerFailure), /Explorer unavailable/);
});
test('candidate staging never alters canonical manifest or overwrites an existing candidate', async () => {
  await temporary(async context => {
    const before = readCanonical(context.directory).text;
    saveCandidate(context.directory, context.manifest);
    assert.equal(readCanonical(context.directory).text, before);
    assert.throws(() => saveCandidate(context.directory, context.manifest), /never overwritten/);
  });
});
test('phase1 doctor explicitly stays non-demo-ready and refuses a recorded or unrecorded bridge', async () => {
  const context = fixture();
  const result = await doctor({ ...context, scope: 'phase1' });
  assert.equal(result.demoReady, false);
  assert.equal(result.bridgePending, true);
  await assert.rejects(doctor(context), /F-20/);
  context.client.values.bridge = address('ef');
  await assert.rejects(doctor({ ...context, scope: 'phase1' }), /unrecorded bridge/);
  context.manifest.contracts.MockBridge = { address: address('ef') };
  await assert.rejects(doctor({ ...context, scope: 'phase1' }), /MockBridge lacks confirmed receipt/);
  context.manifest.contracts.MockBridge = { ...context.manifest.contracts.SimpleGate, address: address('ef') };
  await assert.rejects(doctor({ ...context, scope: 'phase1' }), /cannot bypass/);
});
test('bridge public records are strictly typed and cannot bypass phase1 publication', async () => {
  const context = fixture();
  context.manifest.contracts.MockBridge = { ...context.manifest.contracts.SimpleGate, address: address('ef') };
  context.manifest.guardian = { outflowCap: '1000' };
  assert.throws(() => assertPublicManifest(context.manifest), /Phase 1 cannot include a bridge/);
  delete context.manifest.stage;
  assert.doesNotThrow(() => assertPublicManifest(context.manifest));
  await assert.rejects(publishCandidate(context), /Only a prepared Phase 1 or demo candidate/);
  context.manifest.contracts.MockBridge.privateKey = 'sensitive-value';
  assert.throws(() => assertPublicManifest(context.manifest), /unrecognized/);
});
test('public outflow caps must fit uint256', () => {
  const context = fixture();
  context.manifest.guardian = { outflowCap: ((1n << 256n) - 1n).toString() };
  assert.doesNotThrow(() => assertPublicManifest(context.manifest));
  for (const value of ['0', '-1', '1.5', (1n << 256n).toString()]) {
    context.manifest.guardian.outflowCap = value;
    assert.throws(() => assertPublicManifest(context.manifest), /outflow cap/);
  }
});
test('publication default is read-only; explicit write archives, marks deprecated and replaces canonical JSON', async () => {
  await temporary(async context => {
    const before = readCanonical(context.directory).text;
    const result = await publishCandidate(context);
    assert.equal(result.published, false);
    assert.equal(readCanonical(context.directory).text, before);
    assert.deepEqual(readdirSync(resolve(context.directory, 'deployments')), ['monad-testnet.json']);
    const published = await publishCandidate({ ...context, write: true });
    assert.equal(published.published, true);
    assert.equal(published.state.demoReady, false);
    assert.deepEqual(readCanonical(context.directory).manifest, { ...context.manifest, seed: published.seed });
    const files = readdirSync(resolve(context.directory, 'deployments/archive'));
    assert.equal(files.length, 2);
    assert.equal(readFileSync(resolve(context.directory, 'deployments/archive', files.find(name => name.endsWith('.json'))), 'utf8'), before);
    assert.match(readFileSync(resolve(context.directory, 'deployments/archive', files.find(name => name.endsWith('.md'))), 'utf8'), /Deprecated/);
  });
});
for (const failure of ['receipt', 'explorer', 'seed-state', 'concurrent-edit', 'candidate-edit']) {
  test(`publication preserves canonical data on ${failure}`, async () => {
    await temporary(async context => {
      const path = resolve(context.directory, 'deployments/monad-testnet.json');
      const before = readFileSync(path, 'utf8');
      let expected = before;
      if (failure === 'receipt') context.client.getTransactionReceipt = async () => ({ status: 'reverted' });
      if (failure === 'explorer') context.verifyExplorer = async () => { throw new CheckError('Explorer mismatch'); };
      if (failure === 'seed-state') context.client.values.trustedModels = false;
      if (failure === 'concurrent-edit') context.verifyExplorer = async () => { expected = `${before}\n`; writeFileSync(path, expected); };
      if (failure === 'candidate-edit') context.assertInputsUnchanged = () => { throw new CheckError('Candidate changed'); };
      await assert.rejects(publishCandidate({ ...context, write: true }));
      assert.equal(readFileSync(path, 'utf8'), expected);
      assert.deepEqual(readdirSync(resolve(context.directory, 'deployments')), ['monad-testnet.json']);
    });
  });
}

test('prepare arguments require an explicit demo stage and exact positive uint256 cap', () => {
  const base = ['--broadcast', 'run.json', '--commit', 'a'.repeat(40)];
  assert.equal(parsePrepareArguments(base).stage, 'phase1');
  assert.deepEqual(parsePrepareArguments([...base, '--demo', '--outflow-cap', '1000']), {
    broadcastPath: 'run.json', sourceCommit: 'a'.repeat(40), stage: 'demo', outflowCap: '1000',
  });
  for (const args of [[], [...base, '--demo'], [...base, '--outflow-cap', '1000'],
    [...base, '--demo', '--outflow-cap', '0'], [...base, '--demo', '--outflow-cap', (1n << 256n).toString()],
    [...base, '--demo', '--outflow-cap', '1e3'], [...base, '--demo', '--demo', '1000'],
    [...base, '--demo', '--outflow-cap', '1000', '--write']]) {
    assert.throws(() => parsePrepareArguments(args), CheckError);
  }
});

test('demo preparation checks four creations and stages only public bridge/cap provenance', async () => {
  await temporary(async context => {
    context.broadcast.transactions[3].privateKey = 'sensitive-value';
    const before = readCanonical(context.directory).text;
    const manifest = await prepareCandidate(context);
    assert.deepEqual(manifest, context.manifest);
    assert.equal(manifest.stage, 'demo');
    assert.equal(manifest.guardian.outflowCap, '1000');
    assert.ok(!JSON.stringify(manifest).includes('sensitive-value'));
    saveCandidate(context.directory, manifest);
    assert.equal(readCanonical(context.directory).text, before);
    assert.throws(() => saveCandidate(context.directory, manifest), /never overwritten/);
  }, 'demo');
});

test('stage mixing, missing bridge creation, extra calls and invalid caps fail before RPC', async () => {
  const context = fixture(undefined, 'demo');
  assert.throws(() => creationHashes(context.broadcast), CheckError);
  assert.throws(() => creationHashes({ transactions: context.broadcast.transactions.slice(0, 3) }, 'demo'), CheckError);
  assert.throws(() => creationHashes({ transactions: [...context.broadcast.transactions].reverse() }, 'demo'), CheckError);
  assert.throws(() => creationHashes({ transactions: [...context.broadcast.transactions, { transactionType: 'CALL' }] }, 'demo'), CheckError);
  context.client.getChainId = async () => { assert.fail('Invalid preparation must stop before RPC'); };
  for (const outflowCap of [undefined, '0', '-1', '1.5', (1n << 256n).toString(), 1000]) {
    await assert.rejects(prepareCandidate({ ...context, outflowCap }), /positive uint256 outflow cap/);
  }
  await assert.rejects(prepareCandidate({ ...context, stage: 'phase1' }), /Only demo preparation/);
});

test('demo schemas require the bridge, cap and four ordered public seed records', async () => {
  const context = fixture(undefined, 'demo');
  const seeds = await verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') });
  assert.deepEqual(seeds.map(seed => seed.action), ['bindKey', 'setTrustedAgent', 'setTrustedModel', 'configureBridge']);
  context.manifest.seed = seeds;
  assert.doesNotThrow(() => assertPublicManifest(context.manifest));
  for (const change of [
    manifest => { delete manifest.contracts.MockBridge; }, manifest => { delete manifest.guardian; },
    manifest => { manifest.stage = 'unknown'; }, manifest => { manifest.seed.pop(); },
    manifest => { manifest.seed.reverse(); }, manifest => { manifest.seed[3].privateKey = 'sensitive-value'; },
  ]) {
    const manifest = structuredClone(context.manifest);
    change(manifest);
    assert.throws(() => assertPublicManifest(manifest), CheckError);
  }
});

test('demo publication defaults to no-write and atomically publishes four verified seed receipts', async () => {
  await temporary(async context => {
    const before = readCanonical(context.directory).text;
    const dry = await publishCandidate(context);
    assert.equal(dry.published, false);
    assert.equal(dry.verification.contracts.length, 4);
    assert.equal(dry.state.demoReady, true);
    assert.equal(dry.seed.length, 4);
    assert.equal(dry.seed[3].action, 'configureBridge');
    assert.equal(readCanonical(context.directory).text, before);
    const published = await publishCandidate({ ...context, write: true });
    assert.equal(published.transactionsBroadcast, 0);
    assert.deepEqual(readCanonical(context.directory).manifest, { ...context.manifest, seed: published.seed });
    const archive = readdirSync(resolve(context.directory, 'deployments/archive')).find(name => name.endsWith('.json'));
    assert.equal(readFileSync(resolve(context.directory, 'deployments/archive', archive), 'utf8'), before);
  }, 'demo');
});

test('a prepared demo can replace a verified Phase 1 manifest without losing its public archive', async () => {
  await temporary(async phase1 => {
    await publishCandidate({ ...phase1, write: true });
    const previous = readCanonical(phase1.directory);
    const context = fixture(undefined, 'demo');
    context.directory = phase1.directory;
    context.base = previous;
    context.manifest.previousManifestHash = previous.hash;
    assert.deepEqual(await prepareCandidate(context), context.manifest);
    await publishCandidate({ ...context, write: true });
    const archivePath = resolve(context.directory, `deployments/archive/${previous.hash.slice(2)}.json`);
    assert.equal(readFileSync(archivePath, 'utf8'), previous.text);
    assert.equal(readCanonical(context.directory).manifest.stage, 'demo');
    assert.equal(readdirSync(resolve(context.directory, 'deployments/archive')).length, 4);
  });
});

for (const failure of ['bridge-creation', 'bridge-explorer', 'missing-configuration', 'configuration-receipt', 'configuration-calldata', 'bridge-owner', 'cap', 'pending-owner', 'reorg', 'candidate-edit', 'concurrent-edit']) {
  test(`demo publication preserves the canonical manifest on ${failure}`, async () => {
    await temporary(async context => {
      const path = resolve(context.directory, 'deployments/monad-testnet.json');
      const before = readCanonical(context.directory).text;
      const bridgeHash = context.manifest.contracts.MockBridge.txHash;
      const configureHash = context.seeds[3].log.transactionHash;
      let expected = before;
      if (failure === 'bridge-creation' || failure === 'configuration-receipt') {
        const original = context.client.getTransactionReceipt;
        const failedHash = failure === 'bridge-creation' ? bridgeHash : configureHash;
        context.client.getTransactionReceipt = async args => ({ ...await original(args), ...(args.hash === failedHash ? { status: 'reverted' } : {}) });
      }
      if (failure === 'bridge-explorer') context.verifyExplorer = async name => { if (name === 'MockBridge') throw new CheckError('Synthetic bridge source failure'); };
      if (failure === 'missing-configuration') context.seeds.pop();
      if (failure === 'configuration-calldata') {
        const original = context.client.getTransaction;
        context.client.getTransaction = async args => ({ ...await original(args), ...(args.hash === configureHash ? { input: '0x' } : {}) });
      }
      if (failure === 'bridge-owner') context.client.bridgeValues.owner = address('ff');
      if (failure === 'cap') context.client.values.outflowCap = 999n;
      if (failure === 'pending-owner') context.client.bridgeValues.pendingOwner = address('ff');
      if (failure === 'reorg') {
        const original = context.client.getBlock;
        context.client.getBlock = async args => ({ ...await original(args), ...(args?.blockNumber === 100n ? { hash: hash('reorg') } : {}) });
      }
      if (failure === 'candidate-edit') context.assertInputsUnchanged = () => { throw new CheckError('Candidate changed'); };
      if (failure === 'concurrent-edit') context.verifyExplorer = async () => { expected = `${before}\n`; writeFileSync(path, expected); };
      await assert.rejects(publishCandidate({ ...context, write: true }), CheckError);
      assert.equal(readFileSync(path, 'utf8'), expected);
      assert.deepEqual(readdirSync(resolve(context.directory, 'deployments')), ['monad-testnet.json']);
    }, 'demo');
  });
}

test('publication pins source, bridge state and seed verification to one snapshot even as head advances', async () => {
  await temporary(async context => {
    let heads = 0;
    const original = context.client.getBlock;
    context.client.getBlock = async args => args ? original(args) : original({ blockNumber: 100n + BigInt(heads++) });
    const result = await publishCandidate(context);
    assert.equal(heads, 1);
    assert.equal(result.verification.checkedAtBlock, result.state.checkedAtBlock);
    assert.equal(result.verification.checkedAtBlockHash, result.state.checkedAtBlockHash);
  }, 'demo');
});

for (const failure of ['wrong-bridge', 'wrong-cap', 'wrong-owner', 'removed-log', 'missing-receipt-log', 'before-creation']) {
  test(`bridge configuration receipt verification rejects ${failure}`, async () => {
    const context = fixture(undefined, 'demo');
    const configuration = context.seeds[3];
    if (failure === 'wrong-bridge') configuration.log.args.bridge = address('ff');
    if (failure === 'wrong-cap') configuration.log.args.outflowCap = 999n;
    if (failure === 'removed-log') configuration.log.removed = true;
    if (failure === 'before-creation') context.manifest.contracts.MockBridge.block = 21;
    if (failure === 'wrong-owner' || failure === 'missing-receipt-log') {
      const original = context.client.getTransactionReceipt;
      context.client.getTransactionReceipt = async args => ({ ...await original(args),
        ...(args.hash === configuration.log.transactionHash ? (failure === 'wrong-owner' ? { from: address('ff') } : { logs: [] }) : {}) });
    }
    await assert.rejects(verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') }), CheckError);
  });
}

test('demo preflight requires published receipts and safe matching credentials before RPC', async () => {
  const context = fixture(undefined, 'demo');
  context.client.getChainId = async () => { assert.fail('Unsafe or unpublished input must stop before RPC'); };
  context.credentials.blockers = ['unsafe credentials'];
  await assert.rejects(demoPreflight(context), /unsafe credentials/);
  context.credentials.blockers = [];
  await assert.rejects(demoPreflight(context), /published four-contract/);
  context.manifest.seed = context.seeds.map(seed => ({ action: seed.action, txHash: seed.log.transactionHash, block: 20 }));
  context.manifest.owners.demo = address('ff');
  await assert.rejects(demoPreflight(context), /Candidate roles/);
  context.manifest.owners.demo = context.configuration.deployer;
  context.provenance.dirty = true;
  await assert.rejects(demoPreflight(context), /dirty/);
});

test('demo preflight verifies source, funding, state and all four published seed receipts without transactions', async () => {
  const context = fixture(undefined, 'demo');
  context.manifest.seed = await verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') });
  const result = await demoPreflight(context);
  assert.equal(result.ready, true);
  assert.equal(result.transactionsBroadcast, 0);
  assert.equal(result.verification.contracts.length, 4);
  assert.equal(result.state.demoReady, true);
  assert.equal(result.wallets.length, 2);
  context.manifest.seed[3].txHash = hash('different-published-receipt');
  await assert.rejects(demoPreflight(context), /Published seed receipts differ/);
});

test('demo preflight pins funding and deployment checks to the same block', async () => {
  const context = fixture(undefined, 'demo');
  context.manifest.seed = await verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') });
  let heads = 0;
  const original = context.client.getBlock;
  context.client.getBlock = async args => args ? original(args) : original({ blockNumber: 100n + BigInt(heads++) });
  const result = await demoPreflight(context);
  assert.equal(heads, 1);
  assert.equal(result.state.checkedAtBlock, '100');
  assert.equal(result.verification.checkedAtBlock, '100');
});

for (const failure of ['source', 'explorer', 'funding', 'pending', 'bridge-state', 'receipt', 'snapshot']) {
  test(`combined demo preflight cannot waive a ${failure} failure`, async () => {
    const context = fixture(undefined, 'demo');
    context.manifest.seed = await verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') });
    if (failure === 'source') context.provenance.head = 'b'.repeat(40);
    if (failure === 'explorer') context.verifyExplorer = async () => { throw new CheckError('Synthetic explorer failure'); };
    if (failure === 'funding') context.client.getBalance = async () => 0n;
    if (failure === 'pending') context.client.getTransactionCount = async args => args.blockTag === 'pending' ? 1 : 0;
    if (failure === 'bridge-state') context.client.bridgeValues.guardian = address('ff');
    if (failure === 'receipt') context.client.getTransactionReceipt = async () => ({ status: 'reverted' });
    if (failure === 'snapshot') {
      const original = context.client.getBlock;
      context.client.getBlock = async args => ({ ...await original(args), ...(args?.blockNumber === 100n ? { hash: hash('reorg') } : {}) });
    }
    await assert.rejects(demoPreflight(context), CheckError);
  });
}

test('late candidate changes cannot replace the canonical manifest', async () => {
  await temporary(async context => {
    const before = readCanonical(context.directory).text;
    let checks = 0;
    context.assertInputsUnchanged = () => { if (++checks === 3) throw new CheckError('Candidate changed before replacement'); };
    await assert.rejects(publishCandidate({ ...context, write: true }), /before replacement/);
    assert.equal(readCanonical(context.directory).text, before);
    assert.equal(readdirSync(resolve(context.directory, 'deployments/archive')).length, 2);
    assert.deepEqual(readdirSync(resolve(context.directory, 'deployments/.pending')), []);
  }, 'demo');
});

test('excluded publication archives are still checked for integrity before replacement', async () => {
  await temporary(async context => {
    const before = readCanonical(context.directory).text;
    context.assertInputsUnchanged = (publicationArtifacts = []) => {
      if (publicationArtifacts.length) writeFileSync(resolve(context.directory, publicationArtifacts[0]), 'tampered public archive\n');
    };
    await assert.rejects(publishCandidate({ ...context, write: true }), /archive changed during publication/);
    assert.equal(readCanonical(context.directory).text, before);
    assert.deepEqual(readdirSync(resolve(context.directory, 'deployments/.pending')), []);
  }, 'demo');
});

for (const sourceChanges of [false, true]) {
  test(`final Git publication guard allows only its own archives (source change: ${sourceChanges})`, async () => {
    await temporary(async context => {
      const git = args => {
        const result = spawnSync('git', ['-c', 'user.name=Horkos regression', '-c', 'user.email=regression@example.invalid', ...args],
          { cwd: context.directory, encoding: 'utf8' });
        assert.equal(result.status, 0, 'Temporary Git command failed; output withheld');
        return result.stdout.trim();
      };
      writeFileSync(resolve(context.directory, '.gitignore'), 'deployments/.pending/\n');
      mkdirSync(resolve(context.directory, 'contracts'));
      writeFileSync(resolve(context.directory, 'contracts/source.sol'), '// synthetic provenance fixture\n');
      git(['init', '--quiet']);
      git(['add', '.']);
      git(['commit', '--quiet', '-m', 'Synthetic publication fixture']);
      const commit = git(['rev-parse', 'HEAD']);
      context.manifest.commit = commit;
      context.provenance = gitState(context.directory, commit);
      const before = readCanonical(context.directory).text;
      context.assertInputsUnchanged = (publicationArtifacts = []) => {
        if (sourceChanges && publicationArtifacts.length) writeFileSync(resolve(context.directory, 'contracts/source.sol'), '// changed source\n');
        const provenance = gitState(context.directory, commit, publicationArtifacts);
        requireCheck(!provenance.dirty && provenance.contractsUnchanged, 'Source changed before replacement');
      };
      assert.throws(() => gitState(context.directory, commit, ['contracts/source.sol']), /Only exact public deployment archive/);
      if (sourceChanges) {
        await assert.rejects(publishCandidate({ ...context, write: true }), /Source changed/);
        assert.equal(readCanonical(context.directory).text, before);
      } else {
        assert.equal((await publishCandidate({ ...context, write: true })).published, true);
        assert.equal(readCanonical(context.directory).manifest.stage, 'demo');
      }
    }, 'demo');
  });
}

test('actual workflow and demo-preflight CLIs reject invalid flags before reading operator configuration', () => {
  for (const args of [
    ['scripts/deploy-workflow.mjs', 'prepare', '--demo'],
    ['scripts/deploy-workflow.mjs', 'publish', '--broadcast'],
    ['scripts/demo-preflight.mjs', '--broadcast'],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL/);
    assert.doesNotMatch(result.stderr, /Deployment blocked|PRIVATE_KEY|sensitive-value/);
  }
});
test('publication refuses secret-shaped extra fields, private RPC URLs, role drift and symlink targets', async () => {
  const context = fixture();
  assert.throws(() => assertPublicManifest({ ...context.manifest, privateKey: 'sensitive-value' }), /unrecognized/);
  assert.throws(() => assertPublicManifest({ ...context.manifest, rpcUrl: 'https://provider.invalid/sensitive-value' }), /public Monad/);
  assert.throws(() => checkCandidateRoles({ ...context.manifest, deployer: address('ff') }, context.configuration), /differ/);
  await temporary(async ctx => {
    const path = resolve(ctx.directory, 'deployments/monad-testnet.json');
    const target = resolve(ctx.directory, 'original.json');
    writeFileSync(target, readFileSync(path));
    rmSync(path);
    symlinkSync(target, path);
    await assert.rejects(publishCandidate({ ...ctx, write: true }), /symlink/);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), ctx.base.manifest);
  });
  await temporary(async ctx => {
    mkdirSync(resolve(ctx.directory, 'outside'));
    symlinkSync(resolve(ctx.directory, 'outside'), resolve(ctx.directory, 'deployments/archive'), 'dir');
    await assert.rejects(publishCandidate({ ...ctx, write: true }), /symlink/);
    assert.deepEqual(readCanonical(ctx.directory).manifest, ctx.base.manifest);
    assert.deepEqual(readdirSync(resolve(ctx.directory, 'outside')), []);
  });
});

test('seed verification captures canonical receipts from the intended owners and exact calldata', async () => {
  const context = fixture();
  const result = await verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') });
  assert.deepEqual(result.map(record => record.action), ['bindKey', 'setTrustedAgent', 'setTrustedModel']);
  assert.ok(result.every(record => record.block === 20));
});
for (const failure of ['missing-event', 'removed-log', 'wrong-log-address', 'reverted-receipt', 'wrong-owner', 'wrong-calldata', 'missing-receipt-log', 'reorg']) {
  test(`seed verification refuses ${failure}`, async () => {
    const context = fixture();
    if (failure === 'missing-event') context.client.getLogs = async () => [];
    if (failure === 'removed-log') context.seeds[0].log.removed = true;
    if (failure === 'wrong-log-address') context.seeds[0].log.address = address('ff');
    if (['reverted-receipt', 'wrong-owner', 'missing-receipt-log'].includes(failure)) {
      const original = context.client.getTransactionReceipt;
      context.client.getTransactionReceipt = async args => ({ ...await original(args),
        ...(failure === 'reverted-receipt' ? { status: 'reverted' } : failure === 'wrong-owner' ? { from: address('ff') } : { logs: [] }) });
    }
    if (failure === 'wrong-calldata') {
      const original = context.client.getTransaction;
      context.client.getTransaction = async args => ({ ...await original(args), input: '0x' });
    }
    if (failure === 'reorg') context.client.getBlock = async () => ({ number: 100n, hash: hash('reorg') });
    await assert.rejects(verifySeed({ ...context, snapshotBlock: 100n, snapshotHash: hash('block-100') }), CheckError);
  });
}
