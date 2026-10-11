# Horkos — Documentation Set

> **Horkos is an onchain registry and verifier for machine decisions.**
> An AI agent or sentinel has an ERC-8004 identity, signs each decision with a P256 key,
> and any contract can check "did a registered agent really produce this verdict,
> from this model and these inputs?" in one call.

Target: Monad hackathon, track **Trust, Identity & AI Infrastructure**
Deadline: **Oct 14, 2026, 08:59 GMT+5** (plan to submit evening of Oct 13)

## Documents

| # | File | What it answers |
|---|------|-----------------|
| 1 | [01-architecture.md](01-architecture.md) | What are the components, how does data flow, what is trusted where? |
| 2 | [02-core-spec.md](02-core-spec.md) | Exact structs, contract interfaces, signing scheme, SDK API, invariants |
| 3 | [03-coding-map.md](03-coding-map.md) | Repo tree, file-by-file purpose, build order, tasks with acceptance tests |
| 4 | [04-threat-model.md](04-threat-model.md) | What can go wrong, mitigations, honest claims vs not-claimed |
| 5 | [05-execution-plan.md](05-execution-plan.md) | Day-by-day schedule, cut list, traction plan, demo script, submission checklist |
| 6 | [06-project-status.md](06-project-status.md) | Current fix-and-ship phase board and evidence; historical Oct 6 audit |
| 7 | [07-rubric-hardening-plan.md](07-rubric-hardening-plan.md) | Oct 7 rubric requirements, corrected baseline, deployment checks and gated work order |

## Decisions log

| ID | Decision | Reason |
|----|----------|--------|
| D1 | Position as a **primitive** (registry + verifier + SDK), not a security product | Track says "protocol/primitive other apps build on, not a standalone consumer product" |
| D2 | "Verification" = **P256-signed attestation + re-executable evidence bundle**. No zkML in v1 | A deterministic rule-based scorer can be replayed by anyone; a stubbed proof would fail "implemented correctly" |
| D3 | Monad testnet only | One environment, stable integration |
| D4 | Machine signing key = P256 verified by the Monad precompile; WebAuthn passkey is for **human guardian actions** (stretch) | Server-side sentinels cannot use WebAuthn naturally; humans can |
| D5 | Agent identity = **ERC-8004 agentId**; only the agentId owner can bind/revoke keys | Reuses first-class Monad infrastructure instead of inventing identity |
| D6 | Risk tiers follow the implemented Tripwire tiers: **0.65 throttle / 0.85 delay / 0.95 freeze** | The original Horkos doc used 0.85 / 0.95 and no throttle tier; align doc to code |
| D7 | Policy lives in the **consumer**; the verdict only carries a `policyId` | Keeps the primitive generic |
| D8 | Integer-only scoring (basis points), no floats or transcendental math | Makes replay verification deterministic across machines |
| D9 | Verdict ID = EIP-712 digest, not the signature | Removes signature-malleability concerns |

## Verify before coding (Day 1, 2 hours max)

Nothing below is assumed. Check each against current Monad docs and write the result next to the item.

- [x] **V1** P256 precompile address and input/output format on Monad testnet:
  - Address: `0x0100` (`address(0x100)`).
  - Implementation: EIP-7951 (identical interface to RIP-7212).
  - Input: 160 bytes formatted as `[hash(32), r(32), s(32), x(32), y(32)]`.
  - Output: 32 bytes (`uint256(1)` on valid signature; returns empty/revert/zero on failure).
- [x] **V2** ERC-8004 Identity Registry: deployed address on Monad testnet, ABI for `register`, `ownerOf`:
  - Identity Registry address is recorded in [the deployment manifest](../deployments/monad-testnet.json).
  - Standard ERC-721 interface supporting `ownerOf(uint256 agentId) external view returns (address)` and `registerAgent` / `register(string)`.
  - Reputation and Validation Registry integration is outside the current scope.
- [x] **V3** BTX encrypted mempool: is it usable on testnet today?
  - Result: No. BTX by Category Labs was demonstrated in closed research/demos (e.g. Betex 2-of-3 committee) but is not an open, general JSON-RPC feature on Monad testnet today.
  - Decision: Dropped from v1 submission pitch; kept in architecture/roadmap text only.
- [x] **V4** Monad testnet chain ID, RPC URL, faucet, block explorer URL:
  - Chain ID: `10143`
  - RPC URL: `https://testnet-rpc.monad.xyz`
  - Currency: `MON`
  - Block Explorers: `https://testnet.monadscan.com`, `https://testnet.monadvision.com`
  - Faucet: `https://faucet.monad.xyz`
- [x] **V5** Foundry local tests have no precompile at 0x100:
  - Unit test strategy: `vm.etch(address(0x100), address(p256Fallback).code)` in unit tests (task T-03).
  - Integration/fork strategy: Run `Fork.t.sol` against Monad testnet RPC for Task T-21.
- [x] **V6** Installed `@noble/curves` version:
  - Behavior: When signing pre-hashed 32-byte EIP-712 digests, use `p256.sign(digest, privKey, { lowS: true, prehash: false })`. Verified in Node test script: signature correctly verifies with `p256.verify(sig, digest, pubKey, { lowS: true, prehash: false })`.

## Status board (update daily)

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 Verify + repo restructure | done | T-00 to T-03 complete; 5 vectors and P256 fallback verified in Foundry and TS |
| M1 Contracts + tests | locally implemented | Core registry and consumers tested; Tripwire guardrail changes require fresh gas numbers and deployment |
| M2 Testnet deploy | in progress | Historical contracts have code; native P256 acceptance/rejection recorded in evidence/testnet-proof.json. New guardian needs deployment/seed; fork suite still skips |
| M3 SDK + sentinel | locally implemented | Deterministic three-tier replay, source/config model hash, signed evidence, receipt-confirmed submission. Live replay gate remains |
| M4 Tripwire integration | in progress | Owner-controlled trust, outflow cap, bounded delay/freeze and executor implemented locally. New contract and bridge adapter must be configured on testnet |
| M5 Second integrator + dashboard | in progress | CLI re-executes scorer and compares stored fields; dashboard still has seeded rows and stale ABIs; no external integration evidence confirmed |
| M6 Docs + threat model + hardening | in progress | Quickstart and audit corrected; clean checkout, remote CI, gas update and three live demo runs remain |
| M7 Videos + submission | pending | No video links, live hosting URL, logo or submitted form verified in this checkout |
