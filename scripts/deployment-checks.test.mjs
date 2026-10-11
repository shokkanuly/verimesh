import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { encode } from 'cborg';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, encodeEventTopics, encodeFunctionData, getAddress, keccak256, parseAbi, toHex, zeroAddress } from 'viem';
import { contractNames, deploymentContractNames, CheckError, validateManifest, assertUndeployedManifest, loadEnvironment, checkProvenance, runtimeBody, compareRuntime, constructorArgs, assertExplorerSource, explorerVerifier, verifyDeployment, gitState, root } from './deployment-checks.mjs';
import { doctor, replayAllowlists, sentinelPublicKey } from './doctor.mjs';
import { parseArguments, registrationFromReceipt, saveRegistration } from './deploy-seed.mjs';

// All chain responses in this file are synthetic unit fixtures, not live evidence.
const hash = name => keccak256(toHex(name));
const address = byte => getAddress(`0x${byte.repeat(20)}`);
const compiler = '0.8.24+commit.e11b9ed9';
function runtime(hashByte = 1, immutableByte = '00') {
  const metadata = encode({ ipfs: new Uint8Array(34).fill(hashByte), solc: Uint8Array.from([0, 8, 24]) });
  return `0x60${immutableByte.repeat(32)}${'61'.repeat(40)}${bytesToHex(metadata).slice(2)}${metadata.length.toString(16).padStart(4, '0')}`;
}
function fixture(withBridge = false) {
  const model = hash('synthetic-model');
  const manifest = {
    chainId: 10143, commit: 'a'.repeat(40), solc: '0.8.24', deployer: address('11'),
    contracts: { ERC8004Identity: address('12') },
    agent: { agentId: '7', keyX: hash('public-x'), keyY: hash('public-y'), epoch: 1 },
    allowlists: { agents: ['7'], models: [model] },
    owners: { agent: address('13'), guardian: address('11'), demo: address('11') },
    guardian: { outflowCap: '1000' },
  };
  const artifacts = {};
  const names = withBridge ? [...contractNames, 'MockBridge'] : contractNames;
  const constructorTypes = {
    VerdictRegistry: ['address'], TripwireGuardianV2: ['address', 'bytes32'],
    SimpleGate: ['address', 'uint256', 'bytes32', 'uint16', 'uint64'],
    MockBridge: ['address'],
  };
  for (const [index, name] of names.entries()) {
    artifacts[name] = {
      metadata: { compiler: { version: compiler } },
      abi: [{ type: 'constructor', inputs: constructorTypes[name].map(type => ({ type })) }],
      bytecode: { object: '0x60616062' },
      deployedBytecode: { object: runtime(), linkReferences: {}, immutableReferences: { 1: [{ start: 1, length: 32 }] } },
    };
    manifest.contracts[name] = {
      address: address((20 + index).toString(16)), txHash: hash(name), block: 70 + index,
      runtimeCodehash: keccak256(runtime()), constructorArgsHash: hash('temporary'),
    };
  }
  for (const name of names) manifest.contracts[name].constructorArgsHash = keccak256(constructorArgs(manifest, name, artifacts[name]));
  const blockHash = number => hash(`block-${number}`);
  const find = txHash => names.find(name => manifest.contracts[name].txHash === txHash);
  const client = {
    async getChainId() { return 10143; },
    async getBlock({ blockNumber = 100n } = {}) { return { number: blockNumber, hash: blockHash(blockNumber), timestamp: 10000n }; },
    async getTransactionReceipt({ hash: txHash }) {
      const record = manifest.contracts[find(txHash)];
      return { status: 'success', transactionHash: txHash, blockNumber: BigInt(record.block), blockHash: blockHash(record.block), contractAddress: record.address, from: manifest.deployer };
    },
    async getTransaction({ hash: txHash }) {
      const name = find(txHash);
      const record = manifest.contracts[name];
      return { hash: txHash, chainId: 10143, to: null, from: manifest.deployer, blockNumber: BigInt(record.block), blockHash: blockHash(record.block), input: `${artifacts[name].bytecode.object}${constructorArgs(manifest, name, artifacts[name]).slice(2)}` };
    },
    async getCode() { return runtime(); },
  };
  const context = { manifest, artifacts, client, provenance: { head: manifest.commit, dirty: false },
    async verifyExplorer(name, contractAddress, artifact, args) {
      assert.ok(contractAddress === manifest.contracts[name].address);
      assertExplorerSource({ status: '1', result: [{ SourceCode: 'contract Source {}', ABI: '[]', ContractName: name,
        CompilerVersion: `v${compiler}`, Proxy: '0', ConstructorArguments: args.slice(2) }] }, name, artifact, args);
    } };
  return context;
}

