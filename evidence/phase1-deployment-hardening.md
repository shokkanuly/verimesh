# F-11 Local Deployment Hardening: PARTIAL

October 7, 2026. This tranche implements local verification and state checks
from the operator's rubric audit. **No transactions were broadcast.** No key
file, `.env`, manifest address, Git history or remote was changed.

This is historical October 7 evidence. The October 8
[bridge verification continuation](phase2-bridge-verification.md) supersedes
the three-contract-only verifier limitation below; original counts and scope
are retained here, not relabeled as current results.

## Changes

- `verify:deployment`: dirty/source drift guard; fresh compiler artifacts;
  pinned RPC snapshot; canonical successful creation receipts; exact creation
  inputs, deployer and constructor hashes; full runtime hashes; executable
  bytecode matching with artifact immutables and decoded Solidity CBOR metadata;
  live Etherscan V2 source-verification check. Arbitrary provider/compiler errors
  are not printed.
- `pnpm run doctor`: pinned identity/owner/key/epoch/linkage/policy/tier reads;
  local scorer allowlist; full trust-change history including removals/extra
  entries; configured bridge address/code/cap; clean outflow window; minimum
  0.1 testnet MON balance; pending-transfer and reorganization rejection.
- Guardian trust setters emit events; SDK ABI and two tests match them. Four
  Solidity regressions check add/remove events, owner authorization and that
  actual local deployment simulation leaves the manifest byte-for-byte unchanged.
- `Deploy.s.sol` no longer writes JSON or labels simulation as a completed
  deployment. Only a future receipt-confirmed publisher may replace the manifest.
- Rubric work order and root SECURITY.md distinguish current guarantees from
  targets. README drops an unverified CI badge, timing and single-transaction
  claims. Existing three-step local replay is not described as a new sandbox.

## Verification Run Here

| Command | Exit | Real result |
|---|---:|---|
| `pnpm build` | 0 | SDK, sentinel, CLI and dashboard build; existing >500 kB dashboard warning remains |
| `pnpm install --frozen-lockfile --ignore-scripts` with network permission | 0 | Dependencies restored from the existing lockfile; no version/lock drift |
| `pnpm test` | 0 | 45 Node regressions (34 new) and 53 TS tests: SDK 26, sentinel 14, CLI 13; zero full-suite skips |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` in `contracts` | 0 | 92 pass, 0 fail, six explicitly disabled fork tests skip; scoped local gas unchanged |
| `forge test --match-contract DeploymentSafetyTest` | 0 | Four safety tests pass, no skips; simulation manifest regression actually executes DeployScript |
| `pnpm check:addresses` | 0 | Address source guard passes; executable stale-address negative remains in full suite |
| `pnpm check:parity` | 0 | 14 deterministic public-only vectors; targeted 17 TS and 20 Solidity tests pass; three unrelated TS cases excluded only by parity selector |
| Native fork command below, `--match-contract ForkTest` | 0 | All six fork tests pass, zero skips, block 68910254 |
| Native fork command below, `--match-contract 'SharedVectorRegistryTest\|OperationGasTest' --gas-snapshot-check true` | 0 | 20 tests pass, zero skips; all five native scoped gas values unchanged |
| Actual fresh-artifact `compareRuntime` checks | 0 | All three current artifacts have valid metadata/immutable ranges and match their compiled runtime |
| `pnpm verify:deployment` | 1, expected | `Manifest lacks deployment commit provenance; historical addresses are not a verified deployment` |
| `pnpm run doctor` | 1, expected | Same explicit historical-provenance failure; no RPC/write attempted |
| `node scripts/test-secret-hygiene.mjs /private/tmp/verimesh-gitleaks-nYxGqM/gitleaks` | 0 | 11 ignored-path / 3 example-inclusion checks, positive/negative scanner tests, metadata-only output and blank example secrets |
| `git diff --check` | 0 | No whitespace errors |
| Gitleaks stdin scan of the staged diff, metadata-only template | 0 | Zero findings in this tranche's staged changes; **not** a clean-history certificate |
| `pnpm replay` after dependency restoration | 0 | Three explicitly OFFLINE signed bundles, no onchain actions |
| `pnpm verify-bundle` on throttle, delay and freeze bundles | 0 each | All five checks and overall result PASS for each bundle |

Native fork prefix (from `contracts`):

```bash
MONAD_FORK_BLOCK=68910254 MONAD_RPC_URL=https://testnet-rpc.monad.xyz \
  forge test --rpc-url https://testnet-rpc.monad.xyz --fork-block-number 68910254
```

The first direct six-test fork run omitted `MONAD_FORK_BLOCK`, so ForkTest's
internal fork used an RPC-latest block despite the CLI flag. It passed, but was
not counted as pinned evidence. Both block selectors were supplied for the
reported reruns. Fork simulations are not deployment or live verdict receipts.

An initial isolated CLI regression failed because macOS aliases `/var` and
`/private/var`: an entrypoint path comparison returned false and exited 0 without
running. Realpath-based dispatch fixes it; clean temporary-repo commands now
actually execute and reject historical provenance. Tests were not weakened.

The initial shorthand invocation invoked pnpm 12's built-in environment doctor,
not the project script; use `pnpm run doctor`. Gitleaks was not on PATH; the
existing local binary was used explicitly. A sandboxed frozen install hit DNS
restrictions, and a replay check attempted during dependency restoration could
not load `abitype`; this was an environment/install failure, not a passing replay.
The permission-granted frozen install then exited 0. Build, full tests, replay
and all three bundle checks were repeated successfully after restoration.

## Limitations and Next Work

The new checks' positive chain responses are **synthetic unit fixtures**. Actual
CLI checks fail on the current historical manifest, and no explorer/source
equivalence or healthy fresh live state is claimed. Source verification requires
a local `ETHERSCAN_API_KEY`. No private value is recorded here.

The current source verifier covers Registry/Guardian/SimpleGate. MockBridge does
not exist yet; doctor requires its configuration for full demo readiness and
does not prove its implementation. Bridge receipt/artifact checking is F-20
work. Future `demo:preflight` must run source verification and doctor together.

The proposed record manifest schema is not published over the old addresses.
Existing runtime readers still use the old shape. F-11 must finish an atomic
reader migration, receipt-confirmed/archived manifest publication, idempotent
seed and deployment workflow before claiming completion. `deploy:testnet`,
`reseed`, `keys:generate`, `sandbox` and `demo:preflight` are not available yet.

Fresh P256 PEM presence/curve/mode were checked without displaying private
material. It is not yet the environment signer. The environment's deployer
still matches the exposed wallet, the environment P256 signer still matches the
public fixture, and agent-owner credential is unset. Rotation/funding/ownership
remain operator work. No EVM wallet was generated and no P256 scalar imported.

History cleanup/publication, remote CI, external adoption/outreach, live UI/API,
WebAuthn and later phase gates are not completed by this tranche. Phase 2 is not
authorized. Gate 1 remains PARTIAL; F-12 is blocked on the real F-11 deployment.
