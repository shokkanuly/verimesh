# Three-Run Local Enforcement Rehearsal

October 9, 2026. **Local implementation and acceptance pass. F-22's live gate
remains PARTIAL.** All receipts below come from a disposable Anvil chain, not
Monad. Inputs/features are synthetic and P256 uses the Solidity fallback.

## Source and Scope

Working tree based on `0096ea8e29c1087ed9247db1785c4cb58f87389b`, branch `fix/ship`,
including earlier uncommitted work. No isolated committed-checkout, native-fork,
remote-CI or cleaned-history certificate was refreshed in this tranche.
The canonical historical manifest, ignored operator credentials, Git history
and remote configuration were not changed. The Node harness does not read dotenv
or pass operator wallet credentials to its child processes. Forge compilation
still uses normal local Foundry configuration; no deploy script is executed.
No testnet transaction, hosting, outreach or submission ran.

## Implementation

`pnpm demo:rehearse` builds the workspace and launches a fresh loopback Anvil
with zero default accounts. The existing sandbox creates ephemeral in-memory
wallet/P256 keys, mock identity, registry, guardian and bridge. No private key
is written to the evidence files. The default `pnpm sandbox` behavior is retained.

The [scene checker](../scripts/demo-scenes.mjs) validates chain 31337, contract
links, ownership/pending ownership, policy/allowlists, active signer/epoch, an idle
guardian, fresh outflow window and the transfer budget before wallet submission.
Recipient must be a distinct nonzero account without contract code.

Each run submits five independently verified signed bundles through the SDK,
checks the accepted digest/event and applies the three intended restriction tiers
through the existing executor. It then exercises:

- Benign and near-miss: successful transfers without restrictions.
- Throttle: two releases reaching the exact cumulative cap, then a one-unit
  excess rejected specifically with `OutflowCapExceeded`.
- Delay and freeze: blocked transfers with the exact `OutflowBlocked` tier and
  deadline, not a transport error or unrelated insufficient-funds failure.
- Tampered signature, duplicate verdict and consumed action: actual reverted
  calls with `BadSignature`, `AlreadyAccepted` and `VerdictConsumed`, respectively.
- Owner reset: exact `CircuitReset`, restriction/deadline cleared, accounting
  preserved, followed by a successful additional release.

Scene receipts are checked against exact calldata, sender/target, chain, value,
transaction/receipt identity and canonical block hashes. Success requires exact
bridge/recipient/outflow deltas and matching release/outflow events. Reverts
must have no logs and unchanged accounting. Expected errors are simulated both
before submission and at the mined receipt block. Key/epoch stability and all
receipt block hashes are rechecked before completion.

Each fresh invocation writes an exclusive UUID directory under ignored
`evidence/replay/rehearsal/`. Pending hashes are journaled before receipt waits;
bundle files and an atomically replaced report are saved as progress arrives.
Failure is recorded without copying provider diagnostics or claiming completed
checks. Flags, including `--live`, are rejected before a node starts.
The [CI definition](../.github/workflows/ci.yml) now runs the local rehearsal in
the Foundry-enabled quickstart job and uploads public reports, including failures.
This is a workflow definition, not evidence of a published green run.

## Actual Local Result

[Saved public machine report](phase2-demo-rehearsal.json): three passed runs,
**70 receipts: 52 successful and 18 expected reverts**, including ten setup
receipts and twenty scene receipts per run. Fifteen verdict IDs are distinct.
The final bridge balance is zero and the recipient receives exactly the funded
total. Setup receipts and scene receipts are checked for canonical block hashes.

The local cap is 3 local ETH units; one release unit is 0.75 local ETH. Each run
transfers 3.75 and three runs transfer exactly 11.25 local ETH. These are disposable
Anvil balances, not real funds or a proposed live spending budget. The saved run
took 5.07 seconds with cached compilation on this machine; no general timing
guarantee is made. Two earlier failed development reports remain labeled failed
under the ignored directory and are not counted as successful runs.

**Reset does not clear `windowOutflow`.** Between runs, the local harness
explicitly advances Anvil time to the next one-hour window and mines a block.
These two advances are recorded as local time travel. There is no live time-warp,
cap reconfiguration or allowlist/key reset. A live runner must wait for an actual
fresh window and preserve this accounting invariant.

## Fresh Verification

| Command | Actual result |
|---|---|
| `pnpm demo:rehearse` | PASS: three runs, 70 local receipts, 15 signed bundles |
| `node scripts/sandbox.mjs` | PASS: legacy five incidents, 31 local receipts |
| `pnpm build` | PASS: all workspace packages and dashboard |
| `pnpm test` | PASS: 178 Node + 117 package TypeScript; zero failures/skips |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` in contracts | PASS: 142 Solidity; six explicit offline native-fork skips; scoped gas checks pass |
| `pnpm lint` | PASS: first-party JS syntax and five TypeScript projects |
| `pnpm check:addresses` | PASS |
| `pnpm check:parity` | PASS: 12 input + 14 verdict vectors; selected 45 TS + 23 Solidity cases |
| `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/verimesh-playwright-browsers pnpm check:dashboard` | PASS: responsive homepage/dashboard and recorded/API/mocked-RPC acceptance |

437 full-suite tests pass. The 42 new Node regressions are included, not added
again to that total. Scene receipts and fuzz iterations are not additional unit
tests or users. Browser RPC evidence remains synthetic. Operator preflights were
not rerun here; the earlier [combined workflow report](phase2-bridge-workflow.md)
contains the dated credential/permission failures and the safe operator runbook.

## Remaining Gates

The local F-22 scenes are now executable and tested, but **not the live runner**.
An explicitly authorized live wrapper still needs combined source/credential
preflight, chosen recipient/funding/gas budget, owner-reset authorization,
natural-window handling and durable public receipt/bundle capture. It must never
use the local fallback, in-memory mock identity, Anvil RPC methods or synthetic
success when live checks fail. Three actual canonical Monad runs remain required.

Complete-window chain-derived features/refetch, stateless epoch semantics,
fresh verified deployment, history safety, remote CI, hosting, external evidence,
videos/logo and submission remain separate engineering/operator gates.
The original committed-checkout audit remains in [FINAL-REPORT.md](FINAL-REPORT.md).

Later October 9 update: the [guarded live wrapper](phase2-live-wrapper.md) is now
implemented and locally tested. It supersedes the wrapper-not-built remainder
above, not the historical local measurements. Three actual Monad runs and all
other live/security/external gates remain unperformed.
