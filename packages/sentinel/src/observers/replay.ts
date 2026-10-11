import type { NormalizedEvent } from '@horkos/sdk';
import type { ScorerFeatures } from '../score/rules.js';

export interface ReplayIncident {
  id: string;
  name: string;
  events: NormalizedEvent[];
  features: ScorerFeatures;
}

export function loadReplayFeed(options: { observedAt?: bigint; nonce?: bigint } = {}): ReplayIncident[] {
  const features: ScorerFeatures = {
    proofMismatch: false,
    unbackedPayout: false,
    velocitySurgeBps: 1000,
    counterpartyFlagged: false,
    sizeRatioBps: 2000,
  };
  return [
    { id: 'benign', name: 'Routine bridge outflow', features },
    { id: 'near-miss', name: 'Unbacked request without corroborating signals', features: {
      ...features, unbackedPayout: true, velocitySurgeBps: 0, sizeRatioBps: 0,
    } },
    { id: 'throttle', name: 'Unbacked outflow with elevated size', features: {
      ...features, unbackedPayout: true, velocitySurgeBps: 2000, sizeRatioBps: 4000,
    } },
    { id: 'delay', name: 'Flagged unbacked outflow', features: {
      ...features, unbackedPayout: true, counterpartyFlagged: true, velocitySurgeBps: 2000, sizeRatioBps: 3000,
    } },
    { id: 'freeze', name: 'Proof mismatch with corroborating surges', features: {
      ...features, proofMismatch: true, velocitySurgeBps: 6000, sizeRatioBps: 4000,
    } },
  ].map((incident, index) => ({
    ...incident,
    events: [{
      routeId: '0x1234000000000000000000000000000000000000000000000000000000005678',
      amount: BigInt(index + 1) * 100_000n * 10n ** 18n,
      sourceChainId: 1n,
      targetChainId: 10143n,
      recipient: '0x000000000000000000000000000000000000bEEF',
      timestamp: options.observedAt ?? 1700000000n,
      nonce: (options.nonce ?? 42n) + BigInt(index),
    }],
  }));
}
