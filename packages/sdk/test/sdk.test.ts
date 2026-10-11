import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashVerdict, getDomain, createSigner, verifyEvidenceBundle } from '../src/index.js';
import type { Verdict } from '../src/types.js';
import { bytesToHex, concat, hexToBytes, hashDomain, hashStruct } from 'viem';
import { p256 } from '@noble/curves/nist.js';
import { VERDICT_EIP712_TYPES } from '../src/domain.js';
const registryFixture = '0x000000000000000000000000000000000000bEEF';

interface TestVector {
  name: string;
  description: string;
  chainId: number;
  verifyingContract: `0x${string}`;
  domainSeparator: `0x${string}`;
  structHash: `0x${string}`;
  digest: `0x${string}`;
  verdict: {
    agentId: string;
    modelHash: `0x${string}`;
    inputHash: `0x${string}`;
    policyId: `0x${string}`;
    scoreBps: number;
    observedAt: number;
    expiry: number;
    nonce: number;
  };
  signer: {
    publicKey: { x: `0x${string}`; y: `0x${string}` };
  };
  signature: { r: `0x${string}`; s: `0x${string}` };
  signatureValid: boolean;
  expectedValid: boolean;
}

describe('Test Vectors Parity', () => {
  const vectorsPath = resolve(__dirname, '../../../test-vectors/verdict-vectors.json');
  const fileContent = JSON.parse(readFileSync(vectorsPath, 'utf8'));
  const vectors: TestVector[] = fileContent.vectors;

  it('rejects archived-domain evidence even when its old P256 signature is valid', () => {
    const retired = JSON.parse(readFileSync(new URL('../../../evidence/archive/pre-horkos/recorded/bundle-benign.json', import.meta.url), 'utf8'));
    const report = verifyEvidenceBundle(retired);
    expect(getDomain(retired.chainId, retired.registry)).toMatchObject({ name: 'Horkos', version: '1' });
    expect(report.signatureValid).toBe(true);
    expect(report.verdictIdMatch).toBe(false);
    expect(report.valid).toBe(false);
  });

  it('contains all 14 shared test vectors', () => {
    expect(vectors.length).toBe(14);
    expect(new Set(vectors.map(v => v.name)).size).toBe(14);
    for (const field of ['agentId', 'modelHash', 'inputHash', 'policyId', 'scoreBps', 'observedAt', 'expiry', 'nonce']) {
      expect(vectors.some(v => v.name === `tampered_${field}`)).toBe(true);
    }
    expect(vectors.some(v => v.name === 'wrong_chain_id')).toBe(true);
    expect(vectors.some(v => v.name === 'wrong_registry')).toBe(true);
    expect(vectors.some(v => v.name === 'expired')).toBe(true);
  });

  for (const v of vectors) {
    it(`digest matches for vector: ${v.name}`, () => {
      const domain = getDomain(v.chainId, v.verifyingContract);
      const verdict: Verdict = {
        agentId: BigInt(v.verdict.agentId),
        modelHash: v.verdict.modelHash,
        inputHash: v.verdict.inputHash,
        policyId: v.verdict.policyId,
        scoreBps: v.verdict.scoreBps,
        observedAt: BigInt(v.verdict.observedAt),
        expiry: BigInt(v.verdict.expiry),
        nonce: BigInt(v.verdict.nonce),
      };

      const digest = hashVerdict(verdict, domain);
      expect(digest.toLowerCase()).toBe(v.digest.toLowerCase());
      expect(hashDomain({ domain, types: { EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ] } })).toBe(v.domainSeparator);
      expect(hashStruct({ data: verdict, primaryType: 'Verdict', types: VERDICT_EIP712_TYPES })).toBe(v.structHash);
      const pub = hexToBytes(concat(['0x04', v.signer.publicKey.x, v.signer.publicKey.y]));
      const sig = hexToBytes(concat([v.signature.r, v.signature.s]));
      expect(p256.verify(sig, hexToBytes(digest), pub, { lowS: true, prehash: false })).toBe(v.signatureValid);
      const canonicalDigest = hashVerdict(verdict, getDomain(vectors[0].chainId, vectors[0].verifyingContract));
      const accepted = verdict.expiry >= 1700000100n
        && p256.verify(sig, hexToBytes(canonicalDigest), pub, { lowS: true, prehash: false });
      expect(accepted).toBe(v.expectedValid);
    });
  }

  it('signer produces matching public key', () => {
    const v0 = vectors[0];
    const signer = createSigner(bytesToHex(new Uint8Array(32).fill(1)));
    const pub = signer.publicKey();
    expect(pub.x.toLowerCase()).toBe(v0.signer.publicKey.x.toLowerCase());
    expect(pub.y.toLowerCase()).toBe(v0.signer.publicKey.y.toLowerCase());
  });

  it('signer produces valid low-s signature matching test vector 0', async () => {
    const v0 = vectors[0];
    const signer = createSigner(bytesToHex(new Uint8Array(32).fill(1)));
    const sig = await signer.signDigest(v0.digest);
    expect(sig.r).toBeDefined();
    expect(sig.s).toBeDefined();

    // Verify against public key using noble p256
    const { p256 } = await import('@noble/curves/nist.js');
    const { hexToBytes } = await import('viem');
    const digestBytes = hexToBytes(v0.digest);
    const rBytes = hexToBytes(sig.r);
    const sBytes = hexToBytes(sig.s);
    const sigBytes = new Uint8Array(64);
    sigBytes.set(rBytes, 0);
    sigBytes.set(sBytes, 32);

    const xBytes = hexToBytes(signer.publicKey().x);
    const yBytes = hexToBytes(signer.publicKey().y);
    const pubBytes = new Uint8Array(65);
    pubBytes[0] = 0x04;
    pubBytes.set(xBytes, 1);
    pubBytes.set(yBytes, 33);

    const ok = p256.verify(sigBytes, digestBytes, pubBytes, { lowS: true, prehash: false });
    expect(ok).toBe(true);
  });
});

