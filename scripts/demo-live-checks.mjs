import { setTimeout as pause } from 'node:timers/promises';
import { encodeFunctionData, getAddress, keccak256, toHex } from 'viem';
import { addressOf, equalHex, requireCheck } from './deployment-checks.mjs';
import { demoPlan } from './demo-scenes.mjs';

export const liveGasLimit = 2000000n;
export const transactionsPerRun = 20;
export const nativeP256Address = '0x0000000000000000000000000000000000000100';
export const livePolicyId = keccak256(toHex('TRIPWIRE_CIRCUIT_BREAKER_POLICY'));
const noCode = code => code === undefined || code === '0x';
const positive = value => typeof value === 'string' && /^[1-9]\d*$/.test(value) && BigInt(value) < 2n ** 256n;
const sequence = ['verdict:benign', 'release:benign', 'verdict:near-miss', 'release:near-miss',
  'verdict:throttle', 'action:throttle', 'release:throttle', 'release:throttle-to-cap', 'reject:cap-plus-one',
  'verdict:delay', 'action:delay', 'release:delay', 'verdict:freeze', 'action:freeze', 'release:freeze',
  'reject:tampered-signature', 'reject:duplicate-verdict', 'reject:consumed-action', 'owner:reset', 'release:after-reset'];

export function parseLiveArguments(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    requireCheck(['--recipient', '--max-transfer-wei', '--max-gas-wei', '--runs', '--broadcast', '--allow-owner-reset', '--wait-windows'].includes(flag)
      && !Object.hasOwn(values, flag), 'Unknown or duplicate live-demo argument; use --help');
    if (['--broadcast', '--allow-owner-reset', '--wait-windows'].includes(flag)) values[flag] = true;
    else {
      const value = args[++index];
      requireCheck(typeof value === 'string' && !value.startsWith('--'), 'Missing live-demo argument value');
      values[flag] = value;
    }
  }
  requireCheck(/^0x[\da-fA-F]{40}$/.test(values['--recipient']) && positive(values['--max-transfer-wei']) && positive(values['--max-gas-wei']),
    'Live demo requires --recipient <owned EOA> --max-transfer-wei <uint256> --max-gas-wei <uint256>; default is read-only');
  const runs = values['--runs'] ?? '1';
  requireCheck(runs === '1' || runs === '3', '--runs must be 1 or 3');
  requireCheck(!!values['--broadcast'] === !!values['--allow-owner-reset'], 'Broadcasting requires explicit --broadcast and --allow-owner-reset together');
  requireCheck(runs !== '3' || values['--wait-windows'] === true, 'Three runs require --wait-windows; owner reset does not clear cumulative outflow');
  requireCheck(runs === '3' || !values['--wait-windows'], '--wait-windows is only for three runs');
  return Object.freeze({ recipient: getAddress(values['--recipient']), maxTransferWei: values['--max-transfer-wei'],
    maxGasWei: values['--max-gas-wei'], runs: Number(runs), broadcast: !!values['--broadcast'],
    allowOwnerReset: !!values['--allow-owner-reset'], waitWindows: !!values['--wait-windows'] });
}

export function liveBudget(manifest, options) {
  requireCheck(positive(options.maxTransferWei) && positive(options.maxGasWei) && [1, 3].includes(options.runs), 'Invalid explicit live-demo limits');
  const plan = demoPlan(BigInt(manifest.guardian.outflowCap), options.runs);
  const attempted = plan.total + 3n * BigInt(plan.runs);
  requireCheck(attempted < 2n ** 256n && attempted <= BigInt(options.maxTransferWei),
    'Approved transfer limit is below all attempted releases (including three expected blocked units per run)');
  const maxTransactions = transactionsPerRun * plan.runs;
  const priceCap = BigInt(options.maxGasWei) / (BigInt(maxTransactions) * liveGasLimit);
  requireCheck(priceCap > 0n, 'Approved gas budget cannot cover the fixed transaction/gas limits');
  return { ...plan, attempted, maxTransactions, priceCap, maxGasWei: BigInt(options.maxGasWei), maxTransferWei: BigInt(options.maxTransferWei) };
}

export function checkCancelled(signal) {
  requireCheck(!signal?.aborted, 'Live demo cancelled; reconcile saved intents before another broadcast');
}

export async function waitForFreshWindow({ client, guardian, signal, onWait = () => {}, sleep = pause,
  now = () => performance.now(), pollMs = 15000, maxWaitMs = 3660000 }) {
  const deadline = now() + maxWaitMs;
  while (true) {
    checkCancelled(signal);
    requireCheck(await client.getChainId() === 10143, 'Natural-window wait requires Monad testnet');
    const block = await client.getBlock({ blockTag: 'latest' });
    const read = name => client.readContract({ address: guardian.address, abi: guardian.abi, functionName: name, blockNumber: block.number });
    requireCheck(await read('currentTier') === 0, 'Guardian restriction changed while waiting; no automatic reset');
    const started = await read('windowStartedAt');
    const window = await read('THROTTLE_WINDOW');
    const outflow = await read('windowOutflow');
    requireCheck(window === 3600n, 'Unexpected guardian outflow-window duration');
    requireCheck(equalHex((await client.getBlock({ blockNumber: block.number })).hash, block.hash), 'Window-wait snapshot was reorganized');
    if (outflow === 0n || block.timestamp >= started + window) return block;
    requireCheck(now() < deadline, 'Natural-window wait timed out; no time travel or automatic rebroadcast');
    onWait({ checkedAtBlock: block.number.toString(), checkedAtBlockHash: block.hash,
      timestamp: block.timestamp.toString(), readyAt: (started + window).toString() });
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())), undefined, { signal });
  }
}

