import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodePacked, keccak256, type Hex } from 'viem';
import { hashInput, normalizeEvent, type RawEventInput } from '../src/normalize.js';
import type { NormalizedEvent } from '../src/types.js';

interface InputVector {
  name: string;
  event: RawEventInput;
  encoded: Hex;
  inputHash: Hex;
}
const fixture = JSON.parse(readFileSync(new URL('../../../test-vectors/input-vectors.json', import.meta.url), 'utf8'));
const vectors: InputVector[] = fixture.vectors;
const base = vectors[0].event;
const uintFields = ['amount', 'sourceChainId', 'targetChainId', 'timestamp', 'nonce'] as const;

describe('Normalized Input Parity', () => {
  it('covers all seven field commitments, width limits and exact large integers', () => {
    expect(vectors).toHaveLength(12);
    expect(fixture.vectorCount).toBe(12);
    expect(new Set(vectors.map(vector => vector.name)).size).toBe(12);
    expect(new Set(vectors.map(vector => vector.inputHash)).size).toBe(12);
    for (const field of Object.keys(base)) expect(vectors.some(vector => vector.name === `changed_${field}`)).toBe(true);
  });

  it.each(vectors)('matches the shared commitment: $name', vector => {
    const event = normalizeEvent(vector.event);
    expect(hashInput(event)).toBe(vector.inputHash);
    expect(keccak256(vector.encoded)).toBe(vector.inputHash);
    expect((vector.encoded.length - 2) / 2).toBe(7 * 32);
    for (const field of uintFields) expect(event[field]).toBe(BigInt(vector.event[field]));
  });

  it('uses ABI word encoding rather than packed encoding', () => {
    const event = normalizeEvent(base);
    const packed = encodePacked(['bytes32', 'uint256', 'uint256', 'uint256', 'address', 'uint64', 'uint64'], [
      event.routeId, event.amount, event.sourceChainId, event.targetChainId, event.recipient, event.timestamp, event.nonce,
    ]);
    expect(hashInput(event)).not.toBe(keccak256(packed));
  });

  it('keeps existing unprefixed hex and exact numeric input support', () => {
    expect(hashInput(normalizeEvent({ ...base, routeId: base.routeId.slice(2), recipient: base.recipient.slice(2),
      sourceChainId: 1, timestamp: 1700000000, nonce: 42n, amount: '0x4563918244f40000' }))).toBe(vectors[0].inputHash);
  });

  it.each(uintFields)('rejects unsafe or noninteger JavaScript numbers in %s', field => {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5]) {
      expect(() => normalizeEvent({ ...base, [field]: value })).toThrow(`${field} must be an exact uint`);
    }
  });

  it.each(uintFields)('rejects invalid strings, negative values and overflow in %s', field => {
    const bits = field === 'timestamp' || field === 'nonce' ? 64n : 256n;
    for (const value of ['', ' ', '1.5', '1e3', '-1', '-0', -1n, 1n << bits]) {
      expect(() => normalizeEvent({ ...base, [field]: value })).toThrow(`${field} must be an exact uint`);
    }
  });

  it.each(['routeId', 'recipient'] as const)('rejects invalid hex and byte widths in %s', field => {
    const bytes = field === 'routeId' ? 32 : 20;
    for (const value of ['0x', `0x${'00'.repeat(bytes - 1)}`, `0x${'00'.repeat(bytes + 1)}`, `0x${'zz'.repeat(bytes)}`]) {
      expect(() => normalizeEvent({ ...base, [field]: value })).toThrow(`${field} must contain exactly ${bytes} hex bytes`);
    }
  });

  it('validates direct hashInput calls instead of silently padding malformed bytes', () => {
    expect(() => hashInput({ ...normalizeEvent(base), routeId: '0x01' })).toThrow('routeId must contain exactly 32 hex bytes');
    expect(() => hashInput({ ...normalizeEvent(base), timestamp: 1n << 64n })).toThrow('timestamp must be an exact uint64');
    expect(() => normalizeEvent({ ...base, amount: true } as unknown as RawEventInput)).toThrow('amount must be an exact uint256');
    expect(() => hashInput({ ...normalizeEvent(base), nonce: Number.MAX_SAFE_INTEGER + 1 } as unknown as NormalizedEvent)).toThrow('nonce must be an exact uint64');
  });
});
