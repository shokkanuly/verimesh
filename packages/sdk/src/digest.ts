import { hashTypedData, type Hex } from 'viem';
import type { Verdict, Domain } from './types.js';
import { VERDICT_EIP712_TYPES } from './domain.js';

export function hashVerdict(v: Verdict, domain: Domain): Hex {
  return hashTypedData({
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: BigInt(domain.chainId),
      verifyingContract: domain.verifyingContract,
    },
    types: VERDICT_EIP712_TYPES,
    primaryType: 'Verdict',
    message: {
      agentId: v.agentId,
      modelHash: v.modelHash,
      inputHash: v.inputHash,
      policyId: v.policyId,
      scoreBps: v.scoreBps,
      observedAt: v.observedAt,
      expiry: v.expiry,
      nonce: v.nonce,
    },
  });
}
