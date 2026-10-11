import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseError, ContractFunctionRevertedError, encodeAbiParameters, encodeErrorResult, encodeEventTopics, encodeFunctionData, parseAbi } from 'viem';
import { createMockSentinel } from '../packages/testing/dist/index.js';
import { assertReleaseDelta, confirmDemoReceipt, demoPlan, requireDemoEvent, requireDemoRevert, runDemoScene } from './demo-scenes.mjs';
import { rehearse } from './demo-rehearse.mjs';

const address = digit => `0x${digit.repeat(40)}`;
const hash = digit => `0x${digit.repeat(64)}`;
const abi = parseAbi([
  'function release(address recipient,uint256 amount)',
  'event Released(address indexed recipient,uint256 amount)',
  'error OutflowCapExceeded()',
  'error OutflowBlocked(uint8 tier,uint64 until)',
]);
const account = { address: address('a') };
const request = { address: address('b'), abi, functionName: 'release', args: [address('c'), 1n], account };
const receiptFixture = () => {
  const receipt = { transactionHash: hash('1'), status: 'success', from: account.address, to: request.address,
    blockNumber: 12n, blockHash: hash('2'), logs: [] };
  const transaction = { hash: hash('1'), chainId: 31337, from: account.address, to: request.address,
    input: encodeFunctionData(request), value: 0n, blockNumber: 12n, blockHash: hash('2') };
  const client = { async waitForTransactionReceipt() { return receipt; }, async getTransaction() { return transaction; },
    async getBlock() { return { number: 12n, hash: hash('2') }; } };
  return { receipt, transaction, client };
};
const releasedLog = () => ({ address: request.address,
  topics: encodeEventTopics({ abi, eventName: 'Released', args: { recipient: address('c') } }),
  data: encodeAbiParameters([{ type: 'uint256' }], [1n]) });

test('demo plan allocates exact cumulative and reset transfers without rounding away smallest units', () => {
  assert.deepEqual(demoPlan(7n), { cap: 7n, unit: 1n, throttleRemainder: 4n, perRun: 8n, runs: 3, total: 24n });
  const plan = demoPlan(3000000000000000000n);
  assert.equal(plan.total, 11250000000000000000n);
  assert.equal(3n * plan.unit + plan.throttleRemainder, plan.cap);
  assert.equal(demoPlan(4n, 1).total, 5n);
});

test('demo plan rejects unsafe types, cap widths, run counts and overflowing budgets', () => {
  for (const cap of [0n, 3n, -1n, 4, '4', 2n ** 256n, 2n ** 256n - 1n]) assert.throws(() => demoPlan(cap));
  for (const runs of [0, 4, -1, 1.5, '3', NaN]) assert.throws(() => demoPlan(4n, runs));
});

test('release checks require exact bridge, recipient and cumulative accounting for success and revert', () => {
  const before = { bridge: 10n, recipient: 2n, outflow: 3n };
  assert.doesNotThrow(() => assertReleaseDelta(before, { bridge: 8n, recipient: 4n, outflow: 5n }, 2n, true));
  assert.doesNotThrow(() => assertReleaseDelta(before, before, 2n, false));
  for (const after of [{ bridge: 9n, recipient: 4n, outflow: 5n }, { bridge: 8n, recipient: 3n, outflow: 5n },
    { bridge: 8n, recipient: 4n, outflow: 4n }]) assert.throws(() => assertReleaseDelta(before, after, 2n, true));
  assert.throws(() => assertReleaseDelta(before, { ...before, outflow: 4n }, 2n, false));
});

test('rejection requires a decoded contract error, not a provider failure or message substring', async () => {
  const reverted = name => new BaseError('Call failed', { cause: new ContractFunctionRevertedError({ abi,
    data: encodeErrorResult({ abi, errorName: name, args: name === 'OutflowBlocked' ? [2, 1700001800n] : [] }), functionName: 'release' }) });
  let observed;
  const client = { async simulateContract(input) { observed = input; throw reverted('OutflowCapExceeded'); } };
  assert.equal((await requireDemoRevert(client, request, 'OutflowCapExceeded', 12n)).errorName, 'OutflowCapExceeded');
  assert.equal(observed.blockNumber, 12n);
  await assert.rejects(requireDemoRevert(client, request, 'OutflowBlocked'), /intended contract error/);
  await assert.rejects(requireDemoRevert({ async simulateContract() { throw new Error('OutflowCapExceeded RPC unavailable'); } }, request, 'OutflowCapExceeded'), /intended contract error/);
  await assert.rejects(requireDemoRevert({ async simulateContract() {} }, request, 'OutflowCapExceeded'), /unexpectedly simulated/);
});

