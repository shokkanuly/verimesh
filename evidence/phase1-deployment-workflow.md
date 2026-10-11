# F-11: Safe Preflight, Repeatable Seed And Publication

October 7, 2026. Continuation after commit `ba298e8`. Local tooling only;
no transaction was broadcast and no operator secret was modified or displayed.
The historical canonical manifest is unchanged. Phase 1/Gate 1 remain PARTIAL.

## Implemented

- Shared SDK and Foundry readers accept legacy strings and receipt records.
  Dashboard, replay, integration scripts, tests and address checker use them.
- Preflight rejects the known exposed EOA, public/weak fixtures, missing keys,
  stale public configuration, unsafe permissions and conflicting dotenv files.
  Its safe path pins ownership, funding, identity code, chain and nonce reads.
- Preparation accepts exactly three ordered real CREATE hashes, verifies actual
  receipt/build/constructor/code/explorer provenance and saves an ignored public
  candidate without overwriting the canonical or an existing candidate.
- Seed checks authority/linkage/chain before transactions and skips identical
  keys and existing trust entries. Rotation and revoked-key reactivation fail.
- Publication is read-only by default. Explicit `--write` requires fresh source
  and receipt/state checks, including canonical seed receipts and exact
  sender/target/calldata/logs. It archives/deprecates the old public manifest,
  then atomically replaces it. Symlinks and concurrent changes fail closed.
- Phase 1 doctor explicitly reports non-demo-readiness; full doctor still
  requires F-20. The read-only native proof no longer saves a private provider
  URL or emits arbitrary provider exception text.

Tests use freshly generated, unfunded in-memory test secrets and synthetic RPC
responses. They are not live deployment evidence. Foundry script tests keep
ephemeral wallet secrets in memory to avoid process-global dotenv races;
compiler pin/settings are unchanged.

## Verification

| Command/check | Observed result |
|---|---|
| `pnpm build` | All workspace builds pass; existing Vite >500 kB warning remains |
| `pnpm test` | 78 Node + 56 TypeScript tests pass, no full-suite skips |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` | 101 offline Solidity pass; six explicitly disabled fork tests skip; eight fuzz tests run 1,000 cases each |
| Six direct Monad fork tests, CLI and internal fork pinned to 68910254 | Six pass, zero skips |
| Native shared parity/scoped gas at 68910254 | 20 pass, zero skips; all five operation-gas baselines unchanged |
| `pnpm check:parity` | 14 public vectors; 17 targeted TS and 20 Solidity tests pass; three unrelated TS tests excluded only by this selector |
| `pnpm check:addresses` | Pass; both manifest formats covered by regressions |
| `pnpm replay` + CLI for all three bundles | Three offline bundles, each five checks passing; no onchain submission |
| `pnpm verify:testnet` | Native SDK signature acceptance/tamper rejection at 69001583; code presence only, no source/deployment/live-action claim |
| `pnpm verify:deployment`, `pnpm run doctor --phase1` | Expected exit 1: historical manifest lacks commit/receipt provenance |
| `pnpm deploy:preflight` | Expected exit 1 before RPC: operator blockers below |
| `pnpm deploy:publish` | Expected exit 1 on the same local credential blockers; canonical manifest unchanged |
| Secret-hygiene regressions | 11 sensitive-path and three example-inclusion checks plus metadata-only scanner and empty-example regressions pass |
| Metadata-only Gitleaks scan of staged F-11 changes | Exit 0, zero findings; not a full-history clearance |
| `git diff --check` | Pass |

33 new Node workflow tests cover credential secrecy, nonce/ownership/funding,
receipt import, source/receipt failures, candidate no-overwrite, public-only
schema, default no-write, archive/atomic replacement, symlinks, concurrent edits,
explicit non-demo readiness and eight seed-receipt negative cases. Three new
SDK compatibility tests and nine additional Solidity safety tests pass.

## Actual Operator Blockers

The actual command reports only variable names and metadata, never values:

- `.env` and `contracts/.env` are still mode 644, not owner-only.
- Deployer still matches the exposed wallet.
- P256 environment signer is still the public fixture, not the fresh PEM.
- Agent-owner private-key variable is missing/malformed.
- Explicit decimal agent ID and explorer API credential are missing.

Funding and fresh NFT ownership are not claimed: local blockers stop before
those RPC checks. The existing fresh PEM remains untouched, ignored and mode 600.

Live Foundry broadcasting/source publication/seed broadcasting are not automated
by this tranche. No `deploy:testnet`, wallet generator or automatic resume command
is claimed. Real positive end-to-end publication remains untested until fresh
credentials, funding, ownership and explorer records exist. No new manifest,
archive of an actual deployment, real seed receipts or F-12 evidence was invented.
The [operator workflow](../docs/08-deployment-workflow.md) records the handoff.

Existing history exposure remains. A scanner passing on new changes is not a
clean-history/public-release claim. Repository creation remains the human's
deferred task; no push, remote CI run or history rewrite occurred.
