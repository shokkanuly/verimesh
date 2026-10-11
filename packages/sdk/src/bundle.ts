import { hexToBytes, type Hex } from 'viem';
import { p256 } from '@noble/curves/nist.js';
import type { EvidenceBundle, Verdict, P256Signature, P256PublicKey, VerifyReport } from './types.js';
import { hashInput } from './normalize.js';
import { getDomain } from './domain.js';
import { hashVerdict } from './digest.js';

export function makeBundle(params: {
  chainId: number;
  registry: Hex;
  verdictId: Hex;
  normalizedEvent: Record<string, string | number>;
  features: Record<string, number | string>;
  model: { name: string; version: string; hash: Hex; sourceRef?: string };
  verdict: Verdict;
  signature: P256Signature;
  publicKey: P256PublicKey;
}): EvidenceBundle {
  return {
    version: 1,
    chainId: params.chainId,
    registry: params.registry,
    verdictId: params.verdictId,
    normalizedEvent: params.normalizedEvent,
    features: params.features,
    model: params.model,
    verdict: {
      agentId: params.verdict.agentId.toString(),
      scoreBps: params.verdict.scoreBps,
      policyId: params.verdict.policyId,
      observedAt: Number(params.verdict.observedAt),
      expiry: Number(params.verdict.expiry),
      nonce: params.verdict.nonce.toString(),
    },
    signature: {
      r: params.signature.r,
      s: params.signature.s,
      keyX: params.publicKey.x,
      keyY: params.publicKey.y,
    },
  };
}

export function buildVerdict(params: {
  agentId: bigint;
  modelHash: Hex;
  inputHash: Hex;
  policyId: Hex;
  scoreBps: number;
  ttlSeconds: number;
  observedAt?: bigint;
  nonce?: bigint;
}): Verdict {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const observedAt = params.observedAt ?? now;
  const expiry = observedAt + BigInt(params.ttlSeconds);
  const nonce = params.nonce ?? BigInt(Math.floor(Math.random() * 1_000_000_000));

  return {
    agentId: params.agentId,
    modelHash: params.modelHash,
    inputHash: params.inputHash,
    policyId: params.policyId,
    scoreBps: params.scoreBps,
    observedAt,
    expiry,
    nonce,
  };
}

export interface VerifyBundleOptions {
  expectedScore?: number;
  expectedModelHash?: Hex;
}

export function verifyEvidenceBundle(
  bundle: EvidenceBundle,
  options?: VerifyBundleOptions
): VerifyReport {
  const mismatches: string[] = [];

  // 1. Recompute inputHash from normalizedEvent
  let inputHashMatch = true;
  let recomputedInputHash: Hex | undefined;
  if (bundle.normalizedEvent.routeId && bundle.normalizedEvent.amount !== undefined) {
    try {
      recomputedInputHash = hashInput({
        routeId: bundle.normalizedEvent.routeId as Hex,
        amount: BigInt(bundle.normalizedEvent.amount),
        sourceChainId: BigInt(bundle.normalizedEvent.sourceChainId),
        targetChainId: BigInt(bundle.normalizedEvent.targetChainId),
        recipient: bundle.normalizedEvent.recipient as Hex,
        timestamp: BigInt(bundle.normalizedEvent.timestamp),
        nonce: BigInt(bundle.normalizedEvent.nonce),
      });
    } catch (e) {
      inputHashMatch = false;
      mismatches.push(`Failed to recompute inputHash: ${(e as Error).message}`);
    }
  } else {
    inputHashMatch = false;
    mismatches.push('Missing normalized event fields required to recompute inputHash');
  }

  // 2. Model Hash check
  let modelHashMatch = true;
  if (options?.expectedModelHash && bundle.model.hash.toLowerCase() !== options.expectedModelHash.toLowerCase()) {
    modelHashMatch = false;
    mismatches.push(`Model hash mismatch: expected ${options.expectedModelHash}, got ${bundle.model.hash}`);
  }

  // 3. Score check
  let scoreMatch = true;
  if (options?.expectedScore !== undefined && bundle.verdict.scoreBps !== options.expectedScore) {
    scoreMatch = false;
    mismatches.push(`Score mismatch: expected ${options.expectedScore}, got ${bundle.verdict.scoreBps}`);
  }

  // 4. Recompute EIP-712 digest and compare to verdictId
  const domain = getDomain(bundle.chainId, bundle.registry);
  const reconstructedVerdict: Verdict = {
    agentId: BigInt(bundle.verdict.agentId),
    modelHash: bundle.model.hash,
    inputHash: recomputedInputHash ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
    policyId: bundle.verdict.policyId,
    scoreBps: bundle.verdict.scoreBps,
    observedAt: BigInt(bundle.verdict.observedAt),
    expiry: BigInt(bundle.verdict.expiry),
    nonce: BigInt(bundle.verdict.nonce),
  };

  const recomputedDigest = hashVerdict(reconstructedVerdict, domain);
  const verdictIdMatch = recomputedDigest.toLowerCase() === bundle.verdictId.toLowerCase();
  if (!verdictIdMatch) {
    mismatches.push(`Verdict ID mismatch: bundle ${bundle.verdictId}, computed ${recomputedDigest}`);
  }

  // 5. Signature verification
  let signatureValid = false;
  try {
    const digestBytes = hexToBytes(bundle.verdictId);
    const rBytes = hexToBytes(bundle.signature.r);
    const sBytes = hexToBytes(bundle.signature.s);
    const sigBytes = new Uint8Array(64);
    sigBytes.set(rBytes, 0);
    sigBytes.set(sBytes, 32);

    const xBytes = hexToBytes(bundle.signature.keyX);
    const yBytes = hexToBytes(bundle.signature.keyY);
    const pubBytes = new Uint8Array(65);
    pubBytes[0] = 0x04;
    pubBytes.set(xBytes, 1);
    pubBytes.set(yBytes, 33);

    signatureValid = p256.verify(sigBytes, digestBytes, pubBytes, { lowS: true, prehash: false });
    if (!signatureValid) {
      mismatches.push('P256 signature verification failed against public key');
    }
  } catch (e) {
    signatureValid = false;
    mismatches.push(`Signature verification error: ${(e as Error).message}`);
  }

  const valid = verdictIdMatch && inputHashMatch && modelHashMatch && scoreMatch && signatureValid;

  return {
    valid,
    verdictIdMatch,
    inputHashMatch,
    modelHashMatch,
    scoreMatch,
    signatureValid,
    mismatches,
  };
}