test('blocked-release proof checks the exact tier and deadline in the contract error', async () => {
  const client = { async simulateContract() { throw new ContractFunctionRevertedError({ abi, functionName: 'release',
    data: encodeErrorResult({ abi, errorName: 'OutflowBlocked', args: [2, 1700001800n] }) }); } };
  await requireDemoRevert(client, request, 'OutflowBlocked', 12n, [2, 1700001800n]);
  await assert.rejects(requireDemoRevert(client, request, 'OutflowBlocked', 12n, [3, 1700001800n]), /wrong error arguments/);
  await assert.rejects(requireDemoRevert(client, request, 'OutflowBlocked', 12n, [2, 1700001801n]), /wrong error arguments/);
});

test('receipt confirmation pins canonical transaction and receipt identity', async () => {
  const { client } = receiptFixture();
  assert.equal((await confirmDemoReceipt(client, hash('1'), request)).block.hash, hash('2'));
});

for (const [name, change] of [
  ['wrong status', fixture => { fixture.receipt.status = 'reverted'; }],
  ['wrong receipt hash', fixture => { fixture.receipt.transactionHash = hash('3'); }],
  ['wrong transaction hash', fixture => { fixture.transaction.hash = hash('3'); }],
  ['wrong chain', fixture => { fixture.transaction.chainId = 10143; }],
  ['wrong caller', fixture => { fixture.transaction.from = address('d'); }],
  ['wrong receipt caller', fixture => { fixture.receipt.from = address('d'); }],
  ['wrong target', fixture => { fixture.transaction.to = address('d'); }],
  ['wrong receipt target', fixture => { fixture.receipt.to = address('d'); }],
  ['wrong calldata', fixture => { fixture.transaction.input = '0x'; }],
  ['unexpected value', fixture => { fixture.transaction.value = 1n; }],
  ['wrong transaction block', fixture => { fixture.transaction.blockNumber = 13n; }],
  ['wrong transaction block hash', fixture => { fixture.transaction.blockHash = hash('3'); }],
  ['reorganization', fixture => { fixture.client.getBlock = async () => ({ number: 12n, hash: hash('3') }); }],
]) {
  test(`receipt confirmation rejects ${name}`, async () => {
    const fixture = receiptFixture();
    change(fixture);
    await assert.rejects(confirmDemoReceipt(fixture.client, hash('1'), request));
  });
}

test('reverted receipts must be canonical, exact calls with no events', async () => {
  const fixture = receiptFixture();
  fixture.receipt.status = 'reverted';
  await confirmDemoReceipt(fixture.client, hash('1'), request, 'reverted');
  fixture.receipt.logs.push(releasedLog());
  await assert.rejects(confirmDemoReceipt(fixture.client, hash('1'), request, 'reverted'), /emitted logs/);
});

test('release event checking rejects spoofed emitters, changed amounts and duplicate events', () => {
  const receipt = { logs: [releasedLog()] };
  assert.doesNotThrow(() => requireDemoEvent(receipt, request.address, abi, 'Released', { recipient: address('c'), amount: 1n }));
  assert.throws(() => requireDemoEvent(receipt, address('d'), abi, 'Released', { amount: 1n }));
  assert.throws(() => requireDemoEvent(receipt, request.address, abi, 'Released', { amount: 2n }));
  receipt.logs.push(releasedLog());
  assert.throws(() => requireDemoEvent(receipt, request.address, abi, 'Released', { amount: 1n }));
});

