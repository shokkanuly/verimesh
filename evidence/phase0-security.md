# F-01 Secret Audit and Rotation Requirements

Date: October 7, 2026. Status: PARTIAL: audit and ignore checks complete;
operator rotation and public-history cleanup remain pending. No credential
values are included. The human authorized resuming Phase 0 after the initial
safety stop. No keys were used for transactions or uploaded.

## Resumed Audit Results

The later [post-backup scan snapshot](phase0-scan.json), pinned to revision
`3e58ae8` and 32 local commits across all refs, reports 27 working-tree and 20
history candidates, all classified. The extra historical match is a deliberate
offline fixture. The pre-backup table below is preserved as its own snapshot;
neither scan is clean. See [Gate 0](phase0-gate.md) for local backup completion.

The scanner rule now handles multiline assignments. Before local backup commits,
the working-tree rescan returned 27 candidates and the full-history rescan returned
19 candidates (both scanner exits 1, not clean). This supersedes the narrower
25/15 counts below. All 46 candidates were classified without printing values:

| Classification | Working tree | History |
|---|---:|---:|
| Exposed operator-wallet credential | 2 | 2 |
| Public fixture used as local operator signer | 2 | 0 |
| Public fixture in old demo scripts | 0 | 2 |
| Insecure historical environment examples | 0 | 2 |
| Deliberate public test/offline fixtures | 7 | 5 |
| Public vendor test fixtures | 2 | 2 |
| Public signature coordinates or hash data | 14 | 6 |

Commands: `node /private/tmp/verimesh-classify-findings.mjs` (exit 0) and
`node /private/tmp/verimesh-phase0-triage.mjs` (exit 0). The supplementary
in-memory copy audit examined 24 commits and 740 unique blobs, finding the
operator-wallet literal in both historical demo scripts. Numerical constants
equal to an insecure example scalar are not classified as real wallet exposure.

Additional historical findings missed by the first single-line scanner:

| File | Commit | Type |
|---|---|---|
| `scripts/demo-tripwire.ts` | `feac3c46041779e0011e8c09ee393aa713320927` | Operator-wallet credential; public fixture signer |
| `scripts/integrator-demo.ts` | `3c96496f7020b81cbed7ee5d9ccfe67a750c1f45` | Operator-wallet credential; public fixture signer |

The current tracked/untracked, non-ignored tree was checked in memory against
the known exposed operator-wallet literal: 716 files checked, zero matches.
This is a targeted check, NOT a claim that the full history or local environment
is clean. Actual ignored `.env` files still hold credentials, and public test
fixtures deliberately remain. No operator environment file was modified.

## Verified Roles and Required Rotation

Public-identity derivation and read-only RPC results are saved in
[phase0-ownership.json](phase0-ownership.json). Latest-state reads were not block
pinned; recorded block numbers are observations, not archival proofs.

| Identity | Verified use | Required action |
|---|---|---|
| `0xA6701287AEE3d8cC95eb9bFA4B8708a1A44Cf5f4` | Configured deployer/relayer wallet; ERC-8004 agent 2009 owner returned by RPC; credential present in historical demo scripts | Replace the wallet credential, move any testnet funds safely, and move agent ownership to a fresh wallet before rebinding; provide new addresses only |
| P256 public point in `phase0-ownership.json` | Current signer in both local environments equals a committed public test fixture; registry reports epoch 1, active | Generate a fresh P256 signer locally and revoke/rebind after owner rotation; provide public x/y only, never the private scalar |
| `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf` | Historical insecure example/default wallet | Never fund or use as a secure operator identity |
| Historical guardian owner | `owner()` read failed/unavailable | No owner inferred; deploy the hardened guardian under a fresh owner in Phase 1 |

The first agent-owner read used an incorrect manifest property and failed. A
retry using `contracts.ERC8004Identity` succeeded. No test or contract behavior
was changed to obtain that result. Existing guardian ownership was not verified.