test('strict manifest refuses historical addresses without deployment provenance', () => {
  assert.throws(() => validateManifest({ chainId: 10143, contracts: {} }), /historical addresses/);
});
test('valid provenance permits evidence-only commits, but not changed contracts or a dirty tree', () => {
  const { manifest } = fixture();
  assert.doesNotThrow(() => checkProvenance(manifest, { head: manifest.commit, dirty: false }));
  assert.doesNotThrow(() => checkProvenance(manifest, { head: 'b'.repeat(40), dirty: false, contractsUnchanged: true }));
  assert.throws(() => checkProvenance(manifest, { head: 'b'.repeat(40), dirty: false }), /sources\/dependencies/);
  assert.throws(() => checkProvenance(manifest, { head: manifest.commit, dirty: true }), /dirty/);
});
test('manifest rejects wrong chain, duplicate addresses, malformed receipts and untyped agent IDs', () => {
  for (const change of [
    m => { m.chainId = 1; }, m => { m.contracts.SimpleGate.address = m.contracts.VerdictRegistry.address; },
    m => { m.contracts.VerdictRegistry.txHash = ''; }, m => { m.agent.agentId = 7; },
    m => { m.allowlists.agents = ['7', '7']; }, m => { m.deployer = undefined; },
  ]) {
    const { manifest } = fixture();
    change(manifest);
    assert.throws(() => validateManifest(manifest), CheckError);
  }
});
test('bytecode comparison masks only artifact immutables and decoded metadata', () => {
  const { artifacts } = fixture();
  assert.doesNotThrow(() => compareRuntime(artifacts.VerdictRegistry, runtime(2, 'ab')));
  assert.equal(runtimeBody(runtime()).length, 73);
  assert.throws(() => compareRuntime(artifacts.VerdictRegistry, runtime().replace(/^0x60/, '0x62')), /executable bytes/);
});
test('malformed metadata, compiler drift, overlap and out-of-range immutables fail closed', () => {
  assert.throws(() => runtimeBody('0x606060ffff'), /length/);
  assert.throws(() => runtimeBody('0x60ff0001'), /CBOR/);
  assert.throws(() => runtimeBody(runtime().replace('000818', '000819')), /compiler/);
  for (const ranges of [[{ start: 72, length: 32 }], [{ start: 1, length: 31 }], [{ start: 1, length: 32 }, { start: 1, length: 32 }]]) {
    const { artifacts } = fixture();
    artifacts.VerdictRegistry.deployedBytecode.immutableReferences = { 1: ranges };
    assert.throws(() => compareRuntime(artifacts.VerdictRegistry, runtime()), /immutable/);
  }
});
test('all three synthetic creation receipts, source builds and explorer records are checked', async () => {
  const result = await verifyDeployment(fixture());
  assert.equal(result.contracts.length, 3);
  assert.equal(result.checkedAtBlock, '100');
});
test('a recorded bridge requires confirmed provenance before any RPC access', async () => {
  const context = fixture(true);
  context.manifest.contracts.MockBridge = { address: context.manifest.contracts.MockBridge.address };
  context.client.getChainId = async () => { assert.fail('RPC must not be queried for incomplete provenance'); };
  await assert.rejects(verifyDeployment(context), /MockBridge lacks confirmed receipt/);
});
test('all four synthetic deployments are checked when a bridge is recorded', async () => {
  const context = fixture(true);
  const checked = [];
  const original = context.verifyExplorer;
  context.verifyExplorer = async (...args) => { checked.push(args[0]); await original(...args); };
  const result = await verifyDeployment(context);
  assert.deepEqual(deploymentContractNames(context.manifest), [...contractNames, 'MockBridge']);
  assert.deepEqual(checked, [...contractNames, 'MockBridge']);
  assert.equal(result.contracts.length, 4);
  assert.equal(result.contracts[3].address, context.manifest.contracts.MockBridge.address);
});
test('bridge aliases and a missing local bridge artifact cannot pass verification', async () => {
  const duplicate = fixture(true);
  duplicate.manifest.contracts.MockBridge.address = duplicate.manifest.contracts.VerdictRegistry.address;
  await assert.rejects(verifyDeployment(duplicate), /distinct/);
  const missing = fixture(true);
  delete missing.artifacts.MockBridge;
  await assert.rejects(verifyDeployment(missing), /Constructor ABI is unavailable/);
});
for (const failure of ['receipt', 'constructor', 'runtime', 'explorer']) {
  test(`bridge ${failure} drift cannot be bypassed by valid core contracts`, async () => {
    const context = fixture(true);
    const bridge = context.manifest.contracts.MockBridge;
    if (failure === 'receipt') {
      const original = context.client.getTransactionReceipt;
      context.client.getTransactionReceipt = async args => ({ ...await original(args),
        ...(args.hash === bridge.txHash ? { status: 'reverted' } : {}) });
    } else if (failure === 'constructor') {
      const original = context.client.getTransaction;
      context.client.getTransaction = async args => ({ ...await original(args),
        ...(args.hash === bridge.txHash ? { input: '0x60616062' } : {}) });
    } else if (failure === 'runtime') {
      const original = context.client.getCode;
      context.client.getCode = async args => args.address === bridge.address ? runtime().replace(/^0x60/, '0x62') : original(args);
    } else {
      const original = context.verifyExplorer;
      context.verifyExplorer = async (...args) => {
        assert.notEqual(args[0], 'MockBridge', 'Synthetic bridge explorer source missing');
        await original(...args);
      };
    }
    await assert.rejects(verifyDeployment(context), failure === 'receipt' ? /receipt/ : failure === 'constructor'
      ? /creation transaction/ : failure === 'runtime' ? /executable bytes/ : /bridge explorer source missing/);
  });
}
test('wrong RPC chain is rejected before reading any receipt', async () => {
  const context = fixture();
  context.client.getChainId = async () => 1;
  context.client.getTransactionReceipt = async () => { throw new Error('receipt must not be read'); };
  await assert.rejects(verifyDeployment(context), /RPC chain/);
});
for (const failure of ['status', 'contractAddress', 'transactionHash', 'blockNumber']) {
  test(`receipt ${failure} mismatch cannot prove deployment`, async () => {
    const context = fixture();
    const original = context.client.getTransactionReceipt;
    context.client.getTransactionReceipt = async args => ({ ...await original(args), [failure]: failure === 'blockNumber' ? 2n : failure === 'status' ? 'reverted' : hash('wrong') });
    await assert.rejects(verifyDeployment(context), /receipt/);
  });
}
test('constructor, deployer and canonical receipt block mismatches are rejected', async () => {
  for (const patch of [{ input: '0x' }, { from: address('ff') }, { to: address('ef') }, { chainId: 1 }, { blockHash: hash('noncanonical') }]) {
    const context = fixture();
    const original = context.client.getTransaction;
    context.client.getTransaction = async args => ({ ...await original(args), ...patch });
    await assert.rejects(verifyDeployment(context), /creation transaction/);
  }
  const context = fixture();
  context.manifest.contracts.SimpleGate.constructorArgsHash = hash('mismatched');
  await assert.rejects(verifyDeployment(context), /argument hash/);
});
test('changed full codehash and changed executable both fail', async () => {
  const context = fixture();
  context.client.getCode = async () => runtime(2, 'ab');
  await assert.rejects(verifyDeployment(context), /full runtime codehash/);
  context.client.getCode = async () => runtime().replace(/^0x60/, '0x62');
  await assert.rejects(verifyDeployment(context), /executable bytes/);
});
test('explorer API failure and unverified/mismatched source never become success', async () => {
  const { artifacts, manifest } = fixture();
  const name = 'VerdictRegistry';
  const artifact = artifacts[name];
  const args = constructorArgs(manifest, name, artifact);
  const good = { status: '1', result: [{ SourceCode: 'contract Source {}', ABI: '[]', ContractName: name, CompilerVersion: `v${compiler}`, Proxy: '0', ConstructorArguments: args.slice(2) }] };
  for (const patch of [{ SourceCode: '' }, { ContractName: 'Other' }, { Proxy: '1' }, { ConstructorArguments: '00' }, { CompilerVersion: 'v0.8.25' }]) {
    assert.throws(() => assertExplorerSource({ ...good, result: [{ ...good.result[0], ...patch }] }, name, artifact, args), /verification/);
  }
  const query = explorerVerifier({ ETHERSCAN_API_KEY: 'synthetic-api-credential' }, async () => { throw new Error('URL contains synthetic-api-credential'); });
  await assert.rejects(query(name, manifest.contracts[name].address, artifact, args), error => error instanceof CheckError && !error.message.includes('synthetic-api-credential'));
  const optional = await explorerVerifier({})(name);
  assert.equal(optional.status, 'not-verified');
  assert.equal(optional.provider, 'none');
});

