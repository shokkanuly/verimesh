# Gate 1: PARTIAL

October 7, 2026. The human's "go" authorized Phase 1. Phase 2 has not started.
No transaction was broadcast and no GitHub repository was created or pushed.

The later [F-11 local hardening tranche](phase1-deployment-hardening.md) adds
read-only deployment/state checks and fixes simulation-time manifest writes.
The [next F-11 continuation](phase1-deployment-workflow.md) adds safe preflight,
repeatable seeding, compatible readers and confirmed-publication tooling.
Current complete-suite counts are 56 TS, 78 Node regressions and 101 offline
Solidity tests (six intentional offline fork skips). All six fork tests and
20 native parity/gas tests were rerun separately at block 68910254 with no skips.
Both deployment/state commands reject the historical manifest. This is still
PARTIAL, not a freshly deployed or seeded product. The verification section below
records the earlier F-14 tranche, not these later test counts.

## Tasks

| Task | Outcome | Evidence |
|---|---|---|
| F-10 deployment addresses | Done locally; historical manifest unchanged | [Address readers and drift regressions](phase1-addresses.md); commit `b2e9886` |
| F-11 fresh deployment and seed | Local safety/publication tools tested; live BLOCKED | Deployer matches exposed wallet; sentinel matches fixture; owner key/agent ID/API key missing and environment permissions unsafe. No fresh broadcast/seed/publication |
| F-12 real registry verdict and negative cases | BLOCKED on F-11 | No fresh receipts exist; fork simulations and historical transactions are not substitutes |
| F-13 fork tests | Done against read-only Monad RPC | [Failure diagnosis](phase1-fork.md), [six-test output](fork-tests.txt); commit `95bf7ff` |
| F-14 shared parity and scoped gas | Done locally; remote CI configured, not run | [Full results and measured gas](phase1-parity-gas.md); F-14 commit accompanies this report |

## Verification

- `pnpm build`: exit 0, all workspace packages/app build. Vite's existing large-chunk warning remains.
- `pnpm test`: exit 0, 51 TypeScript + 11 Node regression tests pass, zero skips.
- `pnpm check:addresses`: exit 0; stale-address injection makes the executable exit 1.
- `pnpm check:parity`: exit 0; 14 shared cases, 17 targeted TS parity tests and 20 Solidity vector tests pass. Three unrelated TS tests are excluded by the parity selector, not the full suite.
- `cd contracts && MONAD_RPC_URL= forge test --gas-snapshot-check true`: exit 0; 88 offline tests pass, six explicitly disabled fork tests skip.
- `MONAD_RPC_URL=https://testnet-rpc.monad.xyz pnpm test:fork`: exit 0; all six named integration tests pass, zero skips, pinned block 68910254.
- Native-fork parity/gas at that block: 20 pass, zero skips. Native scoped gas check reproduces all five operation values.
- `forge snapshot` (offline): exit 0; all existing test snapshots retained/refreshed, plus new tests. Operation figures come from scoped JSON, not whole-test totals.
- `pnpm verify:testnet`: exit 0; native acceptance/tamper rejection at block 68912091. Read-only code/signature proof only.
- Offline replay generates three signed bundles; the real CLI verifies the freeze bundle with all five checks passing.
- Secret-hygiene regression and `git diff --check`: pass.

Do not run the entire Solidity-fallback suite inside the Monad EVM: its local
`vm.etch(0x100)` setup cannot overwrite a native precompile. The offline and fork
runners deliberately target different EVMs. Requested RPC failures exit nonzero;
they no longer become apparently successful skipped tests.

## Required Before Gate 1 Can Pass

1. Rotate the exposed testnet deployer/relayer and the active public-fixture P256
   signer. Configure fresh keys only in ignored local environment files, never chat.
   Configure an agent-owner credential and confirm ownership/funding. If the
   existing identity is transferred, the old owner key is for that one transfer
   only, not fresh operation. A newly owned identity is the alternative.
2. Deploy and seed the fresh registry, hardened guardian and SimpleGate with those
   credentials. Record actual deployment/seed transaction hashes, nonempty code,
   active currentKey, agent/model trust, and source verification where supported.
   MockBridge remains dependent on F-20 in Phase 2; none was built or invented here.
3. Submit a real verdict through the fresh registry, demonstrate BadSignature and
   AlreadyAccepted, and demonstrate revoke/rebind on a separate throwaway agent.
   Save real receipts/explorer links in `evidence/live/phase1.json` only after they exist.

The private repo remains the human's deferred task. Remote CI cannot be reported
green until that repo exists and runs it. Existing sensitive Git history still
must not be made public without the approved cleanup path from Gate 0.

This is a stop at a partial Gate 1, not a claim that live integration is complete.
Fresh local credentials allow the remaining Phase 1 work to resume; Phase 2 needs
its own human approval after the gate review.
