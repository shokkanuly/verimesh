import type { Hex } from 'viem';
import type { Domain } from './types.js';

export const VERDICT_TYPE_STRING =
  'Verdict(uint256 agentId,bytes32 modelHash,bytes32 inputHash,bytes32 policyId,uint16 scoreBps,uint64 observedAt,uint64 expiry,uint64 nonce)';

export const VERDICT_EIP712_TYPES = {
  Verdict: [
    { name: 'agentId', type: 'uint256' },
    { name: 'modelHash', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'policyId', type: 'bytes32' },
    { name: 'scoreBps', type: 'uint16' },
    { name: 'observedAt', type: 'uint64' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
  ],
} as const;

export function getDomain(chainId: number, verifyingContract: Hex): Domain {
  return {
    name: 'Horkos',
    version: '1',
    chainId,
    verifyingContract,
  };
}