function healthFixture() {
  const context = fixture(true);
  const { manifest, client } = context;
  context.publicKey = { x: manifest.agent.keyX, y: manifest.agent.keyY };
  context.modelHash = manifest.allowlists.models[0];
  const guardian = manifest.contracts.TripwireGuardianV2.address;
  client.values = {
    identityRegistry: manifest.contracts.ERC8004Identity,
    ownerOf: manifest.owners.agent, currentKey: [context.publicKey.x, context.publicKey.y, 1, true],
    horkos: manifest.contracts.VerdictRegistry.address, owner: manifest.owners.guardian,
    pendingOwner: `0x${'0'.repeat(40)}`, policyId: keccak256(toHex('TRIPWIRE_CIRCUIT_BREAKER_POLICY')),
    currentTier: 0, trustedAgents: true, trustedModels: true, bridge: manifest.contracts.MockBridge.address,
    outflowCap: 1000n, windowStartedAt: 0n, THROTTLE_WINDOW: 3600n, windowOutflow: 0n,
  };
  client.bridgeValues = { guardian, owner: manifest.owners.demo, pendingOwner: `0x${'0'.repeat(40)}` };
  client.readContract = async ({ address: target, functionName, blockNumber }) => {
    assert.equal(blockNumber, 100n);
    const values = target === manifest.contracts.MockBridge?.address ? client.bridgeValues : client.values;
    assert.ok(Object.hasOwn(values, functionName));
    return values[functionName];
  };
  client.logs = [
    { address: guardian, blockNumber: 73n, logIndex: 1, eventName: 'TrustedAgentSet', args: { agentId: 7n, trusted: true } },
    { address: guardian, blockNumber: 73n, logIndex: 2, eventName: 'TrustedModelSet', args: { modelHash: context.modelHash, trusted: true } },
  ];
  client.getLogs = async () => client.logs;
  client.getBalance = async ({ blockNumber }) => { assert.equal(blockNumber, 100n); return 10n ** 18n; };
  return context;
}
test('doctor checks intended synthetic state at one pinned block', async () => {
  const result = await doctor(healthFixture());
  assert.equal(result.epoch, 1);
  assert.equal(result.checkedAtBlock, '100');
});
for (const [name, value] of [
  ['guardian', address('ab')], ['owner', address('ab')], ['pendingOwner', address('ab')],
]) {
  test(`doctor refuses bridge ${name} drift`, async () => {
    const context = healthFixture();
    context.client.bridgeValues[name] = value;
    await assert.rejects(doctor(context), /Bridge/);
  });
}
test('doctor refuses a missing bridge ABI or an outflow cap outside uint256', async () => {
  const context = healthFixture();
  delete context.artifacts.MockBridge;
  await assert.rejects(doctor(context), /MockBridge artifact/);
  const overflow = healthFixture();
  overflow.manifest.guardian.outflowCap = (1n << 256n).toString();
  await assert.rejects(doctor(overflow), /positive uint256/);
});
for (const [name, value] of [
  ['ownerOf', address('ab')], ['owner', address('ab')], ['pendingOwner', address('ab')],
  ['currentTier', 3], ['trustedAgents', false], ['trustedModels', false],
  ['bridge', address('ab')], ['outflowCap', 2000n], ['identityRegistry', address('ab')],
  ['horkos', address('ab')], ['policyId', hash('wrong-policy')],
]) {
  test(`doctor refuses ${name} drift`, async () => {
    const context = healthFixture();
    context.client.values[name] = value;
    await assert.rejects(doctor(context), CheckError);
  });
}
test('doctor rejects inactive, stale-epoch or mismatched signing keys', async () => {
  for (const patch of [
    [hash('wrong-key'), hash('public-y'), 1, true], [hash('public-x'), hash('public-y'), 2, true], [hash('public-x'), hash('public-y'), 1, false],
  ]) {
    const context = healthFixture();
    context.client.values.currentKey = patch;
    await assert.rejects(doctor(context), /key/);
  }
});
test('trust history detects extra entries and respects later removal', async () => {
  const context = healthFixture();
  const log = { ...context.client.logs[0], logIndex: 3, args: { agentId: 8n, trusted: true } };
  context.client.logs.push(log);
  await assert.rejects(doctor(context), /extra allowlisted/);
  context.client.logs.push({ ...log, logIndex: 4, args: { agentId: 8n, trusted: false } });
  await assert.doesNotReject(doctor(context));
  assert.deepEqual(replayAllowlists([...context.client.logs].reverse()).agents, ['7']);
});
test('missing trust history and wrong-address RPC logs are rejected', async () => {
  const context = healthFixture();
  context.client.logs = [];
  await assert.rejects(doctor(context), /trust history/);
  context.client.logs = [{ address: address('ab'), blockNumber: 74n }];
  await assert.rejects(doctor(context), /outside/);
});
test('doctor refuses missing bridge, no code, low funds and leftover throttle activity', async () => {
  let context = healthFixture();
  delete context.manifest.contracts.MockBridge;
  await assert.rejects(doctor(context), /F-20/);
  context = healthFixture();
  context.client.getCode = async () => '0x';
  await assert.rejects(doctor(context), /no deployed code/);
  context = healthFixture();
  context.client.getBalance = async () => 0n;
  await assert.rejects(doctor(context), /0.1 testnet MON/);
  context = healthFixture();
  context.client.values.windowStartedAt = 9999n;
  context.client.values.windowOutflow = 1n;
  await assert.rejects(doctor(context), /leftover/);
});
test('explicit RPC errors propagate and reorganized snapshots fail', async () => {
  const context = healthFixture();
  context.client.readContract = async () => { throw new Error('unavailable RPC'); };
  await assert.rejects(doctor(context), /unavailable RPC/);
  const deployment = fixture();
  const original = deployment.client.getBlock;
  deployment.client.getBlock = async args => ({ ...await original(args), ...(args?.blockNumber === 100n ? { hash: hash('reorganized') } : {}) });
  await assert.rejects(verifyDeployment(deployment), /reorganized/);
});
test('public-key derivation keeps fresh unit-test private material out of diagnostics', () => {
  const secret = bytesToHex(p256.utils.randomSecretKey());
  const publicKey = sentinelPublicKey({ SENTINEL_P256_PRIVATE_KEY: secret });
  assert.ok(publicKey.x.length === 66 && publicKey.y.length === 66);
  assert.ok(!JSON.stringify(publicKey).includes(secret));
  assert.throws(() => sentinelPublicKey({ SENTINEL_P256_PRIVATE_KEY: 'private-value-must-not-appear' }), error => !error.message.includes('private-value-must-not-appear'));
});
function temporaryRepo(directory) {
  const git = args => {
    const result = spawnSync('git', ['-c', 'user.name=Horkos regression', '-c', 'user.email=regression@example.invalid', ...args], { cwd: directory, encoding: 'utf8' });
    assert.ok(result.status === 0, 'Temporary Git command failed; output withheld');
    return result.stdout.trim();
  };
  git(['init', '--quiet']);
  return git;
}

