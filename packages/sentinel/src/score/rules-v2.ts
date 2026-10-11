import type { ScorerFeatures } from './rules.js';

export function scoreFeaturesV2(features: ScorerFeatures): number {
  for (const name of ['proofMismatch', 'unbackedPayout', 'counterpartyFlagged'] as const) {
    if (typeof features[name] !== 'boolean') throw new Error(`Feature ${name} must be boolean`);
  }
  for (const name of ['velocitySurgeBps', 'sizeRatioBps'] as const) {
    const value = features[name];
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new Error(`Feature ${name} must be integer basis points from 0 to 10000`);
    }
  }
  const score = (features.proofMismatch ? 8200 : 0)
    + (features.unbackedPayout ? 6200 : 0)
    + (features.counterpartyFlagged ? 1800 : 0)
    + Math.floor(features.velocitySurgeBps * 1500 / 10000)
    + Math.floor(features.sizeRatioBps * 2000 / 10000);
  return Math.min(10000, score);
}
