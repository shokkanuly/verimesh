import { parseAbi, encodeFunctionData } from 'viem';
import { requireCheck, equalHex, addressOf } from './deployment-checks.mjs';

const abi = parseAbi([
  'event AgentKeyBound(uint256 indexed agentId, uint32 indexed epoch, bytes32 x, bytes32 y)',
  'event TrustedAgentSet(uint256 indexed agentId, bool trusted)',
  'event TrustedModelSet(bytes32 indexed modelHash, bool trusted)',
  'event BridgeConfigured(address indexed bridge, uint256 outflowCap)',
  'function bindKey(uint256 agentId, bytes32 x, bytes32 y)',
  'function setTrustedAgent(uint256 agentId, bool trusted)',
  'function setTrustedModel(bytes32 modelHash, bool trusted)',
  'function configureBridge(address bridge, uint256 outflowCap)',
]);

export async function verifySeed({ manifest, client, snapshotBlock, snapshotHash }) {
  requireCheck(manifest.allowlists.agents.length === 1 && manifest.allowlists.models.length === 1, 'Seed verification expects one intended agent/model');
  const block = await client.getBlock({ blockNumber: snapshotBlock });
  requireCheck(equalHex(block.hash, snapshotHash), 'Seed state snapshot was reorganized');
  const agentId = BigInt(manifest.agent.agentId);
  const intents = [
    { name: 'bindKey', event: 'AgentKeyBound', contract: 'VerdictRegistry', owner: 'agent',
      args: [agentId, manifest.agent.keyX, manifest.agent.keyY],
      match: args => args.agentId === agentId && Number(args.epoch) === manifest.agent.epoch && equalHex(args.x, manifest.agent.keyX) && equalHex(args.y, manifest.agent.keyY) },
    { name: 'setTrustedAgent', event: 'TrustedAgentSet', contract: 'TripwireGuardianV2', owner: 'guardian',
      args: [agentId, true], match: args => args.agentId === agentId && args.trusted === true },
    { name: 'setTrustedModel', event: 'TrustedModelSet', contract: 'TripwireGuardianV2', owner: 'guardian',
      args: [manifest.allowlists.models[0], true], match: args => equalHex(args.modelHash, manifest.allowlists.models[0]) && args.trusted === true },
  ];
  if (manifest.contracts.MockBridge !== undefined) {
    const bridge = addressOf(manifest, 'MockBridge');
    const cap = manifest.guardian?.outflowCap;
    requireCheck(typeof cap === 'string' && /^[1-9]\d*$/.test(cap) && BigInt(cap) < 2n ** 256n, 'Bridge seed requires a positive uint256 outflow cap');
    intents.push({ name: 'configureBridge', event: 'BridgeConfigured', contract: 'TripwireGuardianV2', owner: 'guardian',
      args: [bridge, BigInt(cap)], notBefore: BigInt(manifest.contracts.MockBridge.block),
      match: args => equalHex(args.bridge, bridge) && args.outflowCap === BigInt(cap) });
  }
  const results = [];
  for (const intent of intents) {
    const address = addressOf(manifest, intent.contract);
    const event = abi.find(item => item.type === 'event' && item.name === intent.event);
    const logs = [];
    for (let start = BigInt(manifest.contracts[intent.contract].block); start <= block.number; start += 100n) {
      const end = start + 99n < block.number ? start + 99n : block.number;
      const batch = await client.getLogs({ address, event, fromBlock: start, toBlock: end, strict: true });
      requireCheck(batch.every(log => !log.removed && equalHex(log.address, address) && log.blockNumber >= start
        && log.blockNumber <= end && log.eventName === intent.event), 'Seed RPC logs fall outside the intended contract/event/range');
      logs.push(...batch.filter(log => log.args && intent.match(log.args)));
    }
    logs.sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex);
    const log = logs.at(-1);
    requireCheck(!!log && typeof log.transactionHash === 'string', `Confirmed ${intent.name} seed event is missing`);
    requireCheck(intent.notBefore === undefined || log.blockNumber >= intent.notBefore, 'Bridge configuration seed predates bridge creation');
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    requireCheck(receipt.status === 'success' && equalHex(receipt.transactionHash, log.transactionHash)
      && receipt.blockNumber === log.blockNumber && equalHex(receipt.blockHash, log.blockHash)
      && equalHex(receipt.from, manifest.owners[intent.owner]), `${intent.name} seed receipt is failed or mismatched`);
    const tx = await client.getTransaction({ hash: log.transactionHash });
    requireCheck(equalHex(tx.hash, log.transactionHash) && Number(tx.chainId) === manifest.chainId
      && equalHex(tx.to, address) && equalHex(tx.from, manifest.owners[intent.owner]) && tx.blockNumber === receipt.blockNumber
      && equalHex(tx.blockHash, receipt.blockHash) && equalHex(tx.input, encodeFunctionData({ abi, functionName: intent.name, args: intent.args })),
    `${intent.name} seed transaction differs from the intended sender/target/calldata`);
    requireCheck(receipt.logs?.some(item => equalHex(item.address, address) && item.logIndex === log.logIndex && equalHex(item.data, log.data)
      && Array.isArray(item.topics) && item.topics.length === log.topics?.length && item.topics.every((topic, index) => equalHex(topic, log.topics[index]))),
    `${intent.name} seed event is absent from the confirmed receipt`);
    requireCheck(equalHex((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash), `${intent.name} seed receipt is not canonical`);
    results.push({ action: intent.name, txHash: log.transactionHash, block: Number(log.blockNumber) });
  }
  requireCheck(equalHex((await client.getBlock({ blockNumber: block.number })).hash, block.hash), 'Seed snapshot was reorganized during receipt checks');
  return results;
}
