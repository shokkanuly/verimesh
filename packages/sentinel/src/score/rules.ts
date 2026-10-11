export interface ScorerFeatures {
  proofMismatch: boolean;
  unbackedPayout: boolean;
  velocitySurgeBps: number;
  counterpartyFlagged: boolean;
  sizeRatioBps: number;
}

export function scoreFeatures(features: ScorerFeatures): number {
  if (features.proofMismatch) return 9500;
  if (features.unbackedPayout) return 9000;
  if (features.counterpartyFlagged) return 8500;
  if (features.velocitySurgeBps >= 8500) return 8500;
  if (features.sizeRatioBps >= 6500) return 6500;
  return 0;
}
