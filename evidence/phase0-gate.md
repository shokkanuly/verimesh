# Gate 0 Report

Date: October 7, 2026. Status: PARTIAL. Only Phase 0 was authorized.

## Tasks

| Task | Status | Evidence |
|---|---|---|
| F-00 | Done | [Baseline](phase0-baseline.md); all five documented commands rerun on resume; [native proof](testnet-proof.json) refreshed at block 68900704 |
| F-01 | Audit and local fixes complete; human rotation pending | [Classified findings](phase0-security.md), [scan snapshot](phase0-scan.json), [public roles](phase0-ownership.json), scanner/ignore regression checks |
| F-02 | Local commits complete; remote backup and CI deferred | `fix/ship`; six implementation groups below plus baseline/security evidence; no remote configured |
| F-03 | Proposed; not approved or executed | A/B described in security report; user will think about the decision |

## Actual Command Results

```text
pnpm build: exit 0; all package builds complete
pnpm test: exit 0; SDK 15, sentinel 14, CLI 13 (42 passing)
forge test --summary: exit 0; 68 passing, 0 failing, 6 skipped
node scripts/test-secret-hygiene.mjs /private/tmp/verimesh-gitleaks-nYxGqM/gitleaks:
  PASS: 11 sensitive-path checks; 3 example-inclusion checks;
  env/multiline detection; metadata-only reports; empty placeholders;
  blank .env.example credentials
pnpm replay: exit 0; OFFLINE throttle 6500, delay 8500, freeze 9500
pnpm verify-bundle evidence/replay/bundle-freeze.json: exit 0; RESULT: PASS
pnpm verify:testnet: exit 0; native P256 acceptance/tamper rejection at block 68900704
```

The TS run needed local-port permission. Build retains the 586.54 kB dashboard
chunk warning. Foundry retains a sandbox signature-cache write warning.
No tests were deleted or weakened. Six fork tests remain skipped, not passing.
Replay is offline. The native proof is read-only, not a registry/action receipt.
No transaction, deployment, remote push or external message occurred.

## Local Commit Evidence

| Commit | Task and group |
|---|---|
| `08aef0d` | F-00 original independent baseline |
| `d1ab258` | F-01 hygiene, classified exposure and ignore fixes |
| `4a43b30` | F-02 SDK signing, ABIs and confirmed registry submission |
| `4ba57b4` | F-02 owner-controlled guardian and tests |
| `c07fcc2` | F-02 replay, model verification, executor and evidence API |
| `9424c5c` | F-02 CLI reexecution and workspace dependency lock |
| `19d7050` | F-02 deploy/seed roles, secret-free demo defaults, CI/tooling |
| `3e58ae8` | F-02 corrected roadmap and quickstart |
| `bcf0ccd` | F-01 post-backup metadata scan |
| `191eaf1` | F-00 refreshed read-only baseline proof |

This gate report is saved in a subsequent F-02 commit. Final `git status --short`
must be checked after that commit; its actual result is reported in chat rather
than inventing a self-referencing commit hash here. Private push and remote CI
remain not done because the user will create the private repository later.

## Scanner Scope and Remaining Exposure

The saved scan snapshot is pinned to source revision `3e58ae8` (32 local commits
across all refs). Working-tree exit 1: 27 candidates; history exit 1: 20 candidates.
Classification exit 0: no unclassified candidates. These are not unique-key counts
and not a clean-scan result. Later evidence/report commits do not authorize
publication; a fresh full-history scan is still required before publication.

The targeted current-file check examined 716 tracked/untracked non-ignored files
and found no copy of the known exposed operator-wallet literal. Ignored local
environments still contain that credential and the public-fixture P256 signer.
Public test/offline fixtures and signature/hash false positives are explicitly
classified, not hidden by a broad allowlist. Historical demo scripts retain the
real wallet exposure. The only narrow scanner exception is an exact empty-entry
variable-name false positive; actual-secret regressions continue to pass.

## Needs From Human

- Rotate wallet `0xA6701287AEE3d8cC95eb9bFA4B8708a1A44Cf5f4`: configured deployer/
  relayer and verified agent 2009 owner. Safely move testnet funds and agent
  ownership to fresh operator identities. Supply addresses only.
- Generate a fresh P256 signer locally; the currently bound active signer is a
  public test fixture. Revoke/rebind after ownership rotation. Supply public x/y
  only; no private scalar in chat. Local secret files were not modified by the agent.
- Create the private GitHub repository when ready; provide its URL. No repo
  creation, push or visibility change is attempted automatically.
- Decide A (recommended fresh clean public snapshot) or B (history rewrite).
  Neither is approved. Making this existing history public before cleanup remains
  unsafe, even after rotation. Destructive operations require explicit "yes".
- Give an explicit Phase 1 "go" before work crosses Gate 0. Rotation is required
  before any live work. Later hosting, outreach, logo/videos, judge access and
  submissions remain human work; the Colosseum and Superteam decisions are pending.

## Time and Deviations

Approximately 25 minutes of resumed Phase 0 work, compared with the plan's
approximately two-hour Phase 0 estimate. Phases 1-6 (approximately 30 hours of
plan estimates) have not started. Exact original-turn elapsed time was not recorded.
Remote backup/CI are intentionally deferred at the human's request. The stronger
scanner increased findings by catching multiline defaults; counts did not shrink
by ignoring exposed files. No public-history cleanup or key rotation is claimed.
