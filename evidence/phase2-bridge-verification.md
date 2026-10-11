# Bridge Verification and Seed Safety

October 8, 2026. **Local tooling implemented; live Phase 2 gate remains PARTIAL.**
Working tree based on `0096ea8e29c1087ed9247db1785c4cb58f87389b` on `fix/ship`;
uncommitted changes, not an isolated committed-checkout or remote CI result.

Historical October 8 tranche. The October 9
[combined workflow continuation](phase2-bridge-workflow.md) supersedes the
missing combined-publication limitation below; these dated counts are retained.

## Implemented

- [Deployment verification](../scripts/deployment-checks.mjs) conditionally
  includes MockBridge as the fourth contract whenever it is recorded. It now
  requires bridge creation receipt, deployment block, runtime hash and
  constructor-argument hash. An address-only bridge record cannot pass.
- A fresh MockBridge artifact is built alongside the three core artifacts.
  Verification checks the actual creation input/deployer/chain, constructor's
  guardian address, canonical receipt, full runtime hash, executable bytes and
  explorer source. Missing artifacts, duplicate addresses or bridge-specific
  mismatches fail even when all three core contracts pass.
- [Doctor](../scripts/doctor.mjs) checks the bridge's guardian back-pointer,
  release owner against `owners.demo`, and absence of a pending ownership
  transfer at the same pinned block as its other state reads. Outflow caps
  must be positive uint256 values. Doctor remains a state check; run source
  verification too, not doctor alone.
- [SeedScript](../contracts/script/Seed.s.sol) checks the bridge's code,
  guardian link, release owner, pending ownership and recorded demo owner
  before its first transaction. A valid seed can rerun without rebinding,
  emitting new trust events or reconfiguring the bridge.
- The closed public schema accepts only the bridge's public provenance fields.
  Secret-shaped additions and out-of-range caps are rejected. Phase 1
  publication still refuses any recorded bridge; its guard was not weakened.

Thirteen new Node regressions and five new Solidity seed tests cover these
changes. Chain/explorer responses in unit tests are synthetic; no real receipt
or explorer equivalence was claimed. An existing address-only bridge test
initially failed earlier at the newly required provenance check; it now tests
both that failure and the original Phase 1 bypass refusal with a complete
synthetic record.

## Verification

| Check | Fresh result |
|---|---|
| `pnpm test` | 97 Node + 117 package TypeScript tests pass; zero failures |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` | 139 pass; zero failures; six explicit offline native-fork skips; scoped gas passes |
| Focused deployment/workflow tests | 80 pass, included in the Node total |
| Focused SeedSafetyTest | 13 pass, included in the Solidity total |
| `pnpm lint` | First-party JS syntax and five TS projects pass |
| `pnpm check:addresses` | Canonical address-reader checks pass |
| Fresh `buildArtifacts` + `compareRuntime` on each local artifact | All four pass; local build self-check, not comparison to live code |

The earlier same-continuation [input-parity tranche](phase1-input-parity.md)
also passed workspace build, shared parity and desktop/mobile browser acceptance.
No SDK/UI source changed after that browser run. Foundry's signature-cache
permission warning is nonfatal. No native fork or secret scan was rerun here.

## Remaining Work

The current deploy/prepare/publish workflow still supports three-contract
Phase 1 candidates only. A combined bridge creation/configuration-receipt and
atomic publication extension remains to be implemented and tested. These
checks must not be used to label a hand-edited manifest as published or to skip
that workflow. Full F-22 live orchestration, release/reset/negative scenes and
three real runs are still open, as are chain-derived observations and stateless
epoch semantics.

The canonical historical manifest, ignored operator credentials, repository
remote and Git history were not changed. No live transaction, source
publication, public hosting, outreach or submission was performed. Live gates
still require fresh safe credentials, source-equivalent deployments and actual
canonical receipts, not passing synthetic tests.
