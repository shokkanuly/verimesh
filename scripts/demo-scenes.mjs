import { BaseError, ContractFunctionRevertedError, encodeFunctionData, getAddress, parseEventLogs } from 'viem';
import { submitVerdict } from '../packages/sdk/dist/index.js';
import { executeGuardianAction, verifyTripwireBundle } from '../packages/sentinel/dist/index.js';
import { equalHex, requireCheck } from './deployment-checks.mjs';

const zero = '0x0000000000000000000000000000000000000000';
const ids = ['benign', 'near-miss', 'throttle', 'delay', 'freeze'];

export function demoPlan(cap, runs = 3) {
  requireCheck(typeof cap === 'bigint' && cap >= 4n && cap < 2n ** 256n, 'Demo cap must be a uint256 of at least four smallest units');
  requireCheck(Number.isInteger(runs) && runs >= 1 && runs <= 3, 'Rehearsal requires one to three runs');
  const unit = cap / 4n;
  const perRun = cap + unit;
  requireCheck(perRun * BigInt(runs) < 2n ** 256n, 'Demo transfer budget exceeds uint256');
  return { cap, unit, throttleRemainder: cap - 3n * unit, perRun, runs, total: perRun * BigInt(runs) };
}

export function assertReleaseDelta(before, after, amount, success) {
  const released = success ? amount : 0n;
  requireCheck(before.bridge - after.bridge === released, 'Bridge balance delta differs from the intended release');
  requireCheck(after.recipient - before.recipient === released, 'Recipient balance delta differs from the intended release');
  requireCheck(after.outflow === before.outflow + released, 'Cumulative outflow changed incorrectly');
}

export async function requireDemoRevert(client, request, errorName, blockNumber, expectedArgs) {
  try {
    await client.simulateContract({ ...request, ...(blockNumber === undefined ? {} : { blockNumber }) });
  } catch (error) {
    const cause = error instanceof BaseError ? error.walk(item => item instanceof ContractFunctionRevertedError) : undefined;
    requireCheck(cause instanceof ContractFunctionRevertedError && cause.data?.errorName === errorName,
      'Negative demo scene did not reproduce the intended contract error');
    if (expectedArgs) requireCheck((cause.data.args ?? []).length === expectedArgs.length
      && expectedArgs.every((value, index) => cause.data.args[index] === value), 'Negative demo scene has the wrong error arguments');
    return cause.data;
  }
  requireCheck(false, 'Negative demo scene unexpectedly simulated successfully');
}

export async function confirmDemoReceipt(client, hash, request, expected = 'success', chainId = 31337) {
  requireCheck(chainId === 31337 || chainId === 10143, 'Unsupported demo receipt chain');
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: chainId === 10143 ? 180000 : 30000,
    confirmations: chainId === 10143 ? 2 : 1 });
  requireCheck(equalHex(receipt.transactionHash, hash) && receipt.status === expected, 'Demo receipt hash/status differs');
  const transaction = await client.getTransaction({ hash });
  requireCheck(equalHex(transaction.hash, hash) && transaction.chainId === chainId
    && equalHex(transaction.from, request.account.address) && equalHex(receipt.from, transaction.from)
    && equalHex(transaction.to, request.address) && equalHex(receipt.to, transaction.to)
    && equalHex(transaction.input, encodeFunctionData(request)) && transaction.value === 0n
    && transaction.blockNumber === receipt.blockNumber && equalHex(transaction.blockHash, receipt.blockHash),
  'Demo transaction differs from its intended call');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  requireCheck(equalHex(block.hash, receipt.blockHash), 'Demo receipt block was reorganized');
  requireCheck(expected !== 'reverted' || receipt.logs.length === 0, 'Reverted demo call emitted logs');
  return { receipt, block, transaction };
}

export function requireDemoEvent(receipt, address, abi, eventName, expected) {
  requireCheck(receipt.logs.every(log => !log.removed), 'Demo receipt contains a removed log');
  const events = parseEventLogs({ abi, eventName, strict: true,
    logs: receipt.logs.filter(log => equalHex(log.address, address)) });
  requireCheck(events.length === 1 && Object.entries(expected).every(([name, value]) =>
    typeof value === 'string' ? equalHex(events[0].args[name], value) : events[0].args[name] === value),
  'Demo receipt is missing its exact expected event');
}