## Ignore Fix and Regression Checks

`.gitignore` now covers `.env.*`, nested environment files, keystore/keystores
directories, `*.key`, and the existing broadcast rule. `.env.example` remains
explicitly includable. Run:

```text
node scripts/test-secret-hygiene.mjs /private/tmp/verimesh-gitleaks-nYxGqM/gitleaks
PASS: 11 sensitive-path checks; 3 example-inclusion checks; env/multiline detection; metadata-only reports; empty placeholders; blank .env.example credentials
```

A regression check initially failed because Gitleaks's generic API rule treated
the adjacent variable name `SENTINEL_P256_PRIVATE_KEY=` as a credential. The
config now excludes only that exact extracted identifier (optional trailing `=`),
not paths, commits, public-key values or actual credentials. The unchanged
positive and negative checks pass. No broad finding baseline was installed.

After F-01 changes, `pnpm build` exited 0, `pnpm test` exited 0 (15 SDK + 14
sentinel + 13 CLI = 42 passing), and `forge test --summary` exited 0 (68 passing,
0 failing, six fork tests skipped). The dashboard chunk warning and sandbox
Foundry signature-cache warning remain. The TS run used local-port permission.

## Backup and Cleanup Decision

The human will create a private GitHub repository later. Local `fix/ship` branch
creation succeeded after permission to update `.git`; no remote URL is available.
Local commits were completed, but no push/remote CI is claimed. The user has not
chosen A or B and has not authorized any history rewrite or public publication.
Changing this existing history's visibility to public remains unsafe until a
clean-history decision and rescan, even if credentials have been rotated.

The sections below preserve the initial stop and first scan as historical evidence.

## Scanner Evidence

