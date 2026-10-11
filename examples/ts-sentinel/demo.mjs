import assert from 'node:assert/strict';
import { createMockSentinel } from '../../packages/testing/dist/index.js';
import { verifyTripwireBundle } from '../../packages/sentinel/dist/index.js';

const sentinel = createMockSentinel();
const { verdict, bundle } = await sentinel.verdictFor({ incident: 'freeze', nonce: 100n });
assert.equal(verdict.scoreBps, 9900);
assert.equal(verdict.nonce, 100n);
assert.equal(verifyTripwireBundle(bundle).valid, true);
console.log('First-party LOCAL / SYNTHETIC fixture: signed evidence verification PASS');