// No setup, secrets or time travel here. Monad execution requires the live
// wrapper's budgeted writer and receipt accounting; the default stays local.
export async function runDemoScene({ client, walletClient, account, registry, guardian, bridge, sentinel,
  recipient, cap, nonce, onProgress = () => {}, chainId = 31337, writeGuard }) {
  const plan = demoPlan(cap, 1);
  requireCheck(chainId === 31337 || (chainId === 10143 && typeof writeGuard === 'function' && typeof writeGuard.confirm === 'function'),
    'Monad demo scenes require the guarded live writer');
  requireCheck(await client.getChainId() === chainId && walletClient.chain?.id === chainId && sentinel.chainId === chainId,
    'Demo scene clients/signer differ from the explicitly selected chain');
  requireCheck(typeof nonce === 'bigint' && nonce >= 0n && nonce + 5n < 2n ** 64n, 'Demo nonce range exceeds uint64');
  recipient = getAddress(recipient);
  requireCheck(![zero, account.address, registry.address, guardian.address, bridge.address].some(address => equalHex(address, recipient)),
    'Rehearsal recipient must be a distinct nonzero external account');
  requireCheck(equalHex(sentinel.registryAddress, registry.address), 'Sentinel targets a different registry');
  const read = (contract, functionName, args = [], blockNumber) => client.readContract({
    address: contract.address, abi: contract.abi, functionName, args, ...(blockNumber === undefined ? { blockTag: 'latest' } : { blockNumber }),
  });
  const initial = await client.getBlock({ blockTag: 'latest' });
  const initialRead = (contract, name, args) => read(contract, name, args, initial.number);
  requireCheck(!(await client.getCode({ address: recipient, blockNumber: initial.number }))?.replace(/^0x$/, ''), 'Rehearsal recipient has contract code');
  requireCheck(equalHex(await initialRead(guardian, 'owner'), account.address)
    && equalHex(await initialRead(bridge, 'owner'), account.address), 'Rehearsal account must own guardian and bridge');
  requireCheck(equalHex(await initialRead(guardian, 'pendingOwner'), zero)
    && equalHex(await initialRead(bridge, 'pendingOwner'), zero), 'Rehearsal has a pending ownership transfer');
  requireCheck(equalHex(await initialRead(guardian, 'horkos'), registry.address)
    && equalHex(await initialRead(guardian, 'bridge'), bridge.address)
    && equalHex(await initialRead(bridge, 'guardian'), guardian.address), 'Rehearsal contract links differ');
  requireCheck(equalHex(await initialRead(guardian, 'policyId'), sentinel.policyId)
    && await initialRead(guardian, 'trustedAgents', [sentinel.agentId]) === true
    && await initialRead(guardian, 'trustedModels', [sentinel.model.hash]) === true, 'Rehearsal policy or trust configuration differs');
  const key = await initialRead(registry, 'currentKey', [sentinel.agentId]);
  requireCheck(Number.isInteger(key[2]) && key[2] > 0 && key[2] < 2 ** 32, 'Rehearsal key epoch is invalid');
  const checkKey = current => requireCheck(current[3] && current[2] === key[2]
    && equalHex(current[0], sentinel.publicKey.x) && equalHex(current[1], sentinel.publicKey.y), 'Rehearsal signer binding/epoch changed');
  checkKey(key);
  requireCheck(await initialRead(guardian, 'currentTier') === 0 && await initialRead(guardian, 'outflowCap') === cap,
    'Rehearsal needs an idle guardian with the planned cap');
  const started = await initialRead(guardian, 'windowStartedAt');
  const window = await initialRead(guardian, 'THROTTLE_WINDOW');
  requireCheck(await initialRead(guardian, 'windowOutflow') === 0n || initial.timestamp >= started + window,
    'Rehearsal needs a fresh outflow window; owner reset does not clear accounting');
  requireCheck(await client.getBalance({ address: bridge.address, blockNumber: initial.number }) >= plan.perRun,
    'Bridge lacks the exact rehearsal transfer budget');
  requireCheck(equalHex((await client.getBlock({ blockNumber: initial.number })).hash, initial.hash), 'Rehearsal start snapshot was reorganized');

  const report = { status: 'running', nonce: nonce.toString(), transfersWei: '0', incidents: [], receipts: [], bundles: [], checks: {} };
  let label;
  const progress = () => onProgress(report);
  const trackedWallet = { ...walletClient, async writeContract(request) {
    const hash = writeGuard ? await writeGuard(request, label) : await walletClient.writeContract(request);
    report.receipts.push({ label, txHash: hash, status: 'pending' });
    progress();
    return hash;
  } };
  const bridgeCallAbi = [...bridge.abi, ...guardian.abi.filter(item => item.type === 'error'
    && !bridge.abi.some(existing => existing.type === 'error' && existing.name === item.name))];
  const requestFor = (contract, functionName, args) => ({ address: contract.address,
    abi: contract === bridge ? bridgeCallAbi : contract.abi, functionName, args, account });
  const confirm = async (hash, request, expected) => {
    const result = await confirmDemoReceipt(client, hash, request, expected, chainId);
    if (writeGuard) await writeGuard.confirm(result);
    const entry = report.receipts.find(record => equalHex(record.txHash, hash));
    requireCheck(!!entry, 'Rehearsal receipt has no pending journal entry');
    Object.assign(entry, { status: result.receipt.status, block: result.receipt.blockNumber.toString(), blockHash: result.receipt.blockHash });
    if (chainId === 10143) Object.assign(entry, { gasUsed: result.receipt.gasUsed.toString(),
      gasCharged: result.transaction.gas.toString(), gasPriceWei: result.receipt.effectiveGasPrice.toString(),
      feeWei: (result.transaction.gas * result.receipt.effectiveGasPrice).toString() });
    progress();
    return result;
  };
  const send = async (request, expected = 'success') => confirm(await trackedWallet.writeContract({ ...request, gas: 8000000n }), request, expected);
  const negative = async (request, name, args) => {
    await requireDemoRevert(client, request, name, undefined, args);
    const result = await send(request, 'reverted');
    await requireDemoRevert(client, request, name, result.receipt.blockNumber, args);
    return result;
  };
  const balances = async (blockNumber, effective = false) => {
    const block = await client.getBlock({ blockNumber });
    const windowStart = await read(guardian, 'windowStartedAt', [], blockNumber);
    return {
      bridge: await client.getBalance({ address: bridge.address, blockNumber }),
      recipient: await client.getBalance({ address: recipient, blockNumber }),
      outflow: effective && block.timestamp >= windowStart + window ? 0n : await read(guardian, 'windowOutflow', [], blockNumber),
    };
  };
  const release = async (amount, tier, reason) => {
    const beforeBlock = await client.getBlock({ blockTag: 'latest' });
    const before = await balances(beforeBlock.number, true);
    requireCheck(await read(guardian, 'currentTier', [], beforeBlock.number) === tier, 'Release scene has the wrong effective tier');
    const request = requestFor(bridge, 'release', [recipient, amount]);
    const args = reason === 'OutflowBlocked' ? [tier, await read(guardian, 'tierUntil', [], beforeBlock.number)] : undefined;
    const { receipt } = reason ? await negative(request, reason, args) : await send(request);
    const after = await balances(receipt.blockNumber);
    assertReleaseDelta(before, after, amount, !reason);
    if (!reason) {
      requireDemoEvent(receipt, bridge.address, bridge.abi, 'Released', { recipient, amount });
      requireDemoEvent(receipt, guardian.address, guardian.abi, 'OutflowRecorded', { amount, windowOutflow: after.outflow });
      report.transfersWei = (BigInt(report.transfersWei) + amount).toString();
    }
    requireCheck(await read(guardian, 'currentTier', [], receipt.blockNumber) === tier, 'Release scene changed/expired its restriction');
  };
  try {
    progress();
    const signed = [];
    for (const [index, incident] of ids.entries()) {
      const { timestamp } = await client.getBlock({ blockTag: 'latest' });
      const result = await sentinel.verdictFor({ incident, observedAt: timestamp, nonce: nonce + BigInt(index) });
      requireCheck(verifyTripwireBundle(result.bundle).valid, 'Rehearsal bundle failed independent verification');
      const tier = index < 2 ? 0 : index - 1;
      requireCheck((tier === 0 && result.verdict.scoreBps < 6500)
        || (tier === 1 && result.verdict.scoreBps >= 6500 && result.verdict.scoreBps < 8500)
        || (tier === 2 && result.verdict.scoreBps >= 8500 && result.verdict.scoreBps < 9500)
        || (tier === 3 && result.verdict.scoreBps >= 9500), 'Rehearsal incident scored outside its intended tier');
      signed.push(result);
      report.bundles.push({ incident, bundle: result.bundle });
      label = `verdict:${incident}`;
      const accepted = await submitVerdict(trackedWallet, client, registry.address, result.verdict, result.bundle.signature, account);
      requireCheck(equalHex(accepted.verdictId, result.bundle.verdictId), 'Rehearsal accepted a different verdict digest');
      const submit = requestFor(registry, 'submit', [result.verdict, result.bundle.signature.r, result.bundle.signature.s]);
      const { receipt } = await confirm(accepted.txHash, submit, 'success');
      requireDemoEvent(receipt, registry.address, registry.abi, 'VerdictAccepted', {
        verdictId: result.bundle.verdictId, agentId: sentinel.agentId, policyId: sentinel.policyId,
        scoreBps: result.verdict.scoreBps, modelHash: sentinel.model.hash, inputHash: result.verdict.inputHash, observedAt: result.verdict.observedAt,
      });
      if (tier) {
        label = `action:${incident}`;
        const action = await executeGuardianAction(result.bundle.verdictId, sentinel.agentId, {
          publicClient: client, walletClient: trackedWallet, account, guardianAddress: guardian.address,
        });
        const { receipt: applied } = await confirm(action.txHash, requestFor(guardian, 'applyVerdict', [result.bundle.verdictId, sentinel.agentId]), 'success');
        requireDemoEvent(applied, guardian.address, guardian.abi, 'ActionApplied', {
          verdictId: result.bundle.verdictId, scoreBps: result.verdict.scoreBps, tier,
        });
      }
      requireCheck(await read(guardian, 'currentTier') === tier, 'Rehearsal guardian tier differs from its incident');
      label = `release:${incident}`;
      if (tier === 0) await release(plan.unit, tier);
      if (tier === 1) {
        await release(plan.unit, tier);
        label = 'release:throttle-to-cap';
        await release(plan.throttleRemainder, tier);
        label = 'reject:cap-plus-one';
        await release(1n, tier, 'OutflowCapExceeded');
      }
      if (tier >= 2) await release(1n, tier, 'OutflowBlocked');
      report.incidents.push({ incident, verdictId: result.bundle.verdictId, scoreBps: result.verdict.scoreBps, tier });
      progress();
    }
    const frozenOutflow = await read(guardian, 'windowOutflow');
    const frozenUntil = await read(guardian, 'tierUntil');
    const fresh = await sentinel.verdictFor({ observedAt: (await client.getBlock({ blockTag: 'latest' })).timestamp, nonce: nonce + 5n });
    const tampered = structuredClone(fresh.bundle);
    tampered.verdict.scoreBps--;
    requireCheck(!verifyTripwireBundle(tampered).valid, 'Tampered rehearsal bundle passed independent verification');
    label = 'reject:tampered-signature';
    await negative(requestFor(registry, 'submit', [{ ...fresh.verdict, scoreBps: fresh.verdict.scoreBps - 1 }, fresh.bundle.signature.r, fresh.bundle.signature.s]), 'BadSignature');
    label = 'reject:duplicate-verdict';
    await negative(requestFor(registry, 'submit', [signed[0].verdict, signed[0].bundle.signature.r, signed[0].bundle.signature.s]), 'AlreadyAccepted');
    label = 'reject:consumed-action';
    await negative(requestFor(guardian, 'applyVerdict', [signed[4].bundle.verdictId, sentinel.agentId]), 'VerdictConsumed');
    requireCheck(await read(guardian, 'currentTier') === 3 && await read(guardian, 'tierUntil') === frozenUntil
      && await read(guardian, 'windowOutflow') === frozenOutflow, 'Negative scenes mutated guardian state');
    checkKey(await read(registry, 'currentKey', [sentinel.agentId]));
    label = 'owner:reset';
    const { receipt } = await send(requestFor(guardian, 'resetCircuit', []));
    requireDemoEvent(receipt, guardian.address, guardian.abi, 'CircuitReset', { guardian: account.address });
    requireCheck(await read(guardian, 'currentTier') === 0 && await read(guardian, 'tierUntil') === 0n
      && await read(guardian, 'windowOutflow') === frozenOutflow, 'Owner reset changed accounting or failed to lift the restriction');
    label = 'release:after-reset';
    await release(plan.unit, 0);
    requireCheck(BigInt(report.transfersWei) === plan.perRun && await read(guardian, 'windowOutflow') === plan.perRun,
      'Rehearsal did not transfer its exact per-run budget');
    checkKey(await read(registry, 'currentKey', [sentinel.agentId]));
    for (const entry of report.receipts) {
      requireCheck(equalHex((await client.getBlock({ blockNumber: BigInt(entry.block) })).hash, entry.blockHash), 'Completed rehearsal receipt was reorganized');
    }
    report.checks = { exactFunding: true, benign: true, nearMiss: true, cumulativeCap: true, delay: true,
      freeze: true, tamper: true, duplicate: true, consumedAction: true, ownerReset: true, resetPreservesOutflow: true };
    report.status = 'passed';
    progress();
    return report;
  } catch (error) {
    report.status = 'failed';
    report.failedScene = label ?? 'initialization';
    progress();
    throw error;
  }
}