function sceneFixture() {
  const registry = { address: address('1'), abi: [] };
  const guardian = { address: address('2'), abi: [] };
  const bridge = { address: address('3'), abi: [] };
  const sentinel = createMockSentinel({ registryAddress: registry.address, policyId: hash('4') });
  const state = { owner: account.address, pendingOwner: address('0'), horkos: registry.address,
    bridge: bridge.address, guardian: guardian.address, policyId: sentinel.policyId, trustedAgents: true, trustedModels: true,
    currentKey: [sentinel.publicKey.x, sentinel.publicKey.y, 1, true], currentTier: 0, outflowCap: 4n,
    windowStartedAt: 1700000000n, THROTTLE_WINDOW: 3600n, windowOutflow: 0n };
  const journal = [];
  let writes = 0;
  const client = { async getChainId() { return 31337; }, async getBlock() { return { number: 10n, timestamp: 1700000000n, hash: hash('5') }; },
    async getCode() { return '0x'; }, async readContract({ functionName }) { return state[functionName]; },
    async getBalance() { return 5n; }, async waitForTransactionReceipt() { throw new Error('secret-provider-diagnostic'); } };
  const walletClient = { chain: { id: 31337 }, async writeContract() { writes++; return hash('6'); } };
  return { state, journal, writes: () => writes, options: { client, walletClient, account, registry, guardian, bridge, sentinel,
    recipient: address('c'), cap: 4n, nonce: 100n, onProgress(report) { journal.push(structuredClone(report)); } } };
}

for (const [name, change] of [
  ['external chain', fixture => { fixture.options.client.getChainId = async () => 10143; }],
  ['external wallet', fixture => { fixture.options.walletClient.chain.id = 10143; }],
  ['external signer domain', fixture => { fixture.options.sentinel.chainId = 10143; }],
  ['nonce overflow', fixture => { fixture.options.nonce = 2n ** 64n - 1n; }],
  ['sender recipient', fixture => { fixture.options.recipient = account.address; }],
  ['zero recipient', fixture => { fixture.options.recipient = address('0'); }],
  ['contract recipient', fixture => { fixture.options.client.getCode = async () => '0x1234'; }],
  ['wrong owner', fixture => { fixture.state.owner = address('d'); }],
  ['pending ownership', fixture => { fixture.state.pendingOwner = address('d'); }],
  ['wrong contract link', fixture => { fixture.state.horkos = address('d'); }],
  ['untrusted model', fixture => { fixture.state.trustedModels = false; }],
  ['wrong policy', fixture => { fixture.state.policyId = hash('6'); }],
  ['inactive key', fixture => { fixture.state.currentKey[3] = false; }],
  ['invalid key epoch', fixture => { fixture.state.currentKey[2] = 0; }],
  ['wrong public key', fixture => { fixture.state.currentKey[0] = hash('7'); }],
  ['active restriction', fixture => { fixture.state.currentTier = 3; }],
  ['cap mismatch', fixture => { fixture.state.outflowCap = 5n; }],
  ['uncleared outflow window', fixture => { fixture.state.windowOutflow = 1n; }],
  ['insufficient bridge funds', fixture => { fixture.options.client.getBalance = async () => 4n; }],
]) {
  test(`scene engine rejects ${name} before any wallet submission`, async () => {
    const fixture = sceneFixture();
    change(fixture);
    await assert.rejects(runDemoScene(fixture.options));
    assert.equal(fixture.writes(), 0);
  });
}

test('submission timeout retains pending hash and failed scene without leaking provider diagnostics', async () => {
  const fixture = sceneFixture();
  await assert.rejects(runDemoScene(fixture.options), /secret-provider-diagnostic/);
  assert.equal(fixture.writes(), 1);
  const failed = fixture.journal.at(-1);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failedScene, 'verdict:benign');
  assert.deepEqual(failed.receipts, [{ label: 'verdict:benign', txHash: hash('6'), status: 'pending' }]);
  assert.equal(JSON.stringify(failed).includes('secret-provider-diagnostic'), false);
  assert.equal(failed.checks.ownerReset, undefined);
});

test('rehearsal rejects live/output flags before starting a node or reading operator configuration', async () => {
  for (const args of [['--live'], ['--out', '/tmp/ignored'], ['--runs', '3']]) {
    await assert.rejects(rehearse(args), /takes no flags/);
  }
});
