# Guarded Monad Demo Wrapper

October 9, 2026. **Implemented and tested locally. F-22 live acceptance remains
PARTIAL. No Monad transaction or actual live demo run was performed.**

## Scope and Provenance

Working tree based on `0096ea8e29c1087ed9247db1785c4cb58f87389b`, branch `fix/ship`,
including prior uncommitted frontend, parity, bridge and rehearsal changes.
These are working-tree results, not isolated committed-checkout or remote-CI
certification. No credential file, canonical deployment manifest, lockfile,
Git history or remote configuration was modified. Operator preflights and
credentials were not revalidated in this tranche. No hosting, outreach,
submission or repository publication occurred.

The new [CLI](../scripts/demo-live.mjs), [write guard](../scripts/demo-live-checks.mjs)
and [regressions](../scripts/demo-live.test.mjs) reuse the tested
[scene engine](../scripts/demo-scenes.mjs). The separate local rehearsal still
defaults to chain 31337. Monad scenes require an explicit guarded writer and
chain 10143; there is no local-fallback branch in the live CLI.

## Authorization and Readiness

`pnpm demo:live --help` reads no operator configuration and makes no RPC calls.
Unknown/duplicate flags, missing limits and unsupported run counts fail before
configuration or RPC access. Normal execution defaults to a read-only plan:
no wallet/executor creation, signing, evidence-directory creation or writes.
Both `--broadcast` and `--allow-owner-reset` are mandatory to enter write mode.
Three runs additionally require `--runs 3 --wait-windows`.

Before a plan is ready, the combined demo preflight must verify safe credentials
and file permissions, clean committed source, creation receipts/runtime/source
and explorer provenance, exact published seed history, identity/key/epoch,
owners/pending owners, policy/allowlists and bridge links/state. The wrapper
also checks the owned recipient, pre-funded bridge, gas reserve, current price,
canonical snapshot, chain and absence of fallback code at the P256 address.
Sender and recipient must be distinct undelegated external accounts; the
recipient is the credential-owned agent-owner wallet. The wrapper never funds,
deploys, reseeds, reconfigures caps/trust, rotates keys or substitutes mock identity.

Before every write it repeats source/configuration guards, chain, links, policy,
owners, key/epoch, trust, canonical snapshot, pending/sequential nonce, code and
remaining gas checks. Another source check runs after those RPC reads. Only
the exact twenty-call scene order and four operations are permitted: registry
submit, guardian apply/reset and bridge release. Recipient and each release
amount are fixed by the approved plan; calldata comes from fresh artifact ABIs.

## Explicit Budgets

All limits are positive uint256 decimal strings in smallest native units. For
cap `C >= 4`, define `U = floor(C / 4)` and runs `N` as 1 or 3:

- Expected successful transfers: `N * (C + U)`; the bridge needs at least this
  amount before execution. Funding remains a separate authorized operator action.
- Maximum attempted releases: `N * (C + U + 3)`. The three expected blocked
  one-unit releases count toward transfer authorization even though they should
  revert. Overflow and a smaller approved limit are rejected.
- Calls: exactly `20 * N`, including six expected reverts per run.
- Gas limit: explicitly fixed at `2,000,000` for every call, including reverts.
- Gas-price ceiling: `floor(approvedGasWei / (20 * N * 2,000,000))`; it must be
  positive and at least the RPC's current price. No automatic ceiling increase.
- The sender must reserve the remaining maximum gas cost, in addition to
  satisfying the existing combined preflight's operator-wallet requirements.

Monad charges the **full gas limit**, not just gas used. Receipt accounting
therefore uses `transaction.gas * receipt.effectiveGasPrice`; the fixed legacy
gas price must match its saved intent. This is testnet budget accounting, not
a proposed funding amount or fiat-cost estimate.
[Official Monad gas-pricing rules](https://docs.monad.xyz/developer-essentials/gas-pricing).

## Natural Windows and Evidence

Owner reset does not erase cumulative outflow. Between runs the wrapper polls
read-only, pinned canonical chain state until the actual one-hour window is
fresh. It never calls Anvil time-warp methods. Each wait is wall-clock bounded
and abortable; an active restriction or changed window is a failure, not an
automatic reset. Combined preflight and remaining bridge funding checks repeat
after each wait. Allow roughly two real window waits plus execution for three
runs; this timing has not been measured on Monad.

Broadcast mode takes an exclusive ignored `deployments/.pending/demo-live.lock`
and creates a new UUID directory under ignored `evidence/replay/live/`. Reports
are atomically replaced and fsynced, including directory entries; new files use
mode 600 and new directories mode 700. Competing locks, pre-existing UUID
directories and initially symlinked parent directories are refused.
Before dispatch, an intent records chain, sender, nonce, target, zero value,
exact calldata, gas limit/price and canonical preparation block. Acknowledged
hashes are saved before confirmation. Receipt checks require the intended call,
status, canonical block and two confirmations. Expected events, accounting,
key stability and negative-error proofs come from the shared engine.

Verified public signed bundles and projected scene progress are retained.
Diagnostics and operator private values are not copied into reports. Inputs
are explicitly **synthetic**, even when the execution chain would be Monad;
this does not implement chain-derived feature collection/refetch.
Final acceptance requires twenty confirmed intents/receipts per run, exact
receipt-to-intent correspondence, five distinct verdict digests per run, exact
transfers/fees and canonical receipt blocks. No missing or fabricated scene can
be counted as complete.

Cancellation stops further writes but cannot undo dispatched transactions.
Prepared, pending or broadcast-unknown intents retain the lock. There is no
automatic retry, nonce replacement, resume or cleanup of an unresolved run.
Use the [operator reconciliation procedure](../docs/08-deployment-workflow.md).

## Actual Local Verification

| Command | Actual result |
|---|---|
| `pnpm demo:live --help` | PASS: public usage only, no configuration/RPC |
| `node --test scripts/demo-live.test.mjs` | PASS: 85 synthetic/local safety regressions |
| `pnpm build` | PASS: workspace and dashboard |
| `pnpm test` | PASS: 263 Node + 117 TypeScript; no failures/skips |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` in contracts | PASS: 142 Solidity, six explicit offline native-fork skips |
| `pnpm demo:rehearse` | PASS: three local runs, 70 receipts, exact transfers and reset/rejection checks |
| `pnpm lint`, `pnpm check:addresses`, `pnpm check:parity` | PASS; parity covers 12 input + 14 verdict vectors |
| `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/verimesh-playwright-browsers pnpm check:dashboard` | PASS: responsive routes, recorded/API/mocked-RPC acceptance |

522 full-suite tests pass; the 85 new tests are included, not added twice.
Mocked one/three-run orchestration tests exercise the write guard and real local
journal, not a native precompile or real Monad receipts. The fresh local
rehearsal is retained at `evidence/replay/rehearsal/e3ee130c-40f4-4519-9118-681a95d85d2a/run.json`.
Earlier [saved local evidence](phase2-demo-rehearsal.json) remains unchanged.
No actual funded live plan or broadcast was attempted here; `--help` and tests
must not be described as operator readiness.

## Remaining Gates

The live wrapper is now local engineering completed, but needs actual safe
operator readiness, a fresh verified four-contract deployment, independently
approved funding/gas/reset limits and three canonical Monad runs. No live
receipt certificate exists. Complete-window chain-derived evidence/refetch,
stateless epoch design, history safety, remote CI, hosted acceptance, external
evidence, videos/logo and submission remain separate open gates.