Installed Gitleaks 8.30.1 from the [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
into `/private/tmp/verimesh-gitleaks-nYxGqM`. The Darwin ARM64 archive checksum
was checked against the official release checksum file before extraction:
`b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5`.

Commands run by the audit wrapper:

```text
gitleaks dir . --config /private/tmp/verimesh-gitleaks-nYxGqM/audit.toml --redact=100 --no-banner --no-color --ignore-gitleaks-allow --report-format template --report-template /private/tmp/verimesh-gitleaks-nYxGqM/metadata.tmpl --report-path /private/tmp/verimesh-gitleaks-nYxGqM/working-tree.metadata.json --log-level error --timeout 180
gitleaks git . --config /private/tmp/verimesh-gitleaks-nYxGqM/audit.toml --redact=100 --no-banner --no-color --ignore-gitleaks-allow --report-format template --report-template /private/tmp/verimesh-gitleaks-nYxGqM/metadata.tmpl --report-path /private/tmp/verimesh-gitleaks-nYxGqM/history.metadata.json --log-level error --timeout 180 --log-opts=--all
```

Both scanner processes exited 1. The wrapper exited 0 after collecting reports;
that is NOT a clean-scan result. `git rev-list --all --count` returned 24.
The working-tree scan included ignored environment files, generated replay
bundles, the built dashboard and vendored Solidity fixtures. No vendor path
exclusions or finding baselines were added. The history scan covered local refs
with `--all`; there is no configured remote, so remote-only history was not fetched.

The custom config extends the default rules with a rule for explicitly named
private-key assignments, including low-entropy public test vectors. Reports use
a template that emits ONLY file, commit and rule type. Scanner console output
was captured and withheld, not printed. No secret/match/message fields were saved.

Working tree: 25 findings. History: 15 findings. These are scanner candidates,
NOT counts of unique exposed keys. Generic rules may match public hashes and
public keys; test-vector and vendor findings require classification. No finding
has been suppressed. The scan is not clean, and triage is unfinished.

## Findings (Grouped by File, Commit and Type)

| File | Commit | Type |
|---|---|---|
| `.env` | Working tree | `verimesh-private-key-assignment` |
| `contracts/.env` | Working tree | `verimesh-private-key-assignment` |
| `apps/dashboard/src/config.ts` | Working tree | `generic-api-key` |
| `apps/dashboard/dist/assets/index-zyKbBfWe.js` | Working tree | `generic-api-key` |
| `evidence/bundle-latest.json` | Working tree | `generic-api-key` |
| `evidence/replay/bundle-throttle.json` | Working tree | `generic-api-key` |
| `evidence/replay/bundle-delay.json` | Working tree | `generic-api-key` |
| `evidence/replay/bundle-freeze.json` | Working tree | `generic-api-key` |
| `test-vectors/verdict-vectors.json` | Working tree | `verimesh-private-key-assignment` |
| `contracts/lib/forge-std/test/StdCheats.t.sol` | Working tree | `verimesh-private-key-assignment` |
| `contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdCheats.t.sol` | Working tree | `verimesh-private-key-assignment` |
| `.env.example` | `05284568ee7580337f41ff2ee90e500934d4bcd6` | `verimesh-private-key-assignment` |
| `test-vectors/verdict-vectors.json` | `8ca1e0fe4895dd7e159a5325f485b75db80f26ef` | `verimesh-private-key-assignment` |
| `apps/dashboard/src/config.ts` | `3e40e5e1ff89fb8dd581c03c34885f802f1b14da` | `generic-api-key` |
| `evidence/bundle-latest.json` | `feac3c46041779e0011e8c09ee393aa713320927` | `generic-api-key` |
| `contracts/lib/forge-std/test/StdCheats.t.sol` | `05284568ee7580337f41ff2ee90e500934d4bcd6` | `verimesh-private-key-assignment` |
| `contracts/lib/openzeppelin-contracts/lib/forge-std/test/StdCheats.t.sol` | `05284568ee7580337f41ff2ee90e500934d4bcd6` | `verimesh-private-key-assignment` |

Full metadata-only reports remain in the temporary scanner directory. Duplicate
findings at the same file/commit/type are grouped in this table.

## Ignore Coverage

Command: `git check-ignore -v --no-index .env .env.production .env.local .env.example keystores/example.json credentials.key contracts/broadcast/example/run-latest.json`.

Observed: `.env`, `.env.local` and `contracts/broadcast/...` are ignored.
`.env.example` has an explicit inclusion rule. `.env.production`, keystore paths
and `*.key` had no matching ignore rule at the first stop; see the resumed fix above.

## F-02 Private Backup

A sanitized `git remote` inventory returned `[]`: no remote is configured.
At the first stop, branch was `main`; no branch, commits, push or CI were created.
Local branch creation is recorded above. A verified-private remote URL is needed
before pushing. Remote CI has not been triggered.

## F-03 Cleanup Proposal (Not Executed)

- A (recommended): publish a clean, scanned squashed snapshot in a fresh public
  repository and retain the old history only in a private backup. Handle submodule
  access explicitly. Scan the new history before publication. This avoids rewriting
  shared history but does not replace credential rotation.
- B: use `git filter-repo` to remove exposed material, review every ref and then
  force-push. This rewrites commit IDs and disrupts other clones. It requires an
  explicit "yes" before any destructive operation and cannot invalidate leaked keys.

Neither option has been authorized or executed. No public repository was created.

## Required Human Input

Permission to resume was received. Rotation is still required for the identities
listed above. Provide new public addresses/coordinates only. Never send keys in
chat. Guardian ownership of the old deployment remains unverified.

Provide a private backup repository URL. Confirm the desired cleanup option with
an explicit "yes" before execution. Key values must never be sent in chat; new
secrets belong only in the local ignored operator environment.

Later human work remains: hosting choice/deployment, real outreach, videos,
logo, judge access, submission, the Colosseum submission and the Superteam decision.
No later phase has started. Exact session wall-clock duration was not recorded;
the Phase 0 estimate in the plan is approximately two hours.
