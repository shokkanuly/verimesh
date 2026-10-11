# 04 - Threat Model

October 8, 2026. This is a prototype threat assessment, not a professional audit
or a claim that passing tests makes the system secure.

## Trust and Assets

Trust one P256 signer per agent, the ERC-8004 ownership contract, target-chain
verification semantics and application-selected agents/models/policies.
Inputs/features may be false even when signatures and re-execution pass.
Assets: operator keys and identities, consumer funds/availability, evidence
integrity, deployment provenance and honest user-facing claims.

## Threats and Residual Risk

| ID | Threat | Implemented mitigation / evidence | Residual risk |
|---|---|---|---|
| T1 | Compromised signer | Owner revoke and accepted-verdict epoch checks; registry tests | Valid malicious verdicts before revocation; owner must stay secure |
| T2 | Malicious/incorrect scorer | Versioned source/config hash and CLI re-execution | A consistent but bad model or false features can still pass |
| T3 | Cross-domain replay | Chain/registry EIP-712 domain; shared negatives | Fixed construction-time separator; chain governance/forks remain trusted |
| T4 | Consumer reuse | Per-consumer consumed map and rollback tests | Independent consumers may consume the same ID; bind exact action/caller |
| T5 | Malleable/invalid signature | Digest IDs, low-s P256 verification; vector tests | Depends on cryptographic libraries/precompile correctness |
| T6 | Submission front-run/censorship | Permissionless relaying of identical verdict | Does not authorize action caller; application must bind it; liveness remains |
| T7 | Stale/future observation | Expiry and consumer maxAge/future checks | Registry submission alone does not enforce application freshness |
| T8 | Untrusted agent/model | Tripwire allowlists; pinned integration trust | Configuration/owner compromise; registry alone is not an allowlist |
| T9 | False positive restriction | Bounded tiers, same-tier no-renew, human reset; bridge tests | Malicious signer may trigger another restriction after expiry/reset |
| T10 | Precompile/identity behavior changes | Fail-closed verifier; explicit pinned native fork suite | Chain/identity upgrades and future behavior are external trust |
| T11 | Scorer nondeterminism | Integer rules, source hashes, versioned replay tests | Synthetic rules are not calibrated attack detection |
| T12 | Input encoding drift | SDK encoding tests; verdict-domain parity | Shared normalized-event Solidity vectors are still missing |
| T13 | Seeded dashboard mistaken for live | RECORDED default, explicit synthetic label, LIVE shared-ABI logs, offline/empty states | Mocked browser RPC tests do not prove fresh actual deployment |
| T14 | History/recording leaks | Removed defaults, ignored secret files, metadata-only scanning and hygiene tests | Known old exposures remain; rotation/approved cleanup pending, not handled yet |
| T15 | Observer lies/cherry-picks | Evidence shows supplied features and normalized event | Complete-window source derivation/refetch is not implemented |
| T16 | Unvalidated API upload | Closed schema, known model, full verification before memory/disk insertion; 20 API tests | Cryptographic consistency is not input truth; public mode must stay read-only |
| T17 | API abuse/CORS/storage | 64 KiB limit, 512 capacity, socket-IP limit, explicit origins, atomic no-overwrite and symlink checks | No distributed rate limit, authenticated ingestion, fsync durability or malicious-local-owner guarantee; proxy limits needed |
| T18 | MockBridge confused with real bridge | Source/tests explicitly native owner-only demonstration with atomic guardian hook | No cross-chain proof validation, real asset custody or external bridge integration |
| T19 | Deployment spoof/provenance drift | Read-only receipt/source/runtime/constructor checks; strict publication tests | Current historical manifest deliberately fails; bridge publication extension pending |
| T20 | Same-key rebind / identity transfer | Accepted verdicts record key epoch; owner can revoke | v1 signs no epoch: old unsubmitted signatures can return after same-key rebind; NFT transfer does not automatically revoke |
| T21 | Generic score used as permission | Reference pins trust and consumer/chain/caller/payload; 14 integration tests | Tripwire risk is not approval; integrators must choose sound domain semantics |

Sources: [registry](../contracts/src/VerdictRegistry.sol),
[consumer](../contracts/src/HorkosConsumer.sol),
[guardian/bridge](../contracts/src/examples),
[verified API evidence](../evidence/phase3-evidence-api.md),
[browser evidence](../evidence/phase3-dashboard.md),
[integration evidence](../evidence/phase5-integration.md),
[deployment evidence](../evidence/phase1-deployment-workflow.md),
[classified exposures](../evidence/phase0-security.md).

## Claims

A verified signature identifies the bound key that attested to committed fields.
Offline evidence verification shows deterministic consistency with the supported
scorer, not truth, freshness, current binding, onchain acceptance or inference
correctness. RPC/state checks are separate and fail if unavailable.

Do not call v1 trustless AI, zkML, a passkey system, independently observed bridge
evidence, production audited security or external adoption.
No stateless verification, quorum, challenge/bond or proof system is implemented.
Current release blockers remain in [SECURITY.md](../SECURITY.md) and
[the status board](06-project-status.md).

## Release Checklist

- [ ] Fresh credentials funded/bound and exposed roles safely replaced.
- [ ] Approved history cleanup scanned; existing history not published.
- [ ] Fresh creation/source/seed/bridge provenance and doctor gates pass.
- [ ] Actual live accepted/action/release/negative receipts and three runs.
- [ ] Published CI and hosted read-only acceptance from a clean browser.
- [ ] Independent security review and integration feedback before production use.
- [ ] Videos/repository reviewed for secrets; honest adopter and feature claims.
