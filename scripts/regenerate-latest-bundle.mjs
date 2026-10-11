import { readFileSync, writeFileSync } from 'node:fs';
import { bytesToHex } from 'viem';
import { createSigner, getDomain, hashInput, hashVerdict, makeBundle, normalizeEvent } from '../packages/sdk/dist/index.js';
import { getTripwireModel, verifyTripwireBundle } from '../packages/sentinel/dist/score/model.js';

// Rebuild the archived v1 fixture with the real scorer hash and current mock domain.
const original = JSON.parse(readFileSync(new URL('../evidence/archive/pre-horkos/bundle-latest.json', import.meta.url), 'utf8'));
const registry = '0x000000000000000000000000000000000000bEEF';
const model = getTripwireModel();
const event = normalizeEvent(original.normalizedEvent);
const verdict = {
  agentId: BigInt(original.verdict.agentId), modelHash: model.hash, inputHash: hashInput(event),
  policyId: original.verdict.policyId, scoreBps: original.verdict.scoreBps,
  observedAt: BigInt(original.verdict.observedAt), expiry: BigInt(original.verdict.expiry), nonce: BigInt(original.verdict.nonce),
};
const verdictId = hashVerdict(verdict, getDomain(original.chainId, registry));
const signer = createSigner(bytesToHex(new Uint8Array(32).fill(1)));
const bundle = makeBundle({ chainId: original.chainId, registry, verdictId,
  normalizedEvent: original.normalizedEvent, features: original.features, model, verdict,
  signature: await signer.signDigest(verdictId), publicKey: signer.publicKey() });
if (!verifyTripwireBundle(bundle).valid) throw new Error('Regenerated v1 fixture failed verification');
writeFileSync(new URL('../evidence/bundle-latest.json', import.meta.url), `${JSON.stringify(bundle, null, 2)}\n`);
console.log('Regenerated the v1 offline fixture; no onchain acceptance claimed.');
