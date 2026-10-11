import { randomBytes } from 'node:crypto';
import { createSigner, type NormalizedEvent } from '@horkos/sdk';
import { getActiveTripwireModel, loadReplayFeed, processEvent, type ScorerFeatures } from '@horkos/sentinel';

export interface MockSentinelOptions {
  agentId?: bigint;
  chainId?: number;
  registryAddress?: `0x${string}`;
  policyId?: `0x${string}`;
}

/** Test-only signer. No operator environment, wallet, network or disk access. */
export function createMockSentinel(options: MockSentinelOptions = {}) {
  const signer = createSigner(`0x${randomBytes(31).toString('hex').padStart(64, '0')}`);
  const model = getActiveTripwireModel();
  const agentId = options.agentId ?? 7n;
  const chainId = options.chainId ?? 31337;
  const registryAddress = options.registryAddress ?? '0x0000000000000000000000000000000000000001';
  const policyId = options.policyId ?? model.hash;
  return {
    agentId, chainId, registryAddress, policyId, model, publicKey: signer.publicKey(),
    async verdictFor(input: {
      incident?: 'benign' | 'near-miss' | 'throttle' | 'delay' | 'freeze';
      observedAt?: bigint;
      nonce?: bigint;
      event?: NormalizedEvent;
      features?: ScorerFeatures;
    } = {}) {
      const incident = loadReplayFeed({ observedAt: input.observedAt, nonce: input.nonce })
        .find(({ id }) => id === (input.incident ?? 'freeze'));
      if (!incident) throw new Error('Unknown mock incident');
      const event = input.event ?? { ...incident.events[0], nonce: input.nonce ?? incident.events[0].nonce };
      return processEvent(event, input.features ?? incident.features,
        agentId, policyId, model.hash, signer, chainId, registryAddress, model.version);
    },
  };
}
