# P1 Rebrand Verification

Date: October 11, 2026. Status: **P1 DONE for local rebrand verification**.
Verification commands completed at 19:26 GMT+5 (14:26 UTC), within the
90-minute time box. No protocol change was made by this task.

## Decision

The active Horkos rename, including the EIP-712 signing domain, is already
implemented on `rebrand/horkos`. The checks below passed on a snapshot of the
shared worktree at base commit `f64cbe2a924cb0966af9affe9b762081c2eca81d`.
No user-facing-only fallback is necessary. In particular, the protocol domain
has **not** been retained as VeriMesh for compatibility.

- `packages/sdk/src/domain.ts`: `getDomain()` returns name `Horkos`, version `1`.
- `contracts/src/libs/VerdictLib.sol`: `NAME_HASH = keccak256("Horkos")` and version hash `1`.
- `scripts/gen-vectors.js`: both the name hash and typed-data domain use `Horkos`.
- Root package: `horkos-monorepo`; all five workspace packages use `@horkos/*`.
- Active interfaces and consumer are `IHorkos` and `HorkosConsumer`; the protocol document is named `docs/02_Horkos_Protocol.docx`.
- Existing SDK regression rejects an archived pre-Horkos bundle even though its old P256 signature is valid: the Horkos verdict ID differs and the bundle is invalid.
- All five current recorded demo bundles pass digest, signature, input, model and score verification.

The shared vectors are **SYNTHETIC** public test fixtures. The five dashboard
demo bundles are **RECORDED** offline fixtures, using registry
`0x000000000000000000000000000000000000bEEF`. Neither is LIVE deployment
evidence. The single-signer trust assumption is unchanged.

## Isolation And Shared Worktree

Code discovery used the existing `Horkos` codebase-memory-mcp index, without
reindexing. Narrow file reads/searches were used when indexed results were
insufficient and for configuration/documents.

Checks ran in:

```text
/var/folders/c7/hdw9k4tn52z32sbg0dld44100000gn/T/horkos-p1-rebrand-ijmFfa
```

The temporary copy contains 762 allowlisted tracked/untracked source and
configuration files, plus five public recorded bundles and the one public
archived bundle required by the existing domain test. `.env*`, private key,
keystore and credential files were excluded before file reads or copying.
Installed dependencies were reused, with `@horkos/*` workspace links pointing
to the temporary copy. Build output and test artifacts were kept outside the
shared source tree. No secret files, broadcasts, publication, pushes or
deployment changes were part of this task.

All check commands used a clean environment prefix:

```sh
env -i PATH="$PATH" HOME="$HOME" MONAD_RPC_URL=
```

Successful pnpm commands additionally used
`npm_config_verify_deps_before_run=false` and
`pnpm --config.verifyDepsBeforeRun=false` to prevent pnpm 12 from installing
dependencies into the linked dependency layout. This did not disable any
test, digest comparison, signature check or gas snapshot assertion. No fresh
dependency installation or frozen-lockfile acceptance is claimed.

A final byte comparison checked **107 P1 input paths** against the snapshot,
with **0 changed paths**, exit `0`. This covered protocol/SDK source and tests,
frontend source/assets, package metadata, vectors, recorded bundles, parity
scripts and gas snapshots. Its SHA-256 over sorted `[path, file SHA-256]` pairs:

```text
50e6c693386d2685ac51a90ce6cd60541ae970751abcd572c741b78f3342cc0d
```

Concurrent P0 edits appeared after the snapshot in deployment scripts and
deployment documentation. They were preserved and are outside this P1
verification. The contract build result refers to the snapshot, not later
P0 deployment-script edits.

## Fresh Commands And Results

Commands below ran with the prefixes described above. Working directory is
the temporary workspace root unless marked `contracts/`. Test counts overlap
between parity and the full SDK run and must not be added together.

| Command | Exit | Actual result |
| --- | --- | --- |
| `pnpm --config.verifyDepsBeforeRun=false build` | 0 | SDK, sentinel, CLI, testing and dashboard built; Vite transformed 2,362 modules. |
| `pnpm --config.verifyDepsBeforeRun=false check:parity` | 0 | 14 deterministic verdict vectors and 12 normalized-input vectors match; SDK parity 18 passed / 3 filtered skips; normalization 28 passed; Solidity 23 passed / 0 failed / 0 skipped. |
| `pnpm --config.verifyDepsBeforeRun=false --filter @horkos/sdk test` | 0 | 60 passed, 0 failed, 0 skipped, across five test files; includes archived-domain rejection. |
| `node --test scripts/check-parity.test.mjs` | 0 | Six existing checks passed, including deliberate digest/input drift and missing-vector rejection. |
| `forge test --match-contract OperationGasTest --gas-snapshot-check true` in `contracts/` | 0 | Five passed, 0 failed, 0 skipped; snapshot assertion remained enabled. |
| `forge build` in `contracts/` | 0 | Solc 0.8.24 compiled 60 files successfully; existing lint warnings were emitted. |
| `node packages/cli/dist/verify-bundle.js evidence/recorded/bundle-benign.json` | 0 | All five verification steps passed. |
| `node packages/cli/dist/verify-bundle.js evidence/recorded/bundle-near-miss.json` | 0 | All five verification steps passed. |
| `node packages/cli/dist/verify-bundle.js evidence/recorded/bundle-throttle.json` | 0 | All five verification steps passed. |
| `node packages/cli/dist/verify-bundle.js evidence/recorded/bundle-delay.json` | 0 | All five verification steps passed. |
| `node packages/cli/dist/verify-bundle.js evidence/recorded/bundle-freeze.json` | 0 | All five verification steps passed. |
| `node --version` | 0 | `v24.14.1`. |
| `pnpm --version` | 0 | `12.9.1`. |
| `forge --version` | 0 | `1.8.4`, commit `50af4efe189dc64bad2b75ed6990b835de66c4ae`. |

