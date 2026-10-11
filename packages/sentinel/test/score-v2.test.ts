import { describe, expect, it } from 'vitest';
import { getActiveTripwireModel, getTripwireModel, verifyTripwireBundle } from '../src/score/model.js';
import { scoreFeaturesV2 } from '../src/score/rules-v2.js';
import { loadReplayFeed } from '../src/observers/replay.js';
import { runReplay } from '../src/replay.js';
import { createSigner, hashInput, VERDICT_REGISTRY_ABI } from '@horkos/sdk';
import { randomBytes } from 'node:crypto';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Account, type PublicClient, type WalletClient } from 'viem';

const features = loadReplayFeed()[0].features;
const registryAddress = '0x0000000000000000000000000000000000000001';
const options = {
  signer: createSigner(`0x${randomBytes(31).toString('hex').padStart(64, '0')}`),
  agentId: 7n, policyId: getActiveTripwireModel().hash, registryAddress, chainId: 31337,
} as const;

describe('Versioned integer scoring', () => {
  it('uses different source/config identities without changing legacy metadata', () => {
    expect(getTripwireModel().version).toBe('1.0.0');
    expect(getActiveTripwireModel().version).toBe('2.0.0');
    expect(getActiveTripwireModel().hash).not.toBe(getTripwireModel().hash);
  });

  it('floors contributions, stays monotone and clamps to 10000', () => {
    expect(scoreFeaturesV2({ ...features, velocitySurgeBps: 1, sizeRatioBps: 1 })).toBe(0);
    let previous = 0;
    for (let value = 0; value <= 10000; value += 100) {
      const score = scoreFeaturesV2({ ...features, velocitySurgeBps: value, sizeRatioBps: value });
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(previous);
      expect(score).toBeLessThanOrEqual(10000);
      previous = score;
    }
    expect(scoreFeaturesV2({ ...features, proofMismatch: true, unbackedPayout: true })).toBe(10000);
  });

  it.each([-1, 10001, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid basis points: %s', (value) => {
    expect(() => scoreFeaturesV2({ ...features, sizeRatioBps: value })).toThrow('integer basis points');
    expect(() => scoreFeaturesV2({ ...features, velocitySurgeBps: value })).toThrow('integer basis points');
  });

  it('rejects unsupported model metadata and scorer feature tampering', async () => {
    const results = await runReplay(options);
    for (const { bundle } of results) {
      expect(verifyTripwireBundle(bundle).valid).toBe(true);
      const altered = structuredClone(bundle);
      altered.model.version = '3.0.0';
      expect(verifyTripwireBundle(altered).valid).toBe(false);
      altered.model = bundle.model;
      altered.features.proofMismatch = 2;
      expect(verifyTripwireBundle(altered).valid).toBe(false);
    }
  });

  it.each([0, 1])('confirms below-threshold verdict %s without applying a guardian action', async (index) => {
    const incidents = [loadReplayFeed()[index]];
    const bundle = (await runReplay({ ...options, incidents }))[0].bundle;
    const txHash = getActiveTripwireModel().hash;
    const topics = encodeEventTopics({ abi: VERDICT_REGISTRY_ABI, eventName: 'VerdictAccepted', args: {
      verdictId: bundle.verdictId, agentId: options.agentId, policyId: options.policyId,
    } });
    const data = encodeAbiParameters(parseAbiParameters('uint16, bytes32, bytes32, uint64'), [
      bundle.verdict.scoreBps, bundle.model.hash, hashInput(incidents[0].events[0]), BigInt(bundle.verdict.observedAt),
    ]);
    const writes: string[] = [];
    const walletClient = { writeContract: async ({ functionName }: { functionName: string }) => {
      writes.push(functionName); return txHash;
    } } as unknown as WalletClient;
    const publicClient = { waitForTransactionReceipt: async () => ({ status: 'success', logs: [
      { address: registryAddress, topics, data },
    ] }) } as unknown as PublicClient;
    const results = await runReplay({ ...options, incidents, executor: {
      walletClient, publicClient, account: {} as Account, guardianAddress: registryAddress,
    } });
    expect(writes).toEqual(['submit']);
    expect(results[0].submitTxHash).toBe(txHash);
    expect(results[0].action).toBeUndefined();
  });
});
