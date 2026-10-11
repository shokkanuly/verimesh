import type { Hex } from 'viem';

export interface Verdict {
  agentId: bigint;
  modelHash: Hex;
  inputHash: Hex;
  policyId: Hex;
  scoreBps: number;
  observedAt: bigint;
  expiry: bigint;
  nonce: bigint;
}

export interface StoredVerdict {
  agentId: bigint;
  modelHash: Hex;
  policyId: Hex;
  scoreBps: number;
  observedAt: bigint;
  submittedAt: bigint;
  expiry: bigint;
  keyEpoch: number;
}

export interface P256PublicKey {
  x: Hex;
  y: Hex;
}

export interface P256Signature {
  r: Hex;
  s: Hex;
}

export interface P256Signer {
  publicKey(): P256PublicKey;
  signDigest(digest: Hex): Promise<P256Signature>;
}

export interface Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
}

export interface NormalizedEvent {
  routeId: Hex;
  amount: bigint;
  sourceChainId: bigint;
  targetChainId: bigint;
  recipient: Hex;
  timestamp: bigint;
  nonce: bigint;
}

export interface BuildVerdictParams {
  agentId: bigint;
  modelHash: Hex;
  inputHash: Hex;
  policyId: Hex;
  scoreBps: number;
  ttlSeconds: number;
  observedAt?: bigint;
  nonce?: bigint;
}

export interface EvidenceBundle {
  version: number;
  chainId: number;
  registry: Hex;
  verdictId: Hex;
  normalizedEvent: Record<string, string | number>;
  features: Record<string, number | string>;
  model: {
    name: string;
    version: string;
    hash: Hex;
    sourceRef?: string;
  };
  verdict: {
    agentId: string;
    scoreBps: number;
    policyId: Hex;
    observedAt: number;
    expiry: number;
    nonce: string;
  };
  signature: {
    r: Hex;
    s: Hex;
    keyX: Hex;
    keyY: Hex;
  };
}

export interface VerifyReport {
  valid: boolean;
  verdictIdMatch: boolean;
  inputHashMatch: boolean;
  modelHashMatch: boolean;
  scoreMatch: boolean;
  signatureValid: boolean;
  onchainMatch?: boolean;
  mismatches: string[];
}
