import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { runVerifyBundle } from '../src/verify-bundle.js';
import { getTripwireModel } from '@horkos/sentinel/model';
const registryFixture = '0x000000000000000000000000000000000000bEEF';
import {
  createSigner,
  normalizeEvent,
  hashInput,
  buildVerdict,
  hashVerdict,
  getDomain,
  makeBundle,
} from '@horkos/sdk';

const rpcClient = vi.hoisted(() => ({ getChainId: vi.fn(), readContract: vi.fn() }));
vi.mock('viem', async (importActual) => ({
  ...await importActual<typeof import('viem')>(),
  createPublicClient: () => rpcClient,
}));

describe('CLI verify-bundle (T-40)', () => {
  const tmpBundlePath = resolve(__dirname, 'test-bundle.json');

  function generateValidBundle() {
    const privKey = '0x0101010101010101010101010101010101010101010101010101010101010101' as const;
    const signer = createSigner(privKey);

    const event = normalizeEvent({
      routeId: '0x1234000000000000000000000000000000000000000000000000000000005678',
      amount: '5000000000000000000',
      sourceChainId: 1,
      targetChainId: 10143,
      recipient: '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08',
      timestamp: 1700000000,
      nonce: 10,
    });
    const inputHash = hashInput(event);
    const modelHash = getTripwireModel().hash;
    const policyId = '0x3333333333333333333333333333333333333333333333333333333333333333' as const;

    const verdict = buildVerdict({
      agentId: 1n,
      modelHash,
      inputHash,
      policyId,
      scoreBps: 8500,
      ttlSeconds: 600,
      observedAt: 1700000000n,
      nonce: 10n,
    });

    const chainId = 10143;
    const registry = registryFixture;
    const domain = getDomain(chainId, registry);
    const verdictId = hashVerdict(verdict, domain);

    return signer.signDigest(verdictId).then((signature) =>
      makeBundle({
        chainId,
        registry,
        verdictId,
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
          proofMismatch: 0,
          unbackedPayout: 0,
          counterpartyFlagged: 0,
          velocitySurgeBps: 8500,
          sizeRatioBps: 0,
        },
        model: {
          name: 'tripwire-rules',
          version: '1.0.0',
          hash: modelHash,
        },
        verdict,
        signature,
        publicKey: signer.publicKey(),
      })
    );
  }

  it('passes on a real valid bundle file', async () => {
    const bundle = await generateValidBundle();
    writeFileSync(tmpBundlePath, JSON.stringify(bundle, null, 2), 'utf8');

    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(true);
      expect(report.mismatches).toHaveLength(0);
      expect(report.output).toContain('RESULT: PASS');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('prints precise MISMATCH when a field (e.g. scoreBps) is edited', async () => {
    const bundle = await generateValidBundle();
    // Tamper with score
    bundle.verdict.scoreBps = 9500;
    writeFileSync(tmpBundlePath, JSON.stringify(bundle, null, 2), 'utf8');

    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(false);
      expect(report.mismatches.length).toBeGreaterThan(0);
      expect(report.output).toContain('RESULT: MISMATCH');
      expect(report.output).toContain('Verdict ID mismatch');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('prints precise MISMATCH when normalizedEvent amount is edited', async () => {
    const bundle = await generateValidBundle();
    // Tamper with amount
    bundle.normalizedEvent.amount = '9999999999999999999';
    writeFileSync(tmpBundlePath, JSON.stringify(bundle, null, 2), 'utf8');

    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(false);
      expect(report.output).toContain('RESULT: MISMATCH');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('rejects altered features even when the verdict and signature are untouched', async () => {
    const bundle = await generateValidBundle();
    bundle.features.velocitySurgeBps = 100;
    writeFileSync(tmpBundlePath, JSON.stringify(bundle), 'utf8');
    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(false);
      expect(report.output).toContain('Score mismatch: expected 0, got 8500');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('rejects a signed verdict for a model that is not the local scorer', async () => {
    const bundle = await generateValidBundle();
    bundle.model.hash = '0x1111111111111111111111111111111111111111111111111111111111111111';
    writeFileSync(tmpBundlePath, JSON.stringify(bundle), 'utf8');
    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(false);
      expect(report.output).toContain('Model hash mismatch');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('rejects fractional scorer features', async () => {
    const bundle = await generateValidBundle();
    bundle.features.velocitySurgeBps = 8500.5;
    writeFileSync(tmpBundlePath, JSON.stringify(bundle), 'utf8');
    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath });
      expect(report.success).toBe(false);
      expect(report.output).toContain('integer basis points');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it.each(['agentId', 'modelHash', 'policyId', 'scoreBps', 'observedAt', 'expiry'])('checks onchain %s instead of only the score', async (field) => {
    const bundle = await generateValidBundle();
    const onchain: Record<string, unknown> = {
      agentId: BigInt(bundle.verdict.agentId), modelHash: bundle.model.hash, policyId: bundle.verdict.policyId,
      scoreBps: bundle.verdict.scoreBps, observedAt: BigInt(bundle.verdict.observedAt),
      expiry: BigInt(bundle.verdict.expiry), submittedAt: 1700000000n, keyEpoch: 1,
    };
    onchain[field] = typeof onchain[field] === 'bigint' ? 999n
      : typeof onchain[field] === 'number' ? 999 : `0x${'99'.repeat(32)}`;
    rpcClient.getChainId.mockResolvedValue(10143);
    rpcClient.readContract.mockResolvedValue(onchain);
    writeFileSync(tmpBundlePath, JSON.stringify(bundle), 'utf8');
    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath, rpcUrl: 'http://localhost:1' });
      expect(report.success).toBe(false);
      expect(report.output).toContain(`Onchain ${field} mismatch`);
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });

  it('fails when a requested onchain check is unavailable', async () => {
    const bundle = await generateValidBundle();
    rpcClient.getChainId.mockResolvedValue(10143);
    rpcClient.readContract.mockRejectedValue(new Error('RPC offline'));
    writeFileSync(tmpBundlePath, JSON.stringify(bundle), 'utf8');
    try {
      const report = await runVerifyBundle({ bundleSource: tmpBundlePath, rpcUrl: 'http://localhost:1' });
      expect(report.success).toBe(false);
      expect(report.output).toContain('Onchain verification failed: RPC offline');
    } finally {
      unlinkSync(tmpBundlePath);
    }
  });
});
