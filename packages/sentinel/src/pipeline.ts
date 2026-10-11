import type { NormalizedEvent, Verdict, EvidenceBundle, P256Signer } from '@horkos/sdk';
import { hashInput, buildVerdict, hashVerdict, makeBundle, getDomain } from '@horkos/sdk';
import { scoreFeatures, type ScorerFeatures } from './score/rules.js';
import { scoreFeaturesV2 } from './score/rules-v2.js';
import { getActiveTripwireModel } from './score/model.js';

export async function processEvent(
  event: NormalizedEvent,
  features: ScorerFeatures,
  agentId: bigint,
  policyId: `0x${string}`,
  modelHash: `0x${string}`,
  signer: P256Signer,
  chainId: number,
  registryAddress: `0x${string}`,
  modelVersion: '1.0.0' | '2.0.0' = '1.0.0',
): Promise<{ verdict: Verdict; bundle: EvidenceBundle }> {
  const inputHash = hashInput(event);
  if (modelVersion === '2.0.0' && modelHash.toLowerCase() !== getActiveTripwireModel().hash.toLowerCase()) {
    throw new Error('The v2 scorer requires its source/config model hash');
  }
  const scoreBps = (modelVersion === '2.0.0' ? scoreFeaturesV2 : scoreFeatures)(features);
  const verdict = buildVerdict({
    agentId,
    modelHash,
    inputHash,
    policyId,
    scoreBps,
    ttlSeconds: 600,
    observedAt: event.timestamp,
    nonce: event.nonce,
  });

  const domain = getDomain(chainId, registryAddress);
  const digest = hashVerdict(verdict, domain);
  const signature = await signer.signDigest(digest);
  const pubKey = signer.publicKey();

  const bundle = makeBundle({
    chainId,
    registry: registryAddress,
    verdictId: digest,
    normalizedEvent: {
      routeId: event.routeId,
      amount: event.amount.toString(),
      sourceChainId: event.sourceChainId.toString(),
      targetChainId: event.targetChainId.toString(),
      recipient: event.recipient,
      timestamp: Number(event.timestamp),
      nonce: event.nonce.toString(),
    },
    features: {
      proofMismatch: features.proofMismatch ? 1 : 0,
      unbackedPayout: features.unbackedPayout ? 1 : 0,
      velocitySurgeBps: features.velocitySurgeBps,
      counterpartyFlagged: features.counterpartyFlagged ? 1 : 0,
      sizeRatioBps: features.sizeRatioBps,
    },
    model: {
      name: 'tripwire-rules',
      version: modelVersion,
      hash: modelHash,
    },
    verdict,
    signature,
    publicKey: pubKey,
  });

  return { verdict, bundle };
}
