# Combined Bridge Deployment and Publication Workflow

October 9, 2026. **Implemented and tested locally. Live Phase 1/2 and release
gates remain PARTIAL.** No live transaction or canonical manifest publication
was performed. The positive RPC/explorer cases below are synthetic unit fixtures.
The subsequent [local rehearsal tranche](phase2-demo-rehearsal.md) implements
the release/reset/negative scene checks across three disposable runs and records
newer test counts. A safe live wrapper and three real Monad runs remain open;
the counts and preflight observations below belong to this earlier tranche.

## Source and Scope

Working tree based on `0096ea8e29c1087ed9247db1785c4cb58f87389b` on `fix/ship`,
including the earlier uncommitted frontend/input/bridge work and this tranche.
This is not a new isolated committed-checkout, remote CI run, native fork or
clean-history certificate. Original source-pinned audit results are retained
in [FINAL-REPORT.md](FINAL-REPORT.md).

## Implemented

- [DeployDemoScript](../contracts/script/DeployDemo.s.sol) explicitly creates a
  fresh registry, guardian, SimpleGate and MockBridge in that order. It checks
  chain/identity code before creation, emits candidate addresses, and neither
  seeds nor writes a manifest. Three local simulation tests check linked
  ownership, four creations, unchanged manifest and pre-creation failures.
- [Preparation](../scripts/deploy-workflow.mjs) adds explicit
  `--demo --outflow-cap <positive uint256 decimal string>`. It imports only the
  four intended CREATE hashes and verifies each receipt, creation input,
  constructor, runtime and explorer source. Phase 1 remains the default
  three-contract path and cannot accept a bridge by accident.
- [Seed verification](../scripts/deploy-seed-check.mjs) checks a fourth
  `configureBridge` action against the recorded adapter/cap: successful receipt,
  intended guardian owner, exact calldata, receipt log and canonical block.
  Configuration cannot predate the recorded bridge-creation block. The existing
  seed script remains idempotent and validates targets before transactions.
- Publication supports the explicit `demo` stage with four ordered public seed
  records. It defaults to no-write. `--write` retains the previous manifest in
  its public deprecated archive and atomically replaces the local canonical
  file only after checks pass. This is not GitHub or public-host publication.
- Source, guardian/bridge state and seed checks share one pinned snapshot.
  New [demo:preflight](../scripts/demo-preflight.mjs) also checks safe local
  credentials/roles, funding, identity ownership and pending nonces. Its pinned
  funding reads share that same snapshot; pending-nonce reads remain explicitly
  against pending state. Published seed records must match verified history.
- The final source/candidate guard runs immediately before replacement. It may
  exclude only its two exact SHA-named archive outputs from Git dirtiness;
  their contents and regular-file status are separately rechecked. Real-Git
  tests prove normal publication succeeds and late source changes still fail.
  Candidate/archive tampering preserves the canonical manifest and cleans up
  temporary/lock files. No broad dirty-tree exception was added.

Added 39 Node and three Solidity regressions. Tests cover legacy compatibility,
explicit stage/cap parsing, four-contract preparation, Phase 1-to-demo archive
transition, default no-write behavior, bad bridge/configuration receipts,
ownership/cap/source/explorer failures, reorgs, advancing heads, late file changes
and combined-preflight failures. No tests were removed to make these checks pass.

## Fresh Verification

| Command | Actual result |
|---|---|
| `pnpm build` | PASS: workspace packages and dashboard |
| `pnpm test` | PASS: 136 Node + 117 package TS; zero failures |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` in contracts | PASS: 142 Solidity; six explicit offline native-fork skips; scoped gas checks pass |
| `pnpm lint` | PASS: first-party JS syntax and five TS projects |
| `pnpm check:addresses` | PASS: manifest address readers |
| `pnpm check:parity` | PASS: 12 input + 14 verdict vectors; selected 45 TS + 23 Solidity cases |
| `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/verimesh-playwright-browsers pnpm check:dashboard` | PASS: homepage/dashboard, responsive layouts, recorded/API states and synthetic RPC correlation |
| `pnpm deploy:preflight` | Expected exit 1: seven local credential/permission blockers; stopped before RPC |
| `pnpm demo:preflight` | Expected exit 1: same seven blockers; no transaction or file publication |

395 full-suite tests pass. Package TS: SDK 57, sentinel 44, CLI 13, test kit 3.
Parity/focused tests are subsets, not extra tests. Ten Solidity fuzz tests run
1000 cases each. Browser RPC responses are mocked. Foundry emitted a nonfatal
signature-cache permission warning. No native-fork refresh, secret-history scan
or clean-checkout certification was performed in this tranche.

## Current Operator Blockers

Both actual preflights freshly reported, without secret values:

1. Root `.env` is not a regular owner-only file under the safety check.
2. `contracts/.env` fails the same owner-only check.
3. The deployer still matches an exposed/unsafe fixture wallet.
4. Agent-owner credential is missing or malformed.
5. The configured P256 signer remains a public/unsafe fixture.
6. An explicit uint256 decimal agent ID is missing or malformed.
7. Explorer API credential is missing.

Funding, current NFT ownership, live key binding and remote/source verification
were not queried because credential checks stopped first. A previously recorded
fresh P256 PEM does not establish safe environment import or live binding.
Follow [the operator runbook](../docs/08-deployment-workflow.md); never paste
private values in chat. Intended source must also be committed and clean before
real deployment verification; this working tree remains uncommitted.

## Remaining Gates

The combined workflow gap is now closed locally, not exercised on Monad.
Actual creation/source/seed/publication and accepted/negative verdict receipts
remain required. `ready: true` in a fixture means deployment/state checks pass,
not that live demo scenes were executed or bridge funds were reserved for them.
The F-22 runner still needs exact transfer funding, release/reset/negative scenes
and three real runs. Chain-derived feature sources/refetch and stateless epoch
semantics remain engineering work. Clean history, private remote/access, hosted
acceptance, external integration, videos/logo and submission are separate gates.

Ignored credential files, the canonical historical manifest, Git history and
remote configuration were not modified. No spending, key rotation, push,
external outreach, hosting or submission was performed.
