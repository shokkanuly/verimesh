import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { encodeFunctionData, keccak256, toHex, parseAbi } from 'viem';
import { VERDICT_REGISTRY_ABI } from '../packages/sdk/dist/index.js';
import { createMockSentinel } from '../packages/testing/dist/index.js';
import { CheckError } from './deployment-checks.mjs';
import { confirmDemoReceipt, requireDemoEvent, runDemoScene } from './demo-scenes.mjs';
import { createLiveJournal, main, prepareLiveDemo, runLiveDemo } from './demo-live.mjs';
import { createLiveWriteGuard, liveBudget, liveGasLimit, livePolicyId, nativeP256Address, parseLiveArguments, waitForFreshWindow } from './demo-live-checks.mjs';

// Public synthetic RPC fixtures; no dotenv, operator keys, network or broadcasts.
const address = digit => `0x${digit.repeat(40)}`;
const hash = value => keccak256(toHex(String(value)));
const order = ['verdict:benign', 'release:benign', 'verdict:near-miss', 'release:near-miss',
  'verdict:throttle', 'action:throttle', 'release:throttle', 'release:throttle-to-cap', 'reject:cap-plus-one',
  'verdict:delay', 'action:delay', 'release:delay', 'verdict:freeze', 'action:freeze', 'release:freeze',
  'reject:tampered-signature', 'reject:duplicate-verdict', 'reject:consumed-action', 'owner:reset', 'release:after-reset'];
const cliArgs = () => ['--recipient', address('b'), '--max-transfer-wei', '24', '--max-gas-wei', '120000000'];
const ready = async () => ({ ready: true, transactionsBroadcast: 0, state: { checkedAtBlock: '10', checkedAtBlockHash: hash('block') } });

