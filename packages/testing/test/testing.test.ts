import { describe, expect, it } from 'vitest';
import { verifyTripwireBundle } from '@horkos/sentinel';
import { createMockSentinel } from '../src/index.js';

describe('Ephemeral mock sentinel', () => {
  it('produces verified fixtures for every tier without exposing a private key', async () => {
    const sentinel = createMockSentinel();
    expect(Object.keys(sentinel).sort()).toEqual([
      'agentId', 'chainId', 'model', 'policyId', 'publicKey', 'registryAddress', 'verdictFor',
    ]);
    const scores = [];
    for (const incident of ['benign', 'near-miss', 'throttle', 'delay', 'freeze'] as const) {
      const { verdict, bundle } = await sentinel.verdictFor({ incident });
      expect(verifyTripwireBundle(bundle).valid).toBe(true);
      scores.push(verdict.scoreBps);
    }
    expect(scores).toEqual([550, 6200, 7300, 8900, 9900]);
  });

  it('is deterministic within a fixture but creates distinct keys per instance', async () => {
    const first = createMockSentinel(); const second = createMockSentinel();
    expect(first.publicKey).not.toEqual(second.publicKey);
    expect(await first.verdictFor()).toEqual(await first.verdictFor());
  });

  it('binds custom domain, agent, policy, time and nonce', async () => {
    const sentinel = createMockSentinel({ agentId: 88n, chainId: 10143, policyId: `0x${'ab'.repeat(32)}` });
    const { verdict, bundle } = await sentinel.verdictFor({ observedAt: 1800000000n, nonce: 100n });
    expect(verdict.agentId).toBe(88n);
    expect(verdict.observedAt).toBe(1800000000n);
    expect(verdict.nonce).toBe(100n);
    expect(bundle.chainId).toBe(10143);
    expect(verifyTripwireBundle(bundle).valid).toBe(true);
  });
});