describe('Normalization and Hashing (T-32)', () => {
  it('normalizes raw event and produces deterministic 32-byte inputHash', async () => {
    const { normalizeEvent, hashInput } = await import('../src/index.js');
    const raw = {
      routeId: '0x1234000000000000000000000000000000000000000000000000000000005678',
      amount: '5000000000000000000',
      sourceChainId: 1,
      targetChainId: 10143,
      recipient: '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08',
      timestamp: 1700000000,
      nonce: 10,
    };

    const ev = normalizeEvent(raw);
    expect(ev.amount).toBe(5000000000000000000n);
    expect(ev.sourceChainId).toBe(1n);

    const h1 = hashInput(ev);
    const h2 = hashInput(ev);
    expect(h1).toBe(h2);
    expect(h1.startsWith('0x')).toBe(true);
    expect(h1.length).toBe(66);
  });
});

describe('Evidence Bundle Creation and Verification (T-35, T-40)', () => {
  it('passes all 5 verification checks for a valid evidence bundle', async () => {
    const {
      normalizeEvent,
      hashInput,
      buildVerdict,
      hashVerdict,
      getDomain,
      createSigner,
      makeBundle,
      verifyEvidenceBundle,
    } = await import('../src/index.js');

    const privKey = '0x0101010101010101010101010101010101010101010101010101010101010101' as const;
    const signer = createSigner(privKey);

    const rawEvent = {
      routeId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      amount: 1000n,
      sourceChainId: 1n,
      targetChainId: 10143n,
      recipient: '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08',
      timestamp: 1700000000n,
      nonce: 42n,
    };
    const ev = normalizeEvent(rawEvent);
    const inputHash = hashInput(ev);

    const modelHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
    const policyId = '0x3333333333333333333333333333333333333333333333333333333333333333' as const;

    const verdict = buildVerdict({
      agentId: 1n,
      modelHash,
      inputHash,
      policyId,
      scoreBps: 8500,
      ttlSeconds: 600,
      observedAt: 1700000000n,
      nonce: 42n,
    });

    const chainId = 10143;
    const registry = registryFixture;
    const domain = getDomain(chainId, registry);
    const verdictId = hashVerdict(verdict, domain);
    const signature = await signer.signDigest(verdictId);

    const bundle = makeBundle({
      chainId,
      registry,
      verdictId,
      normalizedEvent: {
        routeId: ev.routeId,
        amount: ev.amount.toString(),
        sourceChainId: ev.sourceChainId.toString(),
        targetChainId: ev.targetChainId.toString(),
        recipient: ev.recipient,
        timestamp: Number(ev.timestamp),
        nonce: ev.nonce.toString(),
      },
      features: {
        proofMismatch: 0,
        unbackedPayout: 0,
        velocitySurgeBps: 8500,
        counterpartyFlagged: 0,
        sizeRatioBps: 5000,
      },
      model: {
        name: 'tripwire-rules',
        version: '1.0.0',
        hash: modelHash,
      },
      verdict,
      signature,
      publicKey: signer.publicKey(),
    });

    const report = verifyEvidenceBundle(bundle, { expectedScore: 8500, expectedModelHash: modelHash });
    expect(report.valid).toBe(true);
    expect(report.verdictIdMatch).toBe(true);
    expect(report.signatureValid).toBe(true);
    expect(report.scoreMatch).toBe(true);
    expect(report.mismatches).toHaveLength(0);
  });

  it('detects precise mismatch when a field is tampered', async () => {
    const {
      normalizeEvent,
      hashInput,
      buildVerdict,
      hashVerdict,
      getDomain,
      createSigner,
      makeBundle,
      verifyEvidenceBundle,
    } = await import('../src/index.js');

    const privKey = '0x0101010101010101010101010101010101010101010101010101010101010101' as const;
    const signer = createSigner(privKey);

    const ev = normalizeEvent({
      routeId: '0x1111111111111111111111111111111111111111111111111111111111111111',
      amount: 1000n,
      sourceChainId: 1n,
      targetChainId: 10143n,
      recipient: '0x133603465aDdE7C39fa0E6E34b264E1573e1FD08',
      timestamp: 1700000000n,
      nonce: 42n,
    });
    const inputHash = hashInput(ev);
    const modelHash = '0x1111111111111111111111111111111111111111111111111111111111111111' as const;
    const policyId = '0x3333333333333333333333333333333333333333333333333333333333333333' as const;

    const verdict = buildVerdict({
      agentId: 1n,
      modelHash,
      inputHash,
      policyId,
      scoreBps: 8500,
      ttlSeconds: 600,
      observedAt: 1700000000n,
      nonce: 42n,
    });

    const chainId = 10143;
    const registry = registryFixture;
    const domain = getDomain(chainId, registry);
    const verdictId = hashVerdict(verdict, domain);
    const signature = await signer.signDigest(verdictId);

    const bundle = makeBundle({
      chainId,
      registry,
      verdictId,
      normalizedEvent: {
        routeId: ev.routeId,
        amount: ev.amount.toString(),
        sourceChainId: ev.sourceChainId.toString(),
        targetChainId: ev.targetChainId.toString(),
        recipient: ev.recipient,
        timestamp: Number(ev.timestamp),
        nonce: ev.nonce.toString(),
      },
      features: {
        proofMismatch: 0,
        unbackedPayout: 0,
        velocitySurgeBps: 8500,
        counterpartyFlagged: 0,
        sizeRatioBps: 5000,
      },
      model: { name: 'tripwire-rules', version: '1.0.0', hash: modelHash },
      verdict,
      signature,
      publicKey: signer.publicKey(),
    });

    // Tamper score from 8500 to 9500
    bundle.verdict.scoreBps = 9500;
    const report = verifyEvidenceBundle(bundle);
    expect(report.valid).toBe(false);
    expect(report.verdictIdMatch).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
  });
});