function fixture(runs = 1) {
  const options = { recipient: address('b'), maxTransferWei: runs === 1 ? '8' : '24', maxGasWei: String(40000000 * runs),
    runs, broadcast: true, allowOwnerReset: true, waitWindows: runs === 3 };
  const configuration = { deployer: address('a'), agentOwner: address('b'), agentId: '7',
    publicKey: { x: hash('x'), y: hash('y') }, modelHash: hash('model') };
  const manifest = { chainId: 10143, network: 'monad-testnet', rpcUrl: 'https://testnet-rpc.monad.xyz', explorerUrl: 'https://testnet.monadscan.com',
    commit: 'a'.repeat(40), solc: '0.8.24', deployer: configuration.deployer, stage: 'demo', previousManifestHash: hash('previous'),
    contracts: { ERC8004Identity: address('1') },
    agent: { agentId: '7', keyX: configuration.publicKey.x, keyY: configuration.publicKey.y, epoch: 1 },
    allowlists: { agents: ['7'], models: [configuration.modelHash] },
    owners: { agent: configuration.agentOwner, guardian: configuration.deployer, demo: configuration.deployer }, guardian: { outflowCap: '4' },
    seed: ['bindKey', 'setTrustedAgent', 'setTrustedModel', 'configureBridge'].map(action => ({ action, txHash: hash(action), block: 2 })) };
  for (const [index, name] of ['VerdictRegistry', 'TripwireGuardianV2', 'SimpleGate', 'MockBridge'].entries()) {
    manifest.contracts[name] = { address: address(String(index + 2)), txHash: hash(name), block: 1,
      runtimeCodehash: hash(`${name}-code`), constructorArgsHash: hash(`${name}-constructor`) };
  }
  const artifacts = { VerdictRegistry: { abi: VERDICT_REGISTRY_ABI }, TripwireGuardianV2: { abi: parseAbi([
    'function applyVerdict(bytes32 verdictId,uint256 agentId)', 'function resetCircuit()',
  ]) }, MockBridge: { abi: parseAbi(['function release(address recipient,uint256 amount)']) } };
  const account = { address: configuration.deployer };
  const state = { nonce: 0, gasPrice: 1n, balance: BigInt(options.maxGasWei), bridgeBalance: 5n * BigInt(runs),
    owner: account.address, pendingOwner: address('0'), bridge: manifest.contracts.MockBridge.address,
    guardian: manifest.contracts.TripwireGuardianV2.address, horkos: manifest.contracts.VerdictRegistry.address,
    policyId: livePolicyId, outflowCap: 4n, currentKey: [configuration.publicKey.x, configuration.publicKey.y, 1, true],
    trustedAgents: true, trustedModels: true, currentTier: 0, windowStartedAt: 1000n, THROTTLE_WINDOW: 3600n, windowOutflow: 0n,
    timestamp: 1000n, pending: undefined, code: new Map() };
  const calls = [], intents = [], updates = [], reads = [];
  const client = {
    async getChainId() { return 10143; },
    async getBlock() { return { number: 10n, hash: hash('block'), timestamp: state.timestamp }; },
    async readContract(request) { reads.push(request); assert.equal(request.blockNumber, 10n); return state[request.functionName]; },
    async getCode({ address: target }) { return state.code.get(target.toLowerCase()) ?? '0x'; },
    async getGasPrice() { return state.gasPrice; },
    async getBalance({ address: target }) { return target.toLowerCase() === manifest.contracts.MockBridge.address.toLowerCase() ? state.bridgeBalance : state.balance; },
    async getTransactionCount(request) { return request.blockTag === 'pending' ? state.pending ?? state.nonce : state.nonce; },
  };
  const walletClient = { chain: { id: 10143 }, async writeContract(request) { calls.push(request); return hash(`tx-${request.nonce}`); } };
  const context = { manifest, artifacts, client, credentials: { configuration, blockers: [] }, provenance: { head: manifest.commit, dirty: false },
    assertInputsUnchanged() {}, createExecutor() { return { account, walletClient, sentinel: {} }; } };
  const writer = overrides => createLiveWriteGuard({ manifest, artifacts, options, client, walletClient, account,
    assertInputsUnchanged: context.assertInputsUnchanged, onIntent: record => intents.push(record), onIntentUpdate: record => updates.push(record), ...overrides });
  const request = label => {
    if (label.startsWith('verdict:') || ['reject:tampered-signature', 'reject:duplicate-verdict'].includes(label)) return {
      address: manifest.contracts.VerdictRegistry.address, abi: artifacts.VerdictRegistry.abi, functionName: 'submit', account,
      args: [{ agentId: 7n, modelHash: configuration.modelHash, inputHash: hash('input'), policyId: livePolicyId,
        scoreBps: 1000, observedAt: 1000n, expiry: 1600n, nonce: 1n }, hash('r'), hash('s')],
    };
    if (label.startsWith('action:') || label === 'reject:consumed-action') return {
      address: manifest.contracts.TripwireGuardianV2.address, abi: artifacts.TripwireGuardianV2.abi,
      functionName: 'applyVerdict', args: [hash('verdict'), 7n], account,
    };
    if (label === 'owner:reset') return { address: manifest.contracts.TripwireGuardianV2.address,
      abi: artifacts.TripwireGuardianV2.abi, functionName: 'resetCircuit', args: [], account };
    return { address: manifest.contracts.MockBridge.address, abi: artifacts.MockBridge.abi,
      functionName: 'release', args: [options.recipient, 1n], account };
  };
  const confirmation = (txHash, status = 'success') => ({ receipt: { transactionHash: txHash, status, blockNumber: 10n,
    blockHash: hash('block'), gasUsed: 25000n, effectiveGasPrice: 1n }, transaction: { nonce: state.nonce, gas: liveGasLimit, gasPrice: 1n } });
  const confirmed = async (guard, label) => {
    const txHash = await guard(request(label), label);
    const result = confirmation(txHash, label.startsWith('reject:') || ['release:delay', 'release:freeze'].includes(label) ? 'reverted' : 'success');
    await guard.confirm(result); state.nonce++; state.balance -= liveGasLimit;
    return { label, txHash, status: result.receipt.status, block: '10', blockHash: hash('block'),
      gasUsed: '25000', gasCharged: String(liveGasLimit), gasPriceWei: '1', feeWei: String(liveGasLimit) };
  };
  return { options, context, configuration, manifest, artifacts, account, state, client, walletClient, calls, intents, updates, reads, writer, request, confirmation, confirmed };
}