export function createLiveWriteGuard({ manifest, options, client, walletClient, account, artifacts, signal,
  assertInputsUnchanged, onIntent, onIntentUpdate }) {
  requireCheck(options.broadcast === true && options.allowOwnerReset === true, 'Live writer lacks explicit broadcast/reset authorization');
  requireCheck(typeof assertInputsUnchanged === 'function' && typeof onIntent === 'function' && typeof onIntentUpdate === 'function',
    'Live writer requires source guards and durable intent capture');
  const budget = liveBudget(manifest, options);
  const registry = addressOf(manifest, 'VerdictRegistry');
  const guardian = addressOf(manifest, 'TripwireGuardianV2');
  const bridge = addressOf(manifest, 'MockBridge');
  requireCheck(walletClient.chain?.id === 10143 && equalHex(account.address, manifest.deployer)
    && equalHex(options.recipient, manifest.owners.agent) && !equalHex(account.address, options.recipient), 'Live wallet/recipient roles differ from approved manifest');
  const abiFor = address => equalHex(address, registry) ? artifacts.VerdictRegistry.abi
    : equalHex(address, guardian) ? artifacts.TripwireGuardianV2.abi : artifacts.MockBridge.abi;
  const intents = [];
  let attempted = 0n;
  let nextNonce;
  let fees = 0n;
  const write = async (request, label) => {
    checkCancelled(signal);
    await assertInputsUnchanged();
    requireCheck(label === sequence[intents.length % transactionsPerRun] && intents.length < budget.maxTransactions,
      'Live call order/count differs from the approved scene plan');
    requireCheck(intents.every(intent => intent.status === 'success' || intent.status === 'reverted'), 'Previous live attempt is unresolved; never retry it automatically');
    requireCheck(equalHex(request.account?.address, account.address) && (request.value === undefined || request.value === 0n), 'Unexpected live call account/value');
    const submit = equalHex(request.address, registry) && request.functionName === 'submit'
      && (label.startsWith('verdict:') || ['reject:tampered-signature', 'reject:duplicate-verdict'].includes(label));
    const action = equalHex(request.address, guardian) && request.functionName === 'applyVerdict'
      && (label.startsWith('action:') || label === 'reject:consumed-action');
    const reset = equalHex(request.address, guardian) && request.functionName === 'resetCircuit' && label === 'owner:reset';
    const release = equalHex(request.address, bridge) && request.functionName === 'release'
      && (label.startsWith('release:') || label === 'reject:cap-plus-one');
    requireCheck(submit || action || reset || release, 'Live writer refuses calls outside the four scene operations');
    if (submit) requireCheck(request.args?.length === 3 && request.args[0].agentId === BigInt(manifest.agent.agentId)
      && equalHex(request.args[0].policyId, livePolicyId) && equalHex(request.args[0].modelHash, manifest.allowlists.models[0]), 'Live verdict differs from the approved agent/policy/model');
    if (action) requireCheck(request.args?.length === 2 && request.args[1] === BigInt(manifest.agent.agentId), 'Live action targets another agent');
    if (reset) requireCheck(request.args?.length === 0, 'Live reset has unexpected arguments');
    const amount = release ? request.args?.[1] : 0n;
    const plannedAmount = ['release:benign', 'release:near-miss', 'release:throttle', 'release:after-reset'].includes(label) ? budget.unit
      : label === 'release:throttle-to-cap' ? budget.throttleRemainder : 1n;
    if (release) requireCheck(request.args?.length === 2 && equalHex(request.args[0], options.recipient)
      && typeof amount === 'bigint' && amount === plannedAmount && amount > 0n && amount <= budget.cap && attempted + amount <= budget.attempted,
    'Live release recipient/amount exceeds the approved plan');
    requireCheck(await client.getChainId() === 10143, 'Live writer RPC chain changed');
    const block = await client.getBlock({ blockTag: 'latest' });
    const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args, blockNumber: block.number });
    requireCheck(equalHex(await read(guardian, artifacts.TripwireGuardianV2.abi, 'owner'), account.address)
      && equalHex(await read(bridge, artifacts.MockBridge.abi, 'owner'), account.address), 'Live owner changed');
    requireCheck(BigInt(await read(guardian, artifacts.TripwireGuardianV2.abi, 'pendingOwner')) === 0n
      && BigInt(await read(bridge, artifacts.MockBridge.abi, 'pendingOwner')) === 0n, 'Live ownership transfer is pending');
    requireCheck(equalHex(await read(guardian, artifacts.TripwireGuardianV2.abi, 'bridge'), bridge)
      && equalHex(await read(bridge, artifacts.MockBridge.abi, 'guardian'), guardian)
      && equalHex(await read(guardian, artifacts.TripwireGuardianV2.abi, 'horkos'), registry)
      && equalHex(await read(guardian, artifacts.TripwireGuardianV2.abi, 'policyId'), livePolicyId)
      && await read(guardian, artifacts.TripwireGuardianV2.abi, 'outflowCap') === budget.cap, 'Live bridge/cap changed');
    const key = await read(registry, artifacts.VerdictRegistry.abi, 'currentKey', [BigInt(manifest.agent.agentId)]);
    requireCheck(key[3] && key[2] === manifest.agent.epoch && equalHex(key[0], manifest.agent.keyX) && equalHex(key[1], manifest.agent.keyY), 'Live key binding changed');
    requireCheck(await read(guardian, artifacts.TripwireGuardianV2.abi, 'trustedAgents', [BigInt(manifest.agent.agentId)]) === true
      && await read(guardian, artifacts.TripwireGuardianV2.abi, 'trustedModels', [manifest.allowlists.models[0]]) === true,
    'Live trust configuration changed');
    const nonce = await client.getTransactionCount({ address: account.address, blockNumber: block.number });
    requireCheck(Number.isSafeInteger(nonce) && nonce >= 0 && nonce === await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
      && (nextNonce === undefined || nonce === nextNonce), 'Live wallet has pending or unrelated transactions');
    const gasPrice = await client.getGasPrice();
    requireCheck(gasPrice > 0n && gasPrice <= budget.priceCap, 'Current gas price exceeds the approved maximum');
    requireCheck(await client.getBalance({ address: account.address, blockNumber: block.number })
      >= BigInt(budget.maxTransactions - intents.length) * liveGasLimit * budget.priceCap, 'Live wallet cannot reserve the remaining gas budget');
    requireCheck(noCode(await client.getCode({ address: nativeP256Address, blockNumber: block.number })), 'Live RPC contains fallback code at the native P256 address');
    requireCheck(noCode(await client.getCode({ address: account.address, blockNumber: block.number })), 'Live sender has deployed/delegated code');
    requireCheck(noCode(await client.getCode({ address: options.recipient, blockNumber: block.number })), 'Live recipient is no longer an external account');
    requireCheck(equalHex((await client.getBlock({ blockNumber: block.number })).hash, block.hash), 'Live write snapshot was reorganized');
    await assertInputsUnchanged();
    checkCancelled(signal);
    const abi = abiFor(request.address);
    const intent = { label, chainId: 10143, from: account.address, nonce, to: getAddress(request.address), valueWei: '0',
      preparedAtBlock: block.number.toString(), preparedAtBlockHash: block.hash, calldata: encodeFunctionData({ ...request, abi }),
      gasLimit: liveGasLimit.toString(), gasPriceWei: gasPrice.toString(), status: 'prepared' };
    await onIntent({ ...intent });
    intents.push(intent);
    attempted += amount;
    checkCancelled(signal);
    try {
      const txHash = await walletClient.writeContract({ address: intent.to, abi, functionName: request.functionName,
        args: request.args, account, chain: walletClient.chain, nonce, gas: liveGasLimit, gasPrice, value: 0n });
      requireCheck(/^0x[\da-fA-F]{64}$/.test(txHash), 'Live wallet returned a malformed transaction hash');
      Object.assign(intent, { txHash, status: 'pending' });
      nextNonce = nonce + 1;
      await onIntentUpdate({ ...intent });
      return txHash;
    } catch (error) {
      intent.status = 'broadcast-unknown';
      await onIntentUpdate({ ...intent });
      throw error;
    }
  };
  write.confirm = async ({ receipt, transaction }) => {
    const intent = intents.find(item => equalHex(item.txHash, receipt.transactionHash));
    const expected = intent && (intent.label.startsWith('reject:') || ['release:delay', 'release:freeze'].includes(intent.label)) ? 'reverted' : 'success';
    requireCheck(intent && intent.status === 'pending' && receipt.status === expected && transaction.nonce === intent.nonce
      && transaction.gas === liveGasLimit && transaction.gasPrice === BigInt(intent.gasPriceWei)
      && receipt.gasUsed > 0n && receipt.gasUsed <= liveGasLimit
      && receipt.effectiveGasPrice === BigInt(intent.gasPriceWei), 'Live receipt gas/nonce differs from its saved intent');
    const fee = transaction.gas * receipt.effectiveGasPrice;
    requireCheck(fees + fee <= budget.maxGasWei, 'Live receipt fees exceed the approved total');
    fees += fee;
    Object.assign(intent, { status: receipt.status, block: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(), feeWei: fee.toString() });
    await onIntentUpdate({ ...intent });
  };
  return write;
}
