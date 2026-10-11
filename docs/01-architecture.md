# 01 - Architecture

This describes the current implementation, not a completed deployed product.
[Architecture image and data flow](../ARCHITECTURE.md) and
[current status](06-project-status.md) are the entry points.

## Components and Boundaries

| Component | Actual implementation | Evidence / limit |
|---|---|---|
| Replay observer | Five synthetic incidents in sentinel replay feed | No independently derived chain features |
| Normalizer | Typed route/amount/chains/recipient/timestamp/nonce encoding | SDK tests; shared normalized-event Solidity vectors still pending |
| Scorer | Versioned integer rules, source/config model hashes | v1 retained, v2 replay active; synthetic reference, not calibrated probability |
| Signer | Raw low-s P256 over EIP-712 digest | Not WebAuthn; offline fixture is public test material |
| Registry | ERC-8004 owner binding, active key epochs, permissionless submission | One signer; no admin owner or inference proof |
| Consumer base | Accepted validity + per-consumer consumed map | Application must add trusted-model and action/caller binding |
| Tripwire | Allowlisted agent/model/policy and bounded restrictions | First-party reference |
| MockBridge | Owner release, reentrancy guard, atomic outflow hook then transfer | Native mock, not real cross-chain bridge |
| GuardedAction | Fixed caller/trust + full-preimage action binding | Generic approval-score counter/event fixture |
| Evidence API | Verified bounded memory/disk store, read-only default, limits/CORS | No signing keys; public hosting not deployed |
| Dashboard | Explicit RECORDED/LIVE, shared-ABI log correlation and selected evidence | Recent 2,001-block range; no full-history or live-ready claim |
| Sandbox / test kit | Disposable Anvil and fresh in-memory signers | Local fallback and mocked identity, not native testnet |

Sources: [registry](../contracts/src/VerdictRegistry.sol),
[guardian](../contracts/src/examples/TripwireGuardianV2.sol),
[bridge](../contracts/src/examples/MockBridge.sol),
[pipeline](../packages/sentinel/src/pipeline.ts),
[API](../packages/sentinel/src/server.ts),
[feed](../apps/dashboard/src/feed.ts).

## Enforcement

Scores below 6500 do not trigger an action. Scores 6500-8499 throttle cumulative
native outflow within a one-hour window; 8500-9499 delay releases for 1800 seconds;
9500+ freeze releases for at most one day per active restriction.
Only escalation changes an active restriction; same/lower tiers cannot lower
or renew it. Expiry is automatic and the owner can reset early.
Normal outflows count before a throttle starts. A later fresh verdict can
start a new restriction after expiry/reset; the bound is not lifetime immunity
to a malicious signer. Reset does not erase the rolling outflow count.

MockBridge calls the guardian before sending funds; a failed recipient or
insufficient balance rolls accounting back in the same transaction. See
[16 bridge tests](../contracts/test/MockBridge.t.sol).

## Evidence Scope

Offline verification recomputes canonical input hash, versioned source/config
hash, integer score, EIP-712 ID and low-s signature. Optional CLI RPC checks compare
stored fields and configured chain state; they do not refetch complete bridge
windows or derive feature truth. The registry stores no separate inputHash/nonce;
action-specific consumers can supply the full signed preimage and hash it to the
accepted ID. See [the integration guide](../integrations/GUIDE.md).

No one-transaction stateless path, passkeys, quorum, challenges or zkML is built.
Fresh deployment/provenance, live replay, public hosting and cleaned history are
separate release gates. [Security assumptions](../SECURITY.md).
