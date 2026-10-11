# 02 - Current Core Specification

October 8, 2026. Implementation references are authoritative; roadmap extensions
are not API guarantees. Fresh source-equivalent testnet deployment is pending.

## Verdict and Signing

The eight-field v1 verdict is unchanged:

```solidity
struct Verdict {
    uint256 agentId;
    bytes32 modelHash;
    bytes32 inputHash;
    bytes32 policyId;
    uint16 scoreBps;
    uint64 observedAt;
    uint64 expiry;
    uint64 nonce;
}
```

Exact type string:
`Verdict(uint256 agentId,bytes32 modelHash,bytes32 inputHash,bytes32 policyId,uint16 scoreBps,uint64 observedAt,uint64 expiry,uint64 nonce)`.
EIP-712 domain: name Horkos, version 1, chainId, verifyingContract.
ID is the full EIP-712 digest, not signature bytes. P256 signs that digest without
hashing it again; the SDK normalizes low-s and the verifier rejects invalid/high-s
values. Domain separator is fixed at registry construction.

[Solidity encoding](../contracts/src/libs/VerdictLib.sol),
[SDK](../packages/sdk/src), [14 shared vectors](../test-vectors/verdict-vectors.json),
[parity evidence](../evidence/phase1-parity-gas.md).

## Registry Semantics

`bindKey(agentId,x,y)` requires the current ERC-8004 owner, rejects zero
coordinates, increments the epoch and activates the key. Binding does not
independently check curve membership; actual signature verification must succeed.
`revokeKey` requires the owner and an active key, then deactivates it.

`submit(verdict,r,s)` requires non-expiry, an active key, a previously unaccepted
digest and a valid signature. Any relayer may submit. It stores agentId,
modelHash, policyId, scoreBps, observedAt, submittedAt, expiry and keyEpoch.
inputHash and nonce are not stored separately. The acceptance event includes
inputHash; the digest commits to both omitted fields.

`isValid(id,agentId,policyId,minScore,maxAge)` returns false for unknown verdict,
agent/policy mismatch, below-minimum score, expiry, future observation, excessive
age (unless maxAge=0), inactive key or epoch mismatch. It does not check a model
allowlist, action binding, consumption or current NFT ownership. A transferred
identity does not automatically revoke its bound key.
The registry accepts the signed uint16 score range; the Tripwire scorer constrains
its output to 0..10000. Consumers must choose their own semantics and bounds.

`getVerdict` reverts for unknown IDs; `hashVerdict` hashes a full preimage using
the registry domain; `currentKey` returns public coordinates/epoch/active status.
Source: [VerdictRegistry](../contracts/src/VerdictRegistry.sol) and
[interface](../contracts/src/interfaces/IHorkos.sol).

## Consumption and Guardian

`_consume` enforces once in that consumer, checks registry validity, marks
consumed and emits an event. A reverted enclosing action rolls it back.
It does not prevent use by another consumer. Model/caller/action trust is
application-specific; [GuardedAction](../contracts/src/examples/GuardedAction.sol)
shows full-preimage, model and consumer/chain/caller/payload binding.

Tripwire thresholds: throttle >=6500, delay >=8500, freeze >=9500.
Maximum observation age: 300 seconds. Throttle window: 3600 seconds.
Delay: 1800 seconds. Freeze: 86400 seconds. Only the owner can set trust,
configure bridge/cap or reset; ownership transfer is two-step.
Only the configured bridge records outflow. Same/lower active tiers cannot
downgrade or renew restrictions. Pre-throttle outflow counts cumulatively.
[Guardian source](../contracts/src/examples/TripwireGuardianV2.sol),
[bridge source](../contracts/src/examples/MockBridge.sol).

## Tripwire Evidence and API

Normalized input ABI types: bytes32 routeId, uint256 amount/sourceChainId/
targetChainId, address recipient, uint64 timestamp/nonce.
[SDK encoding](../packages/sdk/src/normalize.ts) and
[Solidity helper](../contracts/src/libs/InputHashLib.sol) agree on
`keccak256(abi.encode(...))`, with a 224-byte preimage, not packed encoding.
[Twelve shared input vectors](../test-vectors/input-vectors.json) cover field
mutations, width limits and exact large integers. Normalization and direct
hashing reject malformed bytes, negative/overflow values and unsafe JavaScript
numbers; use bigint or decimal strings for large integers.
[Local parity evidence](../evidence/phase1-input-parity.md). This does not prove
source observations or change the v1 verdict digest.
v1 and v2 scorers are separately versioned and hashed; v2 requires its exact
active source/config hash. CLI/API re-execute supplied features, not chain-derived
observations.

API routes: GET /health, /bundles, /bundle/:id; POST /verify; controlled local
POST /bundle only when read-only is explicitly disabled. Validated public schema,
known models, full verification, 64 KiB request limit, 512-bundle capacity, explicit
origins, socket-IP rate limit, no arbitrary URL fetch, read-only default.
[API/store source](../packages/sentinel/src/server.ts),
[acceptance evidence](../evidence/phase3-evidence-api.md).

## Not Implemented

Stateless verifyVerdict/_consumeSigned, WebAuthn, quorum, challenges/bonds, zkML,
chain-derived feature/source refetch and complete F-22 live orchestration remain
unimplemented. The v1 signature does not bind an epoch. Previously accepted
verdicts are invalidated by key epoch changes, but old unsubmitted signatures
can become acceptable after rebinding the same key. Do not promise otherwise.
[SECURITY.md](../SECURITY.md).