The dashboard build emitted a non-fatal warning for the 528.29 kB
`HeroLandscape` chunk. No frontend optimization or unrelated hardening was
implemented. Foundry lint warnings were not suppressed or treated as a
security-review pass.

## Failed Attempts And Omissions

These results are retained rather than being counted as passing checks:

| Command / attempt | Exit | Explanation and resolution |
| --- | --- | --- |
| `sed -n '1,260p' AGENT_PROMPT_REBRAND.md` in the shared repo | 1 | Referenced file was absent. A filename search also found no copy; the attached ship prompt and existing rebrand records were used. |
| `env -i PATH="$PATH" HOME="$HOME" MONAD_RPC_URL= pnpm build` in the initial temporary layout | 1 | pnpm rejected symlinked dependency/task-state directories. An isolated temporary task-state directory and the explicit no-auto-install option resolved this. |
| First `pnpm --config.verifyDepsBeforeRun=false build` | 1 | The initial copy omitted the five recorded JSON files imported by the dashboard; dashboard TypeScript reported five TS2307 errors. The public fixtures were copied unchanged and the final build passed. CLI/testing were cancelled by pnpm after the dashboard failure. |
| First `pnpm --config.verifyDepsBeforeRun=false check:parity` | 1 | Archived-domain regression could not open its omitted archived public bundle: 17 passed / 1 failed / 3 filtered skips. Copying that existing fixture unchanged resolved the missing-file error; final parity passed. |

`scripts/rename-check.mjs` was inspected but not run. It is the historical
RB-2 migration tool: it asserts the frozen pre-rename baseline, preserves the
old domain for RB-3, and offers `--apply`. It is not a current acceptance
check and must not be reapplied to this already-renamed shared worktree.

Scoped old-name searches, following insufficient indexed results:

```sh
rg -n -i 'veri[-_ ]?mesh' packages apps/dashboard/src contracts/src contracts/test contracts/script scripts \
  -g '*.ts' -g '*.tsx' -g '*.sol' -g '*.js' -g '*.mjs' \
  -g '!**/node_modules/**' -g '!**/dist/**' -g '!**/lib/**' \
  -g '!rebrand-inventory.mjs' -g '!archive-rebrand.mjs'
```

Exit `0`: matches only in `scripts/rename-check.mjs`'s historical migration
mapping/protected literals. No active protocol, SDK or frontend matches.

```sh
rg -n -i 'veri[-_ ]?mesh' package.json packages/sdk/package.json \
  packages/sentinel/package.json packages/cli/package.json packages/testing/package.json \
  apps/dashboard/package.json apps/dashboard/index.html pnpm-lock.yaml
```

Exit `1` with empty output means no old-name matches in this metadata scope.
Historical archives and reports intentionally retain old names; no repository-
wide zero-leftovers claim is made.

No full monorepo test run, native RPC fork, live domain/source-equivalence
check, deployment verification, remote CI, clean-checkout acceptance or
publication was performed. P1 has no observed protocol/domain gap in the
verified scope. P0/P2 deployment work remains separately owned.

## Changed Paths

Only these shared-worktree files were edited by P1:

- `docs/rebrand/README.md`
- `evidence/ship/P1-rebrand.md`

No frontend, scripts, contracts, deployment files or parked features were
changed by P1. Existing and concurrent changes were preserved.

At the final status check (19:28 GMT+5), another worker's concurrent commit had
advanced HEAD to `ea0273a80fe0b5fedd87e81e03296bbaf52882fd`. `git status --short`
(exit `0`) showed only the modified rebrand README and untracked
`evidence/ship/`; the earlier shared changes were no longer uncommitted. P1
did not create that commit or stage other workers' files.

`git diff --check -- docs/rebrand/README.md evidence/ship/P1-rebrand.md`
returned exit `0`. The new untracked evidence file was also checked directly
for trailing whitespace and valid relative Markdown targets before handoff.

## Ship Branch Handoff

The follow-up handoff confirmed branch `codex/ship-now`, with P0 commit
`70ce949`, frontend commit `ea0273a`, and the existing P1 documentation commit
`ce7ab94`. These references were observed with `git log -4 --oneline` (exit
`0`) and `git branch --show-current` (exit `0`); P1 did not create these commits.
The earlier `rebrand/horkos` branch and snapshot references describe where
verification ran, rather than the current branch name.

P1 is complete, with no observed domain/parity blocker. No checks were rerun
because this handoff changes documentation only. The broader P0 test/fork
results reported by the human are separate from this report's measured P1
results. This handoff amendment is left uncommitted for the human to stage.