test('root dotenv is authoritative over inherited and contracts credentials', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-root-env-'));
  const inherited = process.env.DEPLOYER_PRIVATE_KEY;
  try {
    mkdirSync(resolve(directory, 'contracts'));
    writeFileSync(resolve(directory, '.env'), 'DEPLOYER_PRIVATE_KEY=root-only\nSENTINEL_AGENT_ID=42\n');
    writeFileSync(resolve(directory, 'contracts/.env'), 'DEPLOYER_PRIVATE_KEY=old-contract-value\nAGENT_OWNER_PRIVATE_KEY=stale-owner\n');
    process.env.DEPLOYER_PRIVATE_KEY = 'inherited-value';
    const env = loadEnvironment(directory);
    assert.equal(env.DEPLOYER_PRIVATE_KEY, 'root-only');
    assert.equal(env.SENTINEL_AGENT_ID, '42');
    assert.equal(env.AGENT_OWNER_PRIVATE_KEY, '');
  } finally {
    if (inherited === undefined) delete process.env.DEPLOYER_PRIVATE_KEY;
    else process.env.DEPLOYER_PRIVATE_KEY = inherited;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('deploy/seed command rejects broadcast, resume and unrecognized script arguments', () => {
  assert.deepEqual(parseArguments([]), { script: 'bootstrap' });
  assert.deepEqual(parseArguments(['--script', 'deploy']), { script: 'deploy' });
  for (const args of [['--broadcast'], ['--resume'], ['--script', 'unknown'], ['--script', 'bootstrap', '--broadcast']]) {
    assert.throws(() => parseArguments(args), /Broadcasting is not supported/);
  }
});

function registrationFixture() {
  const abi = parseAbi(['function register() returns (uint256)', 'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
  const identity = address('12');
  const owner = address('11');
  const txHash = hash('synthetic-registration');
  const blockHash = hash('synthetic-registration-block');
  const manifest = { chainId: 10143, network: 'monad-testnet', rpcUrl: 'https://testnet-rpc.monad.xyz',
    explorerUrl: 'https://testnet.monadscan.com', stage: 'undeployed', contracts: { ERC8004Identity: identity } };
  const receipt = { status: 'success', transactionHash: txHash, from: owner, blockNumber: 20n, blockHash,
    logs: [{ address: identity, data: '0x', topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from: zeroAddress, to: owner, tokenId: 42n } }) }] };
  const transaction = { hash: txHash, chainId: 10143, from: owner, to: identity, value: 0n, blockNumber: 20n, blockHash,
    input: encodeFunctionData({ abi, functionName: 'register' }) };
  const client = { async getChainId() { return 10143; }, async getTransactionReceipt() { return receipt; },
    async getTransaction() { return transaction; }, async readContract() { return owner; }, async getBlock() { return { hash: blockHash }; } };
  return { client, manifest, receipt, transaction, txHash, owner };
}

test('registration ID comes from one confirmed identity mint, never a simulation result', async () => {
  const context = registrationFixture();
  const agent = await registrationFromReceipt(context);
  assert.equal(agent.agentId, '42');
  assert.equal(agent.registration.txHash, context.txHash);
  for (const change of [
    c => { c.receipt.status = 'reverted'; }, c => { c.receipt.logs = []; },
    c => { c.receipt.logs.push(c.receipt.logs[0]); }, c => { c.transaction.to = address('13'); },
    c => { c.transaction.input = '0x'; }, c => { c.client.readContract = async () => address('13'); },
    c => { c.client.getBlock = async () => ({ hash: hash('reorganized') }); },
  ]) {
    const invalid = registrationFixture();
    change(invalid);
    await assert.rejects(registrationFromReceipt(invalid), CheckError);
  }
});

test('confirmed registration recording preserves undeployed stage and root secrets, and reruns safely', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-registration-'));
  try {
    const context = registrationFixture();
    const agent = await registrationFromReceipt(context);
    mkdirSync(resolve(directory, 'deployments'));
    writeFileSync(resolve(directory, 'deployments/monad-testnet.json'), JSON.stringify(context.manifest));
    writeFileSync(resolve(directory, '.env'), 'DEPLOYER_PRIVATE_KEY=retained-local-value\nSENTINEL_AGENT_ID=\n');
    saveRegistration(directory, agent);
    saveRegistration(directory, agent);
    const recorded = JSON.parse(readFileSync(resolve(directory, 'deployments/monad-testnet.json'), 'utf8'));
    assert.equal(recorded.stage, 'undeployed');
    assert.equal(recorded.agent.agentId, '42');
    assert.doesNotThrow(() => assertUndeployedManifest(recorded));
    assert.equal(readFileSync(resolve(directory, '.env'), 'utf8'), 'DEPLOYER_PRIVATE_KEY=retained-local-value\nSENTINEL_AGENT_ID=42\n');
    assert.equal(statSync(resolve(directory, '.env')).mode & 0o777, 0o600);
    const invalid = structuredClone(recorded);
    invalid.agent.registration.secret = 'private-value';
    assert.throws(() => assertUndeployedManifest(invalid), CheckError);
    assert.throws(() => saveRegistration(directory, { ...agent, agentId: '43' }), /different agent/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('actual commands reject a clean historical manifest without network access or operator keys', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-deployment-cli-'));
  try {
    mkdirSync(resolve(directory, 'scripts'));
    mkdirSync(resolve(directory, 'deployments'));
    symlinkSync(resolve(root, 'node_modules'), resolve(directory, 'node_modules'), 'dir');
    writeFileSync(resolve(directory, '.gitignore'), 'node_modules/\n');
    writeFileSync(resolve(directory, 'deployments/monad-testnet.json'), JSON.stringify({ chainId: 10143, contracts: {} }));
    for (const file of ['deployment-checks.mjs', 'verify-deployment.mjs', 'doctor.mjs']) cpSync(new URL(file, import.meta.url), resolve(directory, 'scripts', file));
    const git = temporaryRepo(directory);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'Synthetic historical manifest']);
    for (const file of ['verify-deployment.mjs', 'doctor.mjs']) {
      const result = spawnSync(process.execPath, [resolve(directory, 'scripts', file)], { cwd: directory, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /FAIL.*historical addresses/);
      assert.equal(result.stdout, '');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('real Git provenance detects source and dirty-tree drift, permitting evidence-only commits', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-provenance-'));
  try {
    const git = temporaryRepo(directory);
    mkdirSync(resolve(directory, 'contracts'));
    writeFileSync(resolve(directory, 'contracts/foundry.toml'), '[profile.default]\n');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'Synthetic build inputs']);
    const commit = git(['rev-parse', 'HEAD']);
    writeFileSync(resolve(directory, 'evidence.md'), 'Synthetic regression evidence\n');
    assert.ok(gitState(directory, commit).dirty);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'Synthetic evidence']);
    assert.ok(gitState(directory, commit).contractsUnchanged);
    const squashedCommit = 'e'.repeat(40);
    const contractsTree = git(['rev-parse', 'HEAD:contracts']);
    assert.throws(() => gitState(directory, squashedCommit), /tree proof is unavailable/);
    mkdirSync(resolve(directory, 'deployments'));
    writeFileSync(resolve(directory, 'deployments/source-tree.json'), JSON.stringify({
      deploymentCommit: squashedCommit, contractsTree, gitmodulesBlob: null,
    }));
    assert.ok(gitState(directory, squashedCommit).contractsUnchanged);
    assert.ok(gitState(directory, squashedCommit).dirty);
    assert.throws(() => gitState(directory, 'f'.repeat(40)), /tree proof is invalid/);
    const contractsSourceHash = keccak256(toHex(git(['ls-tree', '-r', '--full-tree', 'HEAD', '--', 'contracts', '.gitmodules'])));
    writeFileSync(resolve(directory, 'deployments/source-tree.json'), JSON.stringify({
      deploymentCommit: squashedCommit, contractsTree, contractsSourceHash, gitmodulesBlob: null,
    }));
    assert.ok(gitState(directory, squashedCommit).contractsUnchanged);
    mkdirSync(resolve(directory, 'contracts/test'));
    writeFileSync(resolve(directory, 'contracts/test/DeploymentSafety.t.sol'), 'Synthetic isolated test fixture\n');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'Synthetic approved fixture isolation']);
    assert.ok(gitState(directory, commit).contractsUnchanged);
    assert.ok(gitState(directory, squashedCommit).contractsUnchanged);
    writeFileSync(resolve(directory, 'contracts/foundry.toml'), '[profile.default]\noptimizer = true\n');
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'Synthetic compiler drift']);
    assert.ok(!gitState(directory, commit).contractsUnchanged);
    assert.ok(!gitState(directory, squashedCommit).contractsUnchanged);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
