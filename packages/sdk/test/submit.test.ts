import { describe, it, expect, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Account, type PublicClient, type WalletClient } from 'viem';
import { submitVerdict, VERDICT_REGISTRY_ABI } from '../src/submit.js';

const registry = '0x0000000000000000000000000000000000000001' as const;
const other = '0x0000000000000000000000000000000000000002' as const;
const hash = `0x${'11'.repeat(32)}` as const;
const verdict = {
  agentId: 1n, modelHash: hash, inputHash: hash, policyId: hash,
  scoreBps: 8500, observedAt: 1700000000n, expiry: 1700000600n, nonce: 42n,
};
const accepted = {
  address: registry,
  topics: encodeEventTopics({ abi: VERDICT_REGISTRY_ABI, eventName: 'VerdictAccepted', args: { verdictId: hash, agentId: 1n, policyId: hash } }),
  data: encodeAbiParameters(parseAbiParameters('uint16, bytes32, bytes32, uint64'), [8500, hash, hash, 1700000000n]),
};

function clients(receipt: unknown) {
  const wallet = { writeContract: vi.fn().mockResolvedValue(hash) };
  const publicClient = { waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt) };
  return [wallet as unknown as WalletClient, publicClient as unknown as PublicClient] as const;
}

describe('Confirmed verdict submission', () => {
  it('finds the registry event after an unrelated log', async () => {
    const [wallet, client] = clients({ status: 'success', logs: [{ ...accepted, address: other }, accepted] });
    expect(await submitVerdict(wallet, client, registry, verdict, { r: hash, s: hash }, {} as Account))
      .toEqual({ verdictId: hash, txHash: hash });
  });

  it('does not report acceptance for a reverted receipt', async () => {
    const [wallet, client] = clients({ status: 'reverted', logs: [] });
    await expect(submitVerdict(wallet, client, registry, verdict, { r: hash, s: hash }, {} as Account)).rejects.toThrow('reverted');
  });

  it('does not trust an acceptance emitted by another address', async () => {
    const [wallet, client] = clients({ status: 'success', logs: [{ ...accepted, address: other }] });
    await expect(submitVerdict(wallet, client, registry, verdict, { r: hash, s: hash }, {} as Account)).rejects.toThrow('no matching VerdictAccepted');
  });

  it('requires the accepted event to match the submitted verdict', async () => {
    const [wallet, client] = clients({ status: 'success', logs: [accepted] });
    await expect(submitVerdict(wallet, client, registry, { ...verdict, scoreBps: 9500 }, { r: hash, s: hash }, {} as Account)).rejects.toThrow('no matching VerdictAccepted');
  });
});
