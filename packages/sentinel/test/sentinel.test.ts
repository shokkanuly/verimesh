import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { runReplay } from '../src/replay.js';
const registryFixture = '0x000000000000000000000000000000000000bEEF';
import { scoreFeatures } from '../src/score/rules.js';
import { computeModelHash } from '../src/score/modelHash.js';
import { processEvent } from '../src/pipeline.js';
import { createEvidenceServer } from '../src/server.js';
import { createSigner, normalizeEvent, verifyEvidenceBundle } from '@horkos/sdk';

describe('Integer Scorer and Tiers (T-33)', () => {
  it('correctly maps features to FREEZE tier (>= 9500 bps)', () => {
    const score = scoreFeatures({
      proofMismatch: true,
      unbackedPayout: false,
      velocitySurgeBps: 0,
      counterpartyFlagged: false,
      sizeRatioBps: 0,
    });
    expect(score).toBe(9500);
    expect(score >= 9500).toBe(true);
  });

  it('correctly maps features to DELAY tier (>= 8500 bps)', () => {
    // Unbacked payout
    expect(
      scoreFeatures({
        proofMismatch: false,
        unbackedPayout: true,
        velocitySurgeBps: 0,
        counterpartyFlagged: false,
        sizeRatioBps: 0,
      })
    ).toBe(9000);

    // Counterparty flagged
    expect(
      scoreFeatures({
        proofMismatch: false,
        unbackedPayout: false,
        velocitySurgeBps: 0,
        counterpartyFlagged: true,
        sizeRatioBps: 0,
      })
    ).toBe(8500);

    // Velocity surge >= 8500
    expect(
      scoreFeatures({
        proofMismatch: false,
        unbackedPayout: false,
        velocitySurgeBps: 8700,
        counterpartyFlagged: false,
        sizeRatioBps: 0,
      })
    ).toBe(8500);
  });

  it('correctly maps features to THROTTLE tier (>= 6500 bps)', () => {
    const score = scoreFeatures({
      proofMismatch: false,
      unbackedPayout: false,
      velocitySurgeBps: 0,
      counterpartyFlagged: false,
      sizeRatioBps: 7000,
    });
    expect(score).toBe(6500);
    expect(score >= 6500 && score < 8500).toBe(true);
  });

  it('correctly maps safe/clean features to 0 bps', () => {
    const score = scoreFeatures({
      proofMismatch: false,
      unbackedPayout: false,
      velocitySurgeBps: 1000,
      counterpartyFlagged: false,
      sizeRatioBps: 2000,
    });
    expect(score).toBe(0);
  });

  it('produces deterministic modelHash from rules source and config', () => {
    const source = `export function scoreFeatures() { return 0; }`;
    const config = JSON.stringify({ throttleBps: 6500, delayBps: 8500, freezeBps: 9500 });
    const h1 = computeModelHash(source, config);
    const h2 = computeModelHash(source, config);
    expect(h1).toBe(h2);
    expect(h1.startsWith('0x')).toBe(true);
    expect(h1.length).toBe(66);

    // Any alteration in source or config alters the modelHash
    const h3 = computeModelHash(source + ' // modified', config);
    expect(h3).not.toBe(h1);
  });
});

describe('Pipeline and Bundle Creation (T-34)', () => {
  it('runs full pipeline to generate signed verdict and valid bundle', async () => {
    const privKey = '0x0101010101010101010101010101010101010101010101010101010101010101' as const;
    const signer = createSigner(privKey);

    const event = normalizeEvent({
      routeId: '0x1234000000000000000000000000000000000000000000000000000000005678',
      amount: '2000000000000000000',
      sourceChainId: 1,
      targetChainId: 10143,
      recipient: '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08',
      timestamp: 1700000500,
      nonce: 100,
    });

    const features = {
      proofMismatch: false,
      unbackedPayout: false,
      velocitySurgeBps: 8800,
      counterpartyFlagged: false,
      sizeRatioBps: 4000,
    };

    const agentId = 1n;
    const policyId = '0x3333333333333333333333333333333333333333333333333333333333333333' as const;
    const modelHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
    const registryAddress = registryFixture;
    const chainId = 10143;

    const { verdict, bundle } = await processEvent(
      event,
      features,
      agentId,
      policyId,
      modelHash,
      signer,
      chainId,
      registryAddress
    );

    expect(verdict.scoreBps).toBe(8500);
    expect(bundle.verdictId).toBeDefined();

    // Verify bundle with SDK
    const report = verifyEvidenceBundle(bundle, { expectedScore: 8500, expectedModelHash: modelHash });
    expect(report.valid).toBe(true);
  });
});

describe('Evidence HTTP API (T-35)', () => {
  it('serves health check, accepts POST /bundle, and returns GET /bundle/:id', async () => {
    const app = createEvidenceServer({ readOnly: false, preloadDirectories: [] });
    await app.listen(0);
    const port = (app.server.address() as { port: number }).port;

    try {
      const baseUrl = `http://127.0.0.1:${port}`;

      // 1. Health check
      const healthRes = await fetch(`${baseUrl}/health`);
      expect(healthRes.status).toBe(200);
      const healthJson = await healthRes.json();
      expect(healthJson).toMatchObject({ status: 'ok', mode: 'read-write', storedBundlesCount: 0 });

      // 2. 404 on missing bundle
      const notFoundRes = await fetch(`${baseUrl}/bundle/0x${'ab'.repeat(32)}`);
      expect(notFoundRes.status).toBe(404);

      // 3. Store bundle via POST
      const invalidFixture = {
        version: 1,
        chainId: 10143,
        registry: registryFixture,
        verdictId: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        normalizedEvent: { routeId: '0x1' },
        features: { velocitySurgeBps: 9000 },
        model: { name: 'rules', version: '1.0', hash: '0x123' },
        verdict: {
          agentId: '1',
          scoreBps: 8500,
          policyId: '0x3',
          observedAt: 1700000000,
          expiry: 1700000600,
          nonce: '1',
        },
        signature: { r: '0x1', s: '0x2', keyX: '0x3', keyY: '0x4' },
      };

      const invalidRes = await fetch(`${baseUrl}/bundle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invalidFixture),
      });
      expect(invalidRes.status).toBe(422);
      const [{ bundle: dummyBundle }] = await runReplay({
        signer: createSigner(`0x${randomBytes(31).toString('hex').padStart(64, '0')}`),
        agentId: 7n, policyId: `0x${'ab'.repeat(32)}`,
        registryAddress: registryFixture, chainId: 10143,
      });
      const postRes = await fetch(`${baseUrl}/bundle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dummyBundle),
      });
      expect(postRes.status).toBe(201);

      // 4. Retrieve bundle via GET /bundle/:id
      const getRes = await fetch(`${baseUrl}/bundle/${dummyBundle.verdictId}`);
      expect(getRes.status).toBe(200);
      const retrieved = await getRes.json();
      expect(retrieved.verdictId).toBe(dummyBundle.verdictId);
      expect(retrieved.verdict.scoreBps).toBe(dummyBundle.verdict.scoreBps);

      // 5. Query /bundles list
      const listRes = await fetch(`${baseUrl}/bundles`);
      const listJson = await listRes.json();
      expect(listJson.verdictIds).toContain(dummyBundle.verdictId.toLowerCase());
    } finally {
      await app.close();
    }
  });
});
