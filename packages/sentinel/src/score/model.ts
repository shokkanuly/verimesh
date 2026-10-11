import { readFileSync } from 'node:fs';
import { verifyEvidenceBundle, type EvidenceBundle, type VerifyReport } from '@horkos/sdk';
import { computeModelHash } from './modelHash.js';
import { scoreFeatures, type ScorerFeatures } from './rules.js';
import { scoreFeaturesV2 } from './rules-v2.js';

export function getTripwireModel() {
  const source = readFileSync(new URL('../../src/score/rules.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../../config/model.json', import.meta.url), 'utf8');
  const metadata = JSON.parse(config) as { name: string; version: string };
  return { name: metadata.name, version: metadata.version, hash: computeModelHash(source, config) };
}

export function getActiveTripwireModel() {
  const source = readFileSync(new URL('../../src/score/rules-v2.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../../config/model-v2.json', import.meta.url), 'utf8');
  const metadata = JSON.parse(config) as { name: string; version: '2.0.0' };
  return { name: metadata.name, version: metadata.version, hash: computeModelHash(source, config) };
}

export function readScorerFeatures(features: EvidenceBundle['features']): ScorerFeatures {
  const flag = (name: string): boolean => {
    const value = features[name];
    if (value !== 0 && value !== 1) throw new Error(`Feature ${name} must be integer 0 or 1`);
    return value === 1;
  };
  const bps = (name: string): number => {
    const value = features[name];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) {
      throw new Error(`Feature ${name} must be integer basis points from 0 to 10000`);
    }
    return value;
  };
  return {
    proofMismatch: flag('proofMismatch'),
    unbackedPayout: flag('unbackedPayout'),
    counterpartyFlagged: flag('counterpartyFlagged'),
    velocitySurgeBps: bps('velocitySurgeBps'),
    sizeRatioBps: bps('sizeRatioBps'),
  };
}

export function verifyTripwireBundle(bundle: EvidenceBundle): VerifyReport {
  const v2 = bundle.model.version === '2.0.0';
  const model = v2 ? getActiveTripwireModel() : getTripwireModel();
  let expectedScore: number | undefined;
  let featureError: string | undefined;
  try {
    expectedScore = (v2 ? scoreFeaturesV2 : scoreFeatures)(readScorerFeatures(bundle.features));
  } catch (error) {
    featureError = (error as Error).message;
  }
  const report = verifyEvidenceBundle(bundle, { expectedModelHash: model.hash, expectedScore });
  if (bundle.model.name !== model.name || bundle.model.version !== model.version) {
    report.modelHashMatch = false;
    report.mismatches.push(`Unsupported model: ${bundle.model.name}@${bundle.model.version}`);
  }
  if (featureError) {
    report.scoreMatch = false;
    report.mismatches.push(featureError);
  }
  report.valid = report.valid && report.modelHashMatch && report.scoreMatch;
  return report;
}
