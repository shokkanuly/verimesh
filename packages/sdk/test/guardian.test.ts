import { describe, it, expect } from 'vitest';
import { decodeEventLog, encodeEventTopics, encodeAbiParameters, parseAbiParameters, keccak256, toHex } from 'viem';
import { TRIPWIRE_GUARDIAN_ABI } from '../src/guardian.js';

describe('guardian trust-change ABI', () => {
  it('decodes agent additions and removals with the indexed identity', () => {
    for (const trusted of [true, false]) {
      const topics = encodeEventTopics({ abi: TRIPWIRE_GUARDIAN_ABI, eventName: 'TrustedAgentSet', args: { agentId: 7n } });
      const data = encodeAbiParameters(parseAbiParameters('bool'), [trusted]);
      const log = decodeEventLog({ abi: TRIPWIRE_GUARDIAN_ABI, topics, data });
      expect(log.eventName).toBe('TrustedAgentSet');
      expect(log.args).toEqual({ agentId: 7n, trusted });
    }
  });
  it('decodes model additions and removals with the indexed model hash', () => {
    const modelHash = keccak256(toHex('synthetic-ABI-model'));
    for (const trusted of [true, false]) {
      const topics = encodeEventTopics({ abi: TRIPWIRE_GUARDIAN_ABI, eventName: 'TrustedModelSet', args: { modelHash } });
      const data = encodeAbiParameters(parseAbiParameters('bool'), [trusted]);
      const log = decodeEventLog({ abi: TRIPWIRE_GUARDIAN_ABI, topics, data });
      expect(log.eventName).toBe('TrustedModelSet');
      expect(log.args).toEqual({ modelHash, trusted });
    }
  });
});
