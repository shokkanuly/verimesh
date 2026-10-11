# 03 - Implementation Map

October 8, 2026. [Task-by-task status](06-project-status.md) supersedes the original
NEW/REUSE planning tree. File presence alone is not acceptance or live deployment.

## Source Ownership

| Area | Files / responsibility |
|---|---|
| Cryptographic contracts | contracts/src/libs, interfaces, VerdictRegistry.sol |
| Consumer enforcement | contracts/src/HorkosConsumer.sol; examples/TripwireGuardianV2.sol, MockBridge.sol, SimpleGate.sol, GuardedAction.sol |
| Solidity tests | contracts/test: registry, vectors, fuzz invariants, bridge, seed/deployment safety, integration guide, operation gas, separate native fork |
| Shared SDK | packages/sdk/src: ABI encoding, P256, manifest readers, submission receipts, evidence types |
| Sentinel | packages/sentinel/src: normalization pipeline, versioned scoring, replay, executor, verified store and API |
| CLI | packages/cli/src: bundle verification and optional stored-verdict RPC checks |
| Test kit | packages/testing/src; contracts/test/helpers/HorkosTest.sol |
| Product | apps/dashboard/src: explicit modes, shared-ABI logs, evidence verifier |
| Integrator demo | apps/integrator-demo/demo.mjs; integrations/GUIDE.md |
| Safe deployment tools | scripts/deploy-preflight.mjs, deploy-workflow.mjs, verify-deployment.mjs, doctor.mjs |
| Release acceptance | scripts/clean-checkout-check.mjs, check-dashboard.mjs, check-parity.mjs, check-addresses.mjs, scan-secrets.mjs |
| Canonical public addresses | deployments/monad-testnet.json (historical until verified replacement) |
| Shared public fixtures | test-vectors/verdict-vectors.json; evidence/recorded (explicitly synthetic) |
| Generated local artifacts | evidence/replay (ignored, never a live/adoption claim) |

## Local Acceptance

The current suite has 80 Node tests, 89 TypeScript tests and 131 offline Solidity
tests; six native fork cases intentionally skip without RPC. Nine fuzz tests run
1000 cases each. Shared verdict parity has 14 cases. Counts are dated snapshots,
not permanent guarantees; [the final report](../evidence/FINAL-REPORT.md) records
the exact tested commit and commands.

Build/static/address checks, full package tests, scoped gas checks, five signed
CLI checks, disposable sandbox and desktop/mobile browser acceptance run locally.
The clean-checkout runner executes the real four-command quickstart plus package,
contract, parity, replay and integration checks, with private environment excluded.
CI definitions exist but no published remote run is claimed.

## Remaining Engineering Work

- Extend receipt/source/manifest publication to MockBridge; fresh verified deploy,
  seed, accepted verdict, negative cases and safe throwaway-agent rotation.
- Complete live demo orchestration, release/reset scenes and three uninterrupted
  testnet runs with canonical receipts and fresh nonces.
- Build complete-window bridge observation -> deterministic features -> signed
  evidence with source references and CLI independent refetch/re-derivation.
- Add shared normalized-event/inputHash Solidity/TypeScript vectors.
- Resolve unsigned-epoch semantics before a stateless path; preserve v1 encoding
  rather than silently changing the signature schema.
- Public hosted acceptance, independent engineer integration and published CI
  require external/operator steps. History cleanup requires explicit approval.

No second adapter, WebAuthn or quorum is silently marked built. The
[rubric roadmap](07-rubric-hardening-plan.md) distinguishes these from v1 local
features. [Submission pack](../SUBMISSION.md) separates preparation from delivery.
