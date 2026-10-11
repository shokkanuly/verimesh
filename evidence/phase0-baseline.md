# F-00 Independent Baseline

Date: October 7, 2026. Branch: `main`.
Starting HEAD: `94ab28f77a91692dcae87592b8986d979e6b5c3b`.
All results below were obtained in this session. No transactions were broadcast.

## Commands and Results

| Command | Working directory | Exit | Observed result |
|---|---|---:|---|
| `pnpm build` | Repository root | 0 | All package builds complete; dashboard Vite build succeeds |
| `pnpm test` | Repository root, sandbox | 1 | SDK: 15 pass; sentinel: 13 pass, 1 fail (`listen EPERM`); CLI not reached |
| `pnpm test` | Repository root, local port permission granted | 0 | SDK: 15 pass; sentinel: 14 pass; CLI: 13 pass; total: 42 pass |
| `forge test --summary` | `contracts` | 0 | 68 pass, 0 fail, 6 skip |
| `pnpm replay` | Repository root | 0 | Three OFFLINE bundles: throttle 6500, delay 8500, freeze 9500 bps |
| `pnpm verify-bundle evidence/replay/bundle-freeze.json` | Repository root | 0 | All five verification checks PASS; RESULT: PASS |
| `pnpm verify:testnet` | Repository root, sandbox | 1 | RPC `eth_chainId` request fails with `fetch failed` |
| `pnpm verify:testnet` | Repository root, network permission granted | 0 | P256 acceptance and tamper rejection at block 68882607 |

Successful TypeScript output excerpts:

```text
packages/sdk:      Test Files 2 passed (2); Tests 15 passed (15)
packages/sentinel: Test Files 2 passed (2); Tests 14 passed (14)
packages/cli:      Test Files 1 passed (1); Tests 13 passed (13)
```

Foundry output summary:

```text
Test Suite             Passed Failed Skipped
ConsumerTest           4      0      0
ForkTest               0      0      6
RegistryInvariantTest  8      0      0
TripwireV2Test         15     0      0
VectorsTest            5      0      0
VerdictRegistryTest    36     0      0
```

Read-only testnet output:

```text
PASS: Monad P256 accepts an SDK signature and rejects tampering at block 68882607.
Recorded evidence/testnet-proof.json. No transactions were broadcast.
```

The regenerated proof is in [testnet-proof.json](testnet-proof.json). It does not
prove registry submission, guardian execution, source equivalence or fork-test
success. Offline bundles use a public test-vector key and are not live evidence.

Warnings: Vite reports a dashboard chunk larger than 500 kB (586.54 kB before gzip).
Foundry cannot flush its signature cache in the sandbox; its test process exits 0.
No tests were changed, weakened or deleted. Counts match the previous report;
the proof block is newer. Port and network restrictions required explicit retries.

## Phase 0 Resume

The original proof above is preserved in commit `08aef0d`. On the authorized
Phase 0 resume, all five commands were run again: build, TS tests, replay and
freeze-bundle verification exited 0. `forge test --summary` also exited 0 with
68 passing and six skipped. TS counts remained 15 SDK + 14 sentinel + 13 CLI.
The read-only testnet proof was refreshed after local backup:

```text
PASS: Monad P256 accepts an SDK signature and rejects tampering at block 68900704.
Recorded evidence/testnet-proof.json. No transactions were broadcast.
```

No real registry submission or guardian action is implied by either proof.

## Starting Uncommitted Changes

`git status --short` reported 27 modified tracked files and nine untracked files:

```text
 M .env.example
 M .github/workflows/ci.yml
 M .gitignore
 M README.md
 M contracts/foundry.toml
 M contracts/script/Deploy.s.sol
 M contracts/script/Seed.s.sol
 M contracts/src/examples/TripwireGuardianV2.sol
 M contracts/test/TripwireV2.t.sol
 M docs/README.md
 M package.json
 M packages/cli/package.json
 M packages/cli/src/verify-bundle.ts
 M packages/cli/test/cli.test.ts
 M packages/sdk/src/bundle.ts
 M packages/sdk/src/index.ts
 M packages/sdk/src/sign.ts
 M packages/sdk/src/submit.ts
 M packages/sentinel/package.json
 M packages/sentinel/src/executor.ts
 M packages/sentinel/src/observers/replay.ts
 M packages/sentinel/src/pipeline.ts
 M packages/sentinel/src/server.ts
 M packages/sentinel/tsconfig.json
 M pnpm-lock.yaml
 M scripts/demo-tripwire.ts
 M scripts/integrator-demo.ts
?? docs/06-project-status.md
?? evidence/testnet-proof.json
?? packages/sdk/src/guardian.ts
?? packages/sdk/test/submit.test.ts
?? packages/sentinel/src/index.ts
?? packages/sentinel/src/replay.ts
?? packages/sentinel/src/score/model.ts
?? packages/sentinel/test/replay.test.ts
?? scripts/verify-testnet.ts
```

The baseline commands subsequently refreshed ignored build/replay artifacts and
`evidence/testnet-proof.json`; this report and the status update are additional changes.