async function temporary(action) {
  const directory = mkdtempSync(resolve(tmpdir(), 'horkos-live-test-'));
  try { await action(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('help and invalid arguments terminate before environment/RPC/executor access', async () => {
  assert.match((await main(['--help'])).default, /Read-only/);
  for (const args of [[], ['--help', '--broadcast'], ['--live'], [...cliArgs(), '--recipient', address('b')],
    [...cliArgs(), '--broadcast'], [...cliArgs(), '--allow-owner-reset'], [...cliArgs(), '--runs', '2'],
    [...cliArgs(), '--runs', '3'], [...cliArgs(), '--wait-windows'], [...cliArgs(), '--runs'],
    ['--recipient', address('b'), '--max-transfer-wei', '-1', '--max-gas-wei', '100'],
    ['--recipient', 'not-an-address', '--max-transfer-wei', '24', '--max-gas-wei', '100'],
    ['--recipient', address('b'), '--max-transfer-wei', String(2n ** 256n), '--max-gas-wei', '100']]) {
    await assert.rejects(main(args), CheckError);
  }
});

test('CLI defaults to read-only and requires both authorizations and natural windows for three runs', () => {
  const readOnly = parseLiveArguments(cliArgs());
  assert.equal(readOnly.broadcast, false); assert.equal(readOnly.allowOwnerReset, false); assert.equal(readOnly.runs, 1);
  assert.equal(Object.isFrozen(readOnly), true);
  const approved = parseLiveArguments([...cliArgs(), '--runs', '3', '--wait-windows', '--broadcast', '--allow-owner-reset']);
  assert.equal(approved.broadcast && approved.allowOwnerReset && approved.waitWindows, true);
});

test('budget includes every attempted transfer and twenty fixed gas-limit charges per run', () => {
  const f = fixture(3), budget = liveBudget(f.manifest, f.options);
  assert.equal(budget.total, 15n); assert.equal(budget.attempted, 24n); assert.equal(budget.maxTransactions, 60); assert.equal(budget.priceCap, 1n);
  assert.throws(() => liveBudget(f.manifest, { ...f.options, maxTransferWei: '23' }), /attempted/);
  assert.throws(() => liveBudget(f.manifest, { ...f.options, maxGasWei: '119999999' }), /gas/);
  for (const value of ['0', '1e20', '01', String(2n ** 256n)]) assert.throws(() => liveBudget(f.manifest, { ...f.options, maxGasWei: value }));
  f.manifest.guardian.outflowCap = String((2n ** 256n - 1n) / 3n);
  assert.throws(() => liveBudget(f.manifest, { ...f.options, maxTransferWei: String(2n ** 256n - 1n) }));
});

test('read-only plan never creates a journal, wallet or signed verdict', async () => {
  const f = fixture(3); f.options.broadcast = false; f.options.allowOwnerReset = false;
  f.context.createExecutor = () => assert.fail('read-only executor created');
  const result = await runLiveDemo(f.context, f.options, { checkReady: ready, journalFactory() { assert.fail('read-only journal created'); } });
  assert.equal(result.transactionsBroadcast, 0); assert.equal(result.expectedTransferWei, '15'); assert.equal(result.maximumAttemptedTransferWei, '24');
  assert.equal(f.calls.length, 0);
});

for (const [name, change] of [
  ['unsafe credentials', f => { f.context.credentials.blockers = ['unsafe fixture']; }],
  ['dirty source', f => { f.context.provenance.dirty = true; }],
  ['wrong commit', f => { f.context.provenance.head = 'b'.repeat(40); }],
  ['wrong recipient', f => { f.options.recipient = address('c'); }],
  ['changed signer role', f => { f.manifest.agent.keyX = hash('changed'); }],
  ['historical manifest', f => { delete f.manifest.commit; }],
  ['missing bridge seed', f => { f.manifest.seed.pop(); }],
  ['missing reset authorization', f => { f.options.allowOwnerReset = false; }],
  ['insufficient transfer authorization', f => { f.options.maxTransferWei = '7'; }],
]) {
  test(`live planning rejects ${name} before contacting RPC or preflight`, async () => {
    const f = fixture(); change(f);
    f.client.getBlock = () => assert.fail('RPC contacted');
    await assert.rejects(prepareLiveDemo(f.context, f.options, () => assert.fail('preflight contacted')));
    assert.equal(f.calls.length, 0);
  });
}

for (const [name, change] of [
  ['wrong chain', f => { f.client.getChainId = async () => 1; }],
  ['recipient code', f => { f.state.code.set(address('b'), '0x1234'); }],
  ['sender delegation', f => { f.state.code.set(address('a'), '0xef0100'); }],
  ['P256 fallback', f => { f.state.code.set(nativeP256Address, '0x1234'); }],
  ['bridge funding', f => { f.state.bridgeBalance = 4n; }],
  ['wallet gas reserve', f => { f.state.balance = 39999999n; }],
  ['gas price ceiling', f => { f.state.gasPrice = 2n; }],
  ['zero gas price', f => { f.state.gasPrice = 0n; }],
  ['reorganized snapshot', f => { f.client.getBlock = async () => ({ number: 10n, hash: hash('other') }); }],
]) {
  test(`live planning rejects ${name} without a wallet or evidence writes`, async () => {
    const f = fixture(); change(f);
    f.context.createExecutor = () => assert.fail('executor created');
    await assert.rejects(runLiveDemo(f.context, f.options, { checkReady: ready, journalFactory() { assert.fail('journal created'); } }));
  });
}

test('combined preflight/explorer failure cannot be overridden by broadcast flags', async () => {
  const f = fixture(); f.context.createExecutor = () => assert.fail('executor created');
  for (const checkReady of [async () => { throw new CheckError('source verification failed'); }, async () => ({ ready: false }),
    async () => ({ ready: true, transactionsBroadcast: 1 })]) {
    await assert.rejects(runLiveDemo(f.context, f.options, { checkReady, journalFactory() { assert.fail('journal created'); } }));
  }
});

test('natural window wait polls pinned canonical state until real chain timestamps advance', async () => {
  const f = fixture(); f.state.windowOutflow = 5n;
  const snapshots = []; let ticks = 0;
  const block = await waitForFreshWindow({ client: f.client, guardian: { address: f.manifest.contracts.TripwireGuardianV2.address, abi: [] },
    onWait: value => snapshots.push(value), now: () => ticks, maxWaitMs: 5000, pollMs: 10,
    async sleep() { ticks += 10; f.state.timestamp = 4600n; } });
  assert.equal(block.timestamp, 4600n); assert.equal(snapshots.length, 1); assert.equal(snapshots[0].readyAt, '4600'); assert.equal(f.calls.length, 0);
  await waitForFreshWindow({ client: f.client, guardian: {}, sleep() { assert.fail('fresh window slept'); } });
});

for (const [name, change] of [
  ['foreign chain', f => { f.client.getChainId = async () => 31337; }],
  ['active restriction', f => { f.state.currentTier = 3; }],
  ['changed window', f => { f.state.THROTTLE_WINDOW = 1800n; }],
  ['reorganization', f => { let calls = 0; f.client.getBlock = async () => ({ number: 10n, timestamp: 1000n, hash: hash(++calls) }); }],
]) {
  test(`natural wait stops on ${name} without resetting or time travel`, async () => {
    const f = fixture(); change(f);
    await assert.rejects(waitForFreshWindow({ client: f.client, guardian: {}, sleep() { assert.fail('unexpected wait'); } }));
    assert.equal(f.calls.length, 0);
  });
}

test('natural wait has a wall-clock bound and respects cancellation', async () => {
  const f = fixture(); f.state.windowOutflow = 1n;
  await assert.rejects(waitForFreshWindow({ client: f.client, guardian: {}, now: () => 0, maxWaitMs: 0 }), /timed out/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForFreshWindow({ client: f.client, guardian: {}, signal: controller.signal }), /cancelled/);
  assert.equal(f.calls.length, 0);
});

test('live writer persists preparation before dispatch, pins gas/nonce, and charges the full limit', async () => {
  const f = fixture(); let preparations = 0, sourceChecks = 0;
  const guard = f.writer({ async assertInputsUnchanged() { sourceChecks++; }, async onIntent(record) {
    await new Promise(resolve => setImmediate(resolve)); preparations++; f.intents.push(record);
  } });
  f.walletClient.writeContract = async request => { assert.equal(preparations, 1); f.calls.push(request); return hash('tx'); };
  const request = { ...f.request(order[0]), gas: 8000000n, gasPrice: 999n, nonce: 999, abi: [] };
  const txHash = await guard(request, order[0]);
  assert.equal(sourceChecks, 2); assert.equal(f.intents[0].status, 'prepared'); assert.equal(f.updates[0].status, 'pending');
  assert.equal(f.calls[0].nonce, 0); assert.equal(f.calls[0].gas, liveGasLimit); assert.equal(f.calls[0].gasPrice, 1n);
  assert.equal(f.intents[0].from, f.account.address); assert.equal(f.intents[0].chainId, 10143); assert.equal(f.intents[0].preparedAtBlock, '10');
  assert.equal(f.intents[0].calldata, encodeFunctionData(f.request(order[0])));
  await guard.confirm(f.confirmation(txHash));
  assert.equal(f.updates.at(-1).feeWei, '2000000'); assert.equal(f.updates.at(-1).gasUsed, '25000');
  assert.ok(f.reads.every(read => read.blockNumber === 10n));
});

for (const [name, change] of [
  ['wrong account', (f, request) => { request.account = { address: address('c') }; }],
  ['attached value', (f, request) => { request.value = 1n; }],
  ['unknown target', (f, request) => { request.address = address('c'); }],
  ['unexpected operation', (f, request) => { request.functionName = 'bindKey'; }],
  ['other agent', (f, request) => { request.args[0].agentId = 8n; }],
  ['other model', (f, request) => { request.args[0].modelHash = hash('other'); }],
  ['other policy', (f, request) => { request.args[0].policyId = hash('other'); }],
  ['wrong RPC chain', f => { f.client.getChainId = async () => 1; }],
  ['owner changed', f => { f.state.owner = address('c'); }],
  ['pending ownership', f => { f.state.pendingOwner = address('c'); }],
  ['bridge link changed', f => { f.state.guardian = address('c'); }],
  ['registry link changed', f => { f.state.horkos = address('c'); }],
  ['policy changed', f => { f.state.policyId = hash('other'); }],
  ['cap changed', f => { f.state.outflowCap = 5n; }],
  ['key changed', f => { f.state.currentKey[0] = hash('other'); }],
  ['epoch changed', f => { f.state.currentKey[2] = 2; }],
  ['key revoked', f => { f.state.currentKey[3] = false; }],
  ['trust removed', f => { f.state.trustedModels = false; }],
  ['pending transaction', f => { f.state.pending = 1; }],
  ['unsafe nonce', f => { f.state.nonce = Number.MAX_SAFE_INTEGER + 1; }],
  ['gas price above ceiling', f => { f.state.gasPrice = 2n; }],
  ['missing remaining gas reserve', f => { f.state.balance = 1n; }],
  ['fallback precompile', f => { f.state.code.set(nativeP256Address, '0x1234'); }],
  ['recipient delegation', f => { f.state.code.set(address('b'), '0xef0100'); }],
  ['sender delegation', f => { f.state.code.set(address('a'), '0xef0100'); }],
  ['reorganization', f => { let count = 0; f.client.getBlock = async () => ({ number: 10n, hash: hash(++count) }); }],
]) {
  test(`live writer rejects ${name} before intent or wallet submission`, async () => {
    const f = fixture(), request = f.request(order[0]); change(f, request);
    await assert.rejects(f.writer()(request, order[0]));
    assert.equal(f.calls.length, 0); assert.equal(f.intents.length, 0);
  });
}

test('source mutation during RPC checks and cancellation stop before dispatch', async () => {
  const f = fixture(); let checks = 0;
  const guard = f.writer({ assertInputsUnchanged() { if (++checks === 2) throw new CheckError('source changed'); } });
  await assert.rejects(guard(f.request(order[0]), order[0]), /source changed/);
  assert.equal(f.calls.length, 0); assert.equal(f.intents.length, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.writer({ signal: controller.signal })(f.request(order[0]), order[0]), /cancelled/);
  assert.equal(f.calls.length, 0);
});

test('live writer refuses missing authorization, unordered calls, unresolved attempts and unrelated nonces', async () => {
  const f = fixture(); assert.throws(() => f.writer({ options: { ...f.options, broadcast: false } }), /authorization/);
  const guard = f.writer();
  await assert.rejects(guard(f.request('owner:reset'), 'owner:reset'), /order/);
  const txHash = await guard(f.request(order[0]), order[0]);
  await assert.rejects(guard(f.request(order[1]), order[1]), /unresolved/);
  await guard.confirm(f.confirmation(txHash)); f.state.nonce = 2;
  await assert.rejects(guard(f.request(order[1]), order[1]), /unrelated/);
  assert.equal(f.calls.length, 1);
});

test('uncertain broadcast retains its nonce/calldata and never retries automatically', async () => {
  const f = fixture(); f.walletClient.writeContract = async request => { f.calls.push(request); throw new Error('sensitive-provider-diagnostic'); };
  const guard = f.writer();
  await assert.rejects(guard(f.request(order[0]), order[0]), /sensitive-provider/);
  assert.equal(f.updates.at(-1).status, 'broadcast-unknown'); assert.equal(f.updates.at(-1).nonce, 0);
  assert.equal(JSON.stringify(f.updates).includes('sensitive-provider-diagnostic'), false);
  await assert.rejects(guard(f.request(order[1]), order[1]), /unresolved/);
  assert.equal(f.calls.length, 1);
});

test('intent persistence failure stops before wallet dispatch', async () => {
  const f = fixture();
  await assert.rejects(f.writer({ async onIntent() { throw new CheckError('disk unavailable'); } })(f.request(order[0]), order[0]), /disk/);
  assert.equal(f.calls.length, 0);
});

for (const [name, change] of [
  ['receipt nonce', result => { result.transaction.nonce = 1; }],
  ['transaction gas', result => { result.transaction.gas = 8000000n; }],
  ['transaction price', result => { result.transaction.gasPrice = 2n; }],
  ['receipt price', result => { result.receipt.effectiveGasPrice = 2n; }],
  ['zero gas', result => { result.receipt.gasUsed = 0n; }],
  ['excess gas', result => { result.receipt.gasUsed = liveGasLimit + 1n; }],
  ['unknown hash', result => { result.receipt.transactionHash = hash('other'); }],
  ['unmined status', result => { result.receipt.status = 'pending'; }],
  ['unexpected revert', result => { result.receipt.status = 'reverted'; }],
]) {
  test(`receipt accounting rejects ${name} and leaves the attempt unresolved`, async () => {
    const f = fixture(), guard = f.writer();
    const txHash = await guard(f.request(order[0]), order[0]), result = f.confirmation(txHash); change(result);
    await assert.rejects(guard.confirm(result));
    assert.equal(f.updates.at(-1).status, 'pending');
    await assert.rejects(guard(f.request(order[1]), order[1]), /unresolved/);
  });
}

test('release recipient/amount guards and overall call ceiling are enforced', async () => {
  const f = fixture(), guard = f.writer(); await f.confirmed(guard, order[0]);
    for (const args of [[address('c'), 1n], [f.options.recipient, 0n], [f.options.recipient, 2n], [f.options.recipient, 5n], [f.options.recipient, '1']]) {
    await assert.rejects(guard({ ...f.request(order[1]), args }, order[1]), /recipient\/amount/);
  }
  await f.confirmed(guard, order[1]);
  for (const label of order.slice(2)) await f.confirmed(guard, label);
  await assert.rejects(guard(f.request(order[0]), order[0]), /count/);
  assert.equal(f.calls.length, 20);
});

test('journal is exclusive, durable, private and retains unresolved locks', async () => {
  await temporary(async directory => {
    const f = fixture(), plan = await prepareLiveDemo(f.context, f.options, ready), journal = createLiveJournal(directory, plan);
    const lock = resolve(directory, 'deployments/.pending/demo-live.lock');
    assert.throws(() => createLiveJournal(directory, plan), /lock/);
    assert.equal(statSync(resolve(journal.output, 'run.json')).mode & 0o777, 0o600);
    journal.intent({ nonce: 1, label: order[0], status: 'prepared', calldata: '0x' });
    assert.equal(JSON.parse(readFileSync(resolve(journal.output, 'run.json'))).intents[0].status, 'prepared');
    journal.updateIntent({ nonce: 1, status: 'broadcast-unknown', calldata: '0x' }); journal.close();
    assert.equal(existsSync(lock), true);
    assert.throws(() => createLiveJournal(directory, plan), /lock/);
  });
});

test('confirmed journal releases its lock; public projections exclude scene diagnostics', async () => {
  await temporary(async directory => {
    const f = fixture(), plan = await prepareLiveDemo(f.context, f.options, ready), journal = createLiveJournal(directory, plan);
    journal.intent({ nonce: 0, status: 'prepared' }); journal.updateIntent({ nonce: 0, status: 'success' });
    const sentinel = createMockSentinel(), { bundle } = await sentinel.verdictFor({ incident: 'benign', nonce: 10n });
    journal.progress(0, { status: 'running', nonce: '10', transfersWei: '0', incidents: [], receipts: [],
      bundles: [{ incident: 'benign', bundle }], checks: { benign: true, extra: 'sensitive-diagnostic' }, extra: 'sensitive-diagnostic' });
    assert.equal(JSON.stringify(journal.report).includes('sensitive-diagnostic'), false);
    assert.deepEqual(journal.report.runs[0].checks, { benign: true });
    assert.equal(JSON.parse(readFileSync(resolve(journal.output, 'run-1/bundle-benign.json'))).verdictId, bundle.verdictId);
    assert.throws(() => journal.progress(0, { bundles: [{ incident: '../escape', bundle }] }), /unexpected bundles/);
    const invalid = structuredClone(bundle); invalid.verdict.scoreBps++;
    assert.throws(() => journal.progress(0, { bundles: [{ incident: 'freeze', bundle: invalid }] }), /unverified/);
    journal.close(); assert.equal(existsSync(resolve(directory, 'deployments/.pending/demo-live.lock')), false);
    const next = createLiveJournal(directory, plan); assert.notEqual(next.output, journal.output); next.close();
  });
});

test('journal rejects unexpected plan fields and symlinked evidence without overwriting', async () => {
  await temporary(async directory => {
    const f = fixture(), plan = await prepareLiveDemo(f.context, f.options, ready);
    assert.throws(() => createLiveJournal(directory, { ...plan, privateKey: 'not-a-key' }), /unexpected fields/);
    assert.deepEqual(readdirSync(directory), []);
    mkdirSync(resolve(directory, 'outside')); symlinkSync(resolve(directory, 'outside'), resolve(directory, 'evidence'));
    assert.throws(() => createLiveJournal(directory, plan), /symlink/);
    assert.deepEqual(readdirSync(resolve(directory, 'outside')), []);
    assert.equal(existsSync(resolve(directory, 'deployments/.pending/demo-live.lock')), false);
  });
});

for (const runs of [1, 3]) {
  test(`orchestrator completes ${runs} synthetic guarded run(s) with repeated preflight and canonical final audit`, async () => {
    await temporary(async directory => {
      const f = fixture(runs); f.context.directory = directory; let preflights = 0, waits = 0, scenes = 0;
      const result = await runLiveDemo(f.context, f.options, { async checkReady() { preflights++; return ready(); },
        async wait({ onWait }) { waits++; onWait({ checkedAtBlock: '10', checkedAtBlockHash: hash('block') }); },
        async scene({ chainId, writeGuard, onProgress }) {
          assert.equal(chainId, 10143); scenes++;
          const receipts = []; for (const label of order) receipts.push(await f.confirmed(writeGuard, label));
          const report = { status: 'passed', nonce: String(scenes), transfersWei: '5', receipts, bundles: [], checks: {},
            incidents: Array.from({ length: 5 }, (_, index) => ({ verdictId: hash(`verdict-${scenes}-${index}`) })) };
          onProgress(report); return report;
        } });
      const report = JSON.parse(readFileSync(result.report));
      assert.equal(preflights, runs); assert.equal(waits, runs - 1); assert.equal(f.calls.length, runs * 20);
      assert.equal(report.status, 'passed'); assert.equal(report.feeWei, String(runs * 40000000));
      assert.equal(result.transactionsBroadcast, runs * 20); assert.equal(existsSync(resolve(directory, 'deployments/.pending/demo-live.lock')), false);
    });
  });
}

test('orchestrator failure retains a partial public ledger and never resets/resumes', async () => {
  await temporary(async directory => {
    const f = fixture(); f.context.directory = directory;
    await assert.rejects(runLiveDemo(f.context, f.options, { checkReady: ready, async scene({ writeGuard }) {
      await writeGuard(f.request(order[0]), order[0]); throw new Error('sensitive-provider-diagnostic');
    } }), /sensitive-provider/);
    const parent = resolve(directory, 'evidence/replay/live'), output = resolve(parent, readdirSync(parent)[0]);
    const report = JSON.parse(readFileSync(resolve(output, 'run.json')));
    assert.equal(report.status, 'failed'); assert.equal(report.intents[0].status, 'pending');
    assert.equal(JSON.stringify(report).includes('sensitive-provider-diagnostic'), false);
    assert.equal(f.calls.length, 1); assert.equal(existsSync(resolve(directory, 'deployments/.pending/demo-live.lock')), true);
  });
});

for (const failure of ['incomplete calls', 'duplicate digests', 'wrong transferred total', 'final reorganization', 'missing intents', 'altered ledger']) {
  test(`final audit cannot pass with ${failure}`, async () => {
    await temporary(async directory => {
      const f = fixture(); f.context.directory = directory;
      await assert.rejects(runLiveDemo(f.context, f.options, { checkReady: ready,
        async scene({ writeGuard, onProgress }) {
          const receipts = [];
          if (failure !== 'missing intents') for (const label of order) receipts.push(await f.confirmed(writeGuard, label));
          else for (const label of order) receipts.push({ label, block: '10', blockHash: hash('block'), feeWei: '2000000' });
          if (failure === 'altered ledger') receipts[0].feeWei = '1';
          const report = { status: 'passed', nonce: '1', transfersWei: failure === 'wrong transferred total' ? '4' : '5',
            receipts: failure === 'incomplete calls' ? receipts.slice(1) : receipts, bundles: [], checks: {},
            incidents: Array.from({ length: 5 }, (_, index) => ({ verdictId: hash(failure === 'duplicate digests' ? 'same' : index) })) };
          onProgress(report);
          if (failure === 'final reorganization') f.client.getBlock = async () => ({ number: 10n, hash: hash('reorg') });
          return report;
        } }));
      const parent = resolve(directory, 'evidence/replay/live'), report = JSON.parse(readFileSync(resolve(parent, readdirSync(parent)[0], 'run.json')));
      assert.equal(report.status, 'failed');
      assert.equal(report.transactionsBroadcast, undefined);
    });
  });
}

test('preflight is mandatory again after a natural window and failure prevents the next scene', async () => {
  await temporary(async directory => {
    const f = fixture(3); f.context.directory = directory; let preflights = 0, scenes = 0;
    await assert.rejects(runLiveDemo(f.context, f.options, { async checkReady() {
      if (++preflights === 2) throw new CheckError('configuration changed while waiting'); return ready();
    }, async wait() {}, async scene({ writeGuard, onProgress }) {
      scenes++; const receipts = []; for (const label of order) receipts.push(await f.confirmed(writeGuard, label));
      const report = { status: 'passed', nonce: '1', transfersWei: '5', receipts, bundles: [], checks: {},
        incidents: Array.from({ length: 5 }, (_, index) => ({ verdictId: hash(index) })) };
      onProgress(report); return report;
    } }), /changed while waiting/);
    assert.equal(preflights, 2); assert.equal(scenes, 1); assert.equal(f.calls.length, 20);
  });
});

test('cancellation during a scene is recorded and blocks further runs', async () => {
  await temporary(async directory => {
    const f = fixture(3), controller = new AbortController(); f.context.directory = directory; f.context.signal = controller.signal;
    await assert.rejects(runLiveDemo(f.context, f.options, { checkReady: ready, async scene({ writeGuard }) {
      await writeGuard(f.request(order[0]), order[0]); controller.abort();
      await writeGuard(f.request(order[1]), order[1]); assert.fail('continued after cancellation');
    }, wait() { assert.fail('continued to another window'); } }), /cancelled/);
    const parent = resolve(directory, 'evidence/replay/live'), report = JSON.parse(readFileSync(resolve(parent, readdirSync(parent)[0], 'run.json')));
    assert.equal(report.status, 'cancelled'); assert.equal(f.calls.length, 1);
  });
});

test('Monad receipt checker explicitly uses two confirmations and the chosen chain', async () => {
  const f = fixture(), request = f.request(order[0]), txHash = hash('tx'); let wait;
  const result = f.confirmation(txHash);
  Object.assign(result.receipt, { from: f.account.address, to: request.address, logs: [] });
  Object.assign(result.transaction, { hash: txHash, chainId: 10143, from: f.account.address, to: request.address,
    input: encodeFunctionData(request), value: 0n, blockNumber: 10n, blockHash: hash('block') });
  const client = { ...f.client, async waitForTransactionReceipt(request) { wait = request; return result.receipt; }, async getTransaction() { return result.transaction; } };
  await confirmDemoReceipt(client, txHash, request, 'success', 10143);
  assert.equal(wait.confirmations, 2); assert.equal(wait.timeout, 180000);
  await assert.rejects(confirmDemoReceipt(client, txHash, request), /intended call/);
  await assert.rejects(runDemoScene({ chainId: 10143, cap: 4n }), /guarded live writer/);
  assert.throws(() => requireDemoEvent({ logs: [{ removed: true }] }, request.address, [], 'Any', {}), /removed log/);
});
