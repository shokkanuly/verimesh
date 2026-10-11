import { encodeAbiParameters, keccak256, type Hex } from 'viem';
import type { NormalizedEvent } from './types.js';

export interface RawEventInput {
  routeId: Hex | string;
  amount: bigint | string | number;
  sourceChainId: bigint | string | number;
  targetChainId: bigint | string | number;
  recipient: Hex | string;
  timestamp: bigint | string | number;
  nonce: bigint | string | number;
}

function readUint(value: bigint | string | number, bits: number, field: string): bigint {
  const invalid = () => new Error(`${field} must be an exact uint${bits}; use a decimal string or bigint for large values`);
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw invalid();
  if (typeof value === 'string' && !/^(?:[0-9]+|0[xX][0-9a-fA-F]+)$/.test(value)) throw invalid();
  if (!['bigint', 'string', 'number'].includes(typeof value)) throw invalid();
  const integer = BigInt(value);
  if (integer < 0n || integer >= (1n << BigInt(bits))) throw invalid();
  return integer;
}

function readHex(value: string, bytes: number, field: string): Hex {
  if (typeof value !== 'string') throw new Error(`${field} must contain exactly ${bytes} hex bytes`);
  const prefixed = /^0x/i.test(value) ? `0x${value.slice(2)}` : `0x${value}`;
  if (!new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(prefixed)) {
    throw new Error(`${field} must contain exactly ${bytes} hex bytes`);
  }
  return prefixed as Hex;
}

export function normalizeEvent(raw: RawEventInput): NormalizedEvent {
  return {
    routeId: readHex(raw.routeId, 32, 'routeId'),
    amount: readUint(raw.amount, 256, 'amount'),
    sourceChainId: readUint(raw.sourceChainId, 256, 'sourceChainId'),
    targetChainId: readUint(raw.targetChainId, 256, 'targetChainId'),
    recipient: readHex(raw.recipient, 20, 'recipient'),
    timestamp: readUint(raw.timestamp, 64, 'timestamp'),
    nonce: readUint(raw.nonce, 64, 'nonce'),
  };
}

export function hashInput(event: NormalizedEvent): Hex {
  const normalized = normalizeEvent(event);
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'routeId', type: 'bytes32' },
        { name: 'amount', type: 'uint256' },
        { name: 'sourceChainId', type: 'uint256' },
        { name: 'targetChainId', type: 'uint256' },
        { name: 'recipient', type: 'address' },
        { name: 'timestamp', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
      ],
      [
        normalized.routeId,
        normalized.amount,
        normalized.sourceChainId,
        normalized.targetChainId,
        normalized.recipient,
        normalized.timestamp,
        normalized.nonce,
      ]
    )
  );
}
