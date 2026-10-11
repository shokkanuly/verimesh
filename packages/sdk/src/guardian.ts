import { parseAbi } from 'viem';

export const TRIPWIRE_GUARDIAN_ABI = parseAbi([
  'function applyVerdict(bytes32 verdictId, uint256 agentId)',
  'function currentTier() view returns (uint8)',
  'function lastTriggeredAt() view returns (uint64)',
  'function tierUntil() view returns (uint64)',
  'function owner() view returns (address)',
  'function bridge() view returns (address)',
  'function policyId() view returns (bytes32)',
  'function trustedAgents(uint256 agentId) view returns (bool)',
  'function trustedModels(bytes32 modelHash) view returns (bool)',
  'function setTrustedAgent(uint256 agentId, bool trusted)',
  'function setTrustedModel(bytes32 modelHash, bool trusted)',
  'function configureBridge(address adapter, uint256 cap)',
  'function recordOutflow(uint256 amount)',
  'function resetCircuit()',
  'event ActionApplied(bytes32 indexed verdictId, uint16 scoreBps, uint8 tier)',
  'event TrustedAgentSet(uint256 indexed agentId, bool trusted)',
  'event TrustedModelSet(bytes32 indexed modelHash, bool trusted)',
]);
