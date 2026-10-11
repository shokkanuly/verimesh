# REBRAND REPORT - RB-1

Date: October 9, 2026. Status: **PARTIAL**.

RB-0 and RB-1 are complete with one explicitly approved baseline exception.
The application has not been renamed. RB-2 through RB-6 have not started.
This report is the approval gate: wait for the user's **go** before changing
source names, signing artifacts, moving assets or archiving deployments.

## Scope And Evidence

- Branch: `rebrand/horkos`.
- RB-0 checkpoint: `2b1c5d2355cdbd0d93942328eba65ece4b59ce63`.
- RB-0 message: `RB-0: checkpoint pre-rebrand local implementation and supplied assets`.
- That checkpoint contains the previously uncommitted implementation and supplied assets: 63 files, 4,927 insertions, 197 deletions. Those are not rebrand changes.
- RB-1 adds four files: this plan, the inventory generator, the JSON inventory and the generated file table. Existing application files edited: **0**. Files renamed: **0**.
- Name-derived values regenerated: **none**. Calculated prospective values are unsigned planning data, not replacement evidence.
- [Per-file occurrence/category/replacement table](../../evidence/rebrand/RB-1-files.md).
- [Full machine-readable inventory and public old/new hash list](../../evidence/rebrand/RB-1-inventory.json).
- [Reproducible inventory generator](../../scripts/rebrand-inventory.mjs). Run `pnpm build` first if compiled SDK/sentinel output is absent, then `node scripts/rebrand-inventory.mjs`.
- The generator freezes the inventory at the RB-0 commit, checks that its first-party files are unchanged, and excludes its own reports. It is an RB-1 snapshot tool, not the later mechanical rename script.
- Toolchain actually used: Node `v24.14.1`, pnpm `12.9.1`, Forge `1.8.4`, project Solidity `0.8.24`.

## Baseline Versus Now

All counts below come from commands run for this task, not earlier project status documents.

| Check | RB-0 | RB-1 Verification | Failure / Skip Detail |
|---|---|---|---|
| `pnpm build` | PASS | Application/build inputs unchanged | Workspace and dashboard build; 2,357 dashboard modules |
| `pnpm test`: Node scripts | 263 PASS | 263 PASS, 0 FAIL, 0 SKIP | Re-run during RB-1 |
| `pnpm test`: Vitest | 117 PASS | 117 PASS, 0 FAIL | SDK 57, sentinel 44, CLI 13, testing 3 |
| `env MONAD_RPC_URL= forge test --gas-snapshot-check true` in `contracts/` | 142 PASS, 0 FAIL, 6 SKIP | 142 PASS, 0 FAIL, 6 SKIP | Six native fork tests explicitly skip without an RPC; gas check passes |
| Explicit Monad native fork | 6 PASS, 0 FAIL, 0 SKIP | Retained RB-0 result; not re-run in RB-1 | Block `69455869`, chain `10143`; read-only fork, no broadcast |
| `pnpm replay` | Five incidents generated and verified | Retained RB-0 result; no replay rewrite in RB-1 | Scores 550, 6200, 7300, 8900, 9900 bps |
| CLI verification of all standalone evidence bundles | 71 PASS, 1 FAIL out of 72 | 71 PASS, 1 approved FAIL out of 72 | Only `evidence/bundle-latest.json`, detailed below |
| `pnpm check:addresses` | PASS | PASS | Canonical manifest consistency, not a live-source-equivalence certificate |
| `pnpm check:parity` | Not part of the recorded RB-0 command set | PASS | 14 verdict vectors, 12 normalized-input vectors; TS 45 PASS, 3 filtered SKIP; Solidity 23 PASS, 0 FAIL, 0 SKIP |
| `pnpm lint` | Not part of the recorded RB-0 command set | PASS | First-party JS syntax and all five TS project checks |

The parity command selects only the relevant SDK tests, hence three intentional
filtered skips. Those are not skips in the full 117-test Vitest run.
The separate native fork closes the six offline fork skips for the RB-0 check;
it does not establish deployer readiness, new deployed source equivalence or a
live guardian demo.

Actual summary excerpts from RB-1:

```text
pnpm test
tests 263
pass 263
fail 0
skipped 0
packages/sdk: Tests 57 passed (57)
packages/sentinel: Tests 44 passed (44)
packages/cli: Tests 13 passed (13)
packages/testing: Tests 3 passed (3)

env MONAD_RPC_URL= forge test --gas-snapshot-check true
142 tests passed, 0 failed, 6 skipped (148 total tests)

pnpm check:parity
Checked 14 deterministic public-only vectors.
Checked 12 deterministic normalized-input vectors.
Tests 17 passed | 3 skipped (20)
Tests 28 passed (28)
23 tests passed, 0 failed, 0 skipped (23 total tests)
PASS: shared normalized-input, domain, struct, digest and rejection vectors agree in TypeScript and Solidity.

pnpm lint
PASS first-party JavaScript syntax and TypeScript static checks

pnpm check:addresses
Address check passed: live configuration reads deployments/monad-testnet.json.

CLI bundle audit: 72 total, 71 PASS, 1 approved FAIL
```

The CLI audit enumerated every path in the inventory's `bundles` array, ran
`pnpm verify-bundle <path>` for each, and asserted that the only nonzero exit was
the approved legacy model-hash mismatch. The generator independently rechecks
all bundles using `verifyTripwireBundle`.

The RB-0 explicit native fork command was:

```sh
env MONAD_RPC_URL=https://testnet-rpc.monad.xyz MONAD_FORK_BLOCK=69455869 \
  forge test --rpc-url https://testnet-rpc.monad.xyz \
  --fork-block-number 69455869 --match-contract ForkTest -vv
```

Result: **6 passed, 0 failed, 0 skipped**. The historical `evidence/fork-tests.txt`
was not overwritten. A read-only RPC probe confirmed chain `10143` and block
`69455869` before that run.

## Approved Baseline Exception

The legacy `evidence/bundle-latest.json` predates this rebrand. It has a placeholder
v1 model hash, not the hash of the actual scorer source/configuration:

```text
pnpm verify-bundle evidence/bundle-latest.json
[PASS] 1. inputHash
[FAIL] 2. modelHash mismatch
[PASS] 3. score
[PASS] 4. EIP-712 digest
[PASS] 5. P256 signature
RESULT: MISMATCH
expected: 0x1bf8d32ccff2ddae41f5df0644b8c9637c0607ca5e3dc4b5eeb46e27198d620b
recorded: 0x1111111111111111111111111111111111111111111111111111111111111111
exit: 1
```

User authorization: **"yes you may"**, answering the request to record this as
an explicit baseline failure, continue the inventory and preserve the bundle
unchanged until the archive/regeneration plan is approved. This is not a waiver
of another failure, not permission to weaken verification and not permission to
start RB-2.

The bundle is byte-for-byte unchanged. SHA-256:
`0893bc46fc9868fd78d19e69fc3c7f79e152d62f2d32e4f470cdc01d6e5cfbd9`.
Do not patch its signed `model.hash` by hand. After approval, preserve the raw
failed record in a clearly deprecated historical archive and generate a valid
replacement from the actual scorer using the new domain. The final active
bundle set must have zero failures; the baseline exception cannot count as a pass.

## Inventory Result

The frozen first-party snapshot contains 224 files after the documented exclusions.
Literal search finds **358 occurrences in 99 text files**. Structured ZIP/XML
inspection finds **7 additional occurrences** in `docs/02_VeriMesh_Protocol.docx`.
Total: **365 occurrences in 100 files**. There are **6 matching filenames and
0 matching directory paths inside the repo**.

The file table lists every file, exact occurrence count, categories and intended
replacement. Counts are matches, not matching lines. `fd` is unavailable, so
filename/directory discovery used the repository file list and enumerated every
ancestor directory; the generator records the six prospective path changes.
The workspace basename outside the repo is not moved.

Actual literal-search command, with new audit files excluded to retain the RB-0 scope:

```sh
rg -i --count-matches --hidden \
  -g '!node_modules/**' -g '!**/node_modules/**' -g '!.git/**' \
  -g '!**/lib/**' -g '!**/dist/**' -g '!**/out/**' -g '!**/cache/**' \
  -g '!**/broadcast/**' -g '!deployments/.pending/**' \
  -g '!**/.env' -g '!**/*.key' \
  -g '!scripts/rebrand-inventory.mjs' -g '!evidence/rebrand/**' \
  -g '!docs/rebrand/**' 'veri[-_ ]?mesh' .
```

Exit `0`: 99 `path:count` records, totaling 358 matches. The full per-file counts
are in `RB-1-files.md`. The generator also runs structured `rg --json` against
the explicit baseline text file list and asserts every count agrees.
This is **not** a zero-leftovers claim. Application names remain unchanged.

Actual inventory output:

```text
PASS inventory: 358 text occurrences in 99 files; 7 DOCX occurrences; 6 named files; 0 named directories.
PASS dry-run: 14 vectors; 72 bundle IDs; 2 model hashes unchanged; 87 unique public name-derived hashes.
Baseline bundle verification: 71 PASS, 1 approved legacy failure. No signatures or artifacts regenerated.
Hash locations inventoried: 454, of which 57 match known name-derived values.
```

Reviewed zero-name-match files include `.env.example`, `pnpm-workspace.yaml`,
all five `tsconfig.json` files, `contracts/foundry.toml`, both CI workflows and
`SUBMISSION.md`. There is no first-party `remappings.txt`; Foundry's remappings
are configured in `foundry.toml` and contain only external dependency names.
No `VERIMESH_*` environment variable was found in the tracked snapshot. Ignored
operator credentials were not inspected and are not part of the rename input.

## Hash And Signature Impact

The JSON inventory enumerates the old and prospective new values, not just their
counts. Its vectors/bundles hold chain, verifying contract and verdict fields
constant to isolate the name change. A later fresh deployment changes the
verifying address too, so these are not final deployment-bound digests.

| Value / Artifact | Impact | Required Work After Go |
|---|---|---|
| EIP-712 `NAME_HASH` | Changes | Solidity library and generator use `Horkos`; SDK domain name becomes `Horkos` |
| Domain separators | 10 unique current contexts change | Every vector/bundle context is listed with both values |
| Verdict digests / IDs | All 14 vector digests and 72 bundle IDs change; bundles contain 62 unique IDs | Generate new vectors/bundles, signatures and dependent ledgers |
| Unique public name-derived values | 87 total: 1 name hash, 10 domains, 14 vector digests, 62 bundle IDs | Full old/new list is represented in `nameHashes`, `vectors` and `bundles` |
| Shared verdict fixture | 14 vectors | Run the existing deterministic generator; keep negative expectations and signature-tampering relationships |
| Stored bundles | 72 paths; 6 tracked, 66 ignored | Regenerate active/recorded bundles; archive historical rehearsal records or mark them STALE, never silently re-sign old receipts |
| Evidence digest references | 152 JSON references across 82 files | Every JSON pointer and replacement candidate is listed in `digestReferences`; includes ignored ledgers |
| Digest-addressed bundle store | 5 current files | New IDs require new filenames and indexes; `prospectiveStorePath` records each path |
| Hardcoded 32-byte literals | 454 locations audited; 57 match known name-derived values | Every location, classification and safe fingerprint is listed; none left unclassified |
| Hardcoded public vector signature components | 34 locations | Regenerate components in vectors, `Fork.t.sol`, `VerdictRegistry.t.sol` and the read-only proof; keys remain unchanged |
| `evidence/recorded/run.json` | Five old-domain IDs | Regenerate alongside recorded bundles |
| `evidence/phase2-demo-rehearsal.json` | Fifteen old-domain IDs plus historical local receipts | Re-run the local rehearsal or mark the old report STALE; preserve original receipt/transaction identities |
| `evidence/testnet-proof.json` | Old vector digest/signature, historical code hashes | Mark old proof STALE or regenerate a clearly scoped read-only proof; do not relabel it as fresh Horkos deployment acceptance |
| v1 scorer `modelHash` | **Unchanged** | No comment/string/import/name occurrences in either actual hash input |
| v2 scorer `modelHash` | **Unchanged** | Same conclusion, independently recomputed |
| Model allowlists and negative model fixtures | **Unchanged by the rename** | Keep the two audited model hashes and intentional negative values; seed later fresh deployments with the actual model |
| Verdict struct hashes, Verdict/domain typehashes, version hash | **Unchanged** | Version stays `1`; all eight Verdict fields/type string stay byte-identical |
| Normalized-input hashes, route and policy hashes | **Unchanged for identical inputs** | No scoring, input encoding, policy string or threshold changes |
| P256 public keys / public test signing fixtures | **Unchanged** | Do not treat test fixtures as operator keys; no private material copied into this inventory |
| Runtime bytecode/code hashes and compiler metadata | May change after source/path/domain/ABI rename | Rebuild and measure; do not overwrite old chain codehashes or claim source equivalence |
| Real transaction/block hashes and receipts | Not name-derived | Preserve raw bytes and historical provenance; never replace them with prospective hashes |

Name hash:

```text
old: 0x85f40c237bcbbd84b6d59daf5f2fa855560ffb8cf49d31c5ad09a5179bb7ef35
new: 0x962b8701c87073dd350ecd5624b29b307f28f23accbf7c8cd6a4ffa74f323f80
```

The scorer hash function normalizes CRLF/outer whitespace and hashes
`source + "\n---CONFIG---\n" + config`. It does not hash the model loader's import
path. Both before/after calculations match:

```text
v1: 0x1bf8d32ccff2ddae41f5df0644b8c9637c0607ca5e3dc4b5eeb46e27198d620b
v2: 0xbc68e549ee283f4b1f5aef1cd8f8dd8180e65d6329fd54376c177e8498ebb2e0
```

Inputs are `rules.ts` + `model.json` and `rules-v2.ts` + `model-v2.json` under
`packages/sentinel/`. All four have zero old-name matches.

The public getter rename `verimesh()` -> `horkos()` changes its selector from
`0xfe302c32` to `0x322a4d4f`. This is an intentional name-derived ABI migration,
not a scoring-rule change. Contract consumers, seed checks, scripts, SDK ABI
references and tests must move together. Old deployed consumers cannot be
pretended to have the new getter or domain.

## Existing Deployments

**Yes: a historical Monad testnet deployment manifest exists.** This is an
inventory statement, not a new verification that those addresses match today's
source. The canonical JSON currently contains:

| Contract | Historical Address | Proposed Handling |
|---|---|---|
| ERC8004Identity | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | External dependency; retain historical record, do not declare the identity registry itself deprecated |
| VerdictRegistry | `0xEa695145d4b0405E21eb35a359A1CC3E7F756266` | Archive with DEPRECATED old-domain note; fresh Horkos registry required later |
| TripwireGuardianV2 | `0xb8a1C56a117446023a45346Bc51aAA6bB46DB26E` | Archive its old linkage; fresh linked deployment required later |
| SimpleGate | `0xC520c3B91057320f599f5870E53e61c77C56d4ac` | Archive old consumer record; do not reuse as renamed-source proof |

No live MockBridge record is in this manifest. There are no deployment/seed
broadcasts in RB-0/RB-1. `deployments/monad-testnet.json` is unchanged, SHA-256:
`62b2fa40d2610cc7b0121c46bbad5d4782209b2f0026c2d7f51627adef7f8d6f`.

**Approval question:** can these project-owned old-domain records be removed
from active configuration and retained as a byte-preserved, read-only archive?
Recommended default: `git mv` the original manifest into `deployments/archive/`
with an adjacent `DEPRECATED` note, preserving all addresses and provenance.
Do not revoke keys, delete onchain records or transact against these contracts.

The prompt requires both "no deployment in this task" and "no old project
addresses in the active manifest." There are no new addresses available to fill
an active manifest. The approved transition therefore needs to leave live mode
explicitly unconfigured until a separate fresh deployment, with offline fixtures
kept distinct. This is a decision to approve before altering manifest consumers;
it is not permission to invent addresses, weaken the deployment guard or break
the address checker. Whether the external ERC-8004 dependency can be reused must
be stated separately from project-owned deprecated addresses.

## Asset Inventory And Integration Plan

The supplied source folder is `files (1)/`, not `brand/`. Seven originals are
present and unchanged; proposed relocation uses `git mv`, not asset recreation.
All dimensions below were read from PNG IHDR after checking the PNG signature.

| Supplied Asset | Bytes | Dimensions |
|---|---:|---|
| `horkos-icon-1024.png` | 26,462 | 1024 x 1024 |
| `horkos-icon.svg` | 8,434 | SVG |
| `horkos-lockup-2400.png` | 69,978 | 2400 x 604 |
| `horkos-lockup-white.svg` | 9,080 | SVG |
| `horkos-lockup.svg` | 9,080 | SVG |
| `horkos-mark.svg` | 8,364 | SVG |
| `horkos-social-1280x640.png` | 25,320 | 1280 x 640 |

**Missing:** `horkos-mark-white.svg` and `horkos-social-1280x640.svg`. Recommended
default: request the original files before RB-4, without inventing/recoloring
the missing variants. The provided submission icon is PNG and already under
3 MB, but its final `brand/` path has not been created.

After approval, RB-4 must add the usage README, themed lockups, icon-derived
favicon/Apple/PWA sizes, title/social/theme metadata and light/dark palette
variables. Preserve the separate homepage/dashboard routes and existing
workflows. Record actual WCAG contrast calculations and light/dark screenshots
in that step; no screenshot or contrast acceptance is claimed in RB-1.

RB-5 must add the supplied naming note, tagline and meaning-preserving one-liner,
update actual command/import examples, and retain existing single-signer and
verification limitations. Do not rename Tripwire, TripwireGuardianV2, StreamMesh,
HyperCompute, PactFlow, ScopeLock, VerdictRegistry, MockBridge, SimpleGate,
Verdict fields/type string, CLI subcommands or pnpm script names. The existing
CLI already supports the `verify-bundle` subcommand; only its binary/help/package
name changes, without adding new CLI behavior.

## Human-Managed External References

| Reference | Current Knowledge | Human Action |
|---|---|---|
| GitHub repository | User-confirmed `https://github.com/shokkanuly/verimesh`; local repo has no configured remote | Rename only when ready; human updates remote/redirect expectations |
| npm scope | Five workspace package names currently use `@verimesh/` | Claim/check `@horkos` and publishing access; local rename is not publication |
| Public frontend/evidence domain | No verified new Horkos domain or hosting URL | Claim/configure domain, DNS, service URLs and hosting settings |
| Social handles/cards | No verified Horkos handle ownership | Claim/check handles and update profiles |
| Hackathon project page/forms | Human-managed; not edited by this task | Update name and logo upload after the final asset path exists |
| ERC-8004 agent metadata URI | No tracked first-party `agentURI`/`tokenURI` metadata JSON or metadata updater found | Identify existing URI/ownership; update offchain name/description later without changing agent-ID handling; authorize any separate onchain update explicitly |
| Branch merge | RB-0 checkpoint exists; RB-1 report commit follows | Review RB-6 evidence before merging; agent does not merge or force-push |

Availability/ownership of domains, handles and npm scope has not been checked.
No remote was changed and nothing was pushed. Remote CI proof is unavailable
without a configured/authenticated repository workflow, so **no CI URL is
claimed**. Brand screenshots are **not yet produced**.

## Remaining Approvals And Acceptance

1. **Go for RB-2:** approve the mechanical scope and the old-deployment transition above. Until then, no source or active manifest changes.
2. **Historical evidence handling:** approve byte-preserved archive/STALE status for old raw bundles, receipts, scan reports and rebrand baseline audit records. They must not remain available as current Horkos evidence. Keep any final leftover-search exceptions explicit and path-specific; do not rewrite historic records to simulate a new run.
3. **Missing originals:** supply the two missing SVG files before RB-4, or explicitly revise the asset requirements.
4. **External metadata:** supply the public agent metadata location later; do not send operator secrets in chat.

RB-0 current-change secret checks covered 57 text files, then independently
the 57 staged text files: zero findings in each scan. They excluded six binary
PNGs and ignored credentials. This is not a clean-history certificate. The
existing historical `phase6-scan.json` records 18 findings; it was not rewritten
or reclassified as a new passing scan.

RB-1's four new text files were individually checked with `gitleaks stdin`,
using `.gitleaks.toml`, `--redact=100` and JSON reports consumed in memory. Only
file names, exit status, finding counts and rule IDs were emitted. Actual result:

```text
PASS RB-1 current additions: 4 text files scanned; 0 findings; history and ignored credentials excluded.
PASS report totals, protected-file SHA-256, hash classifications and local document links.
```

The generator was run twice without baseline changes. Generated output SHA-256
values were identical in both runs:

```text
RB-1-inventory.json: 0686c4bd89c0be30440ae8b88217ecce0c543c14046ba6b13f08c992de2d4afc
RB-1-files.md: 7f76fd44006739b35899bc24523e8230205cc1fade44b45d6a06bf0c9481df84
```

Both protected historical files also match their pre-inventory SHA-256 values.
The RB-1 commit is the commit containing this report; its resolved hash is
provided in the completion message. It is a local commit, not remote CI evidence.

RB-6 still requires the actual post-rename frozen-lockfile install, builds,
complete tests/native fork/parity, replay and all active bundle verifications,
address checks, secret scan, clean quickstart/sandbox, explicit leftover search,
asset screenshots and branch CI URL. Those gates cannot be inferred from this
inventory. A final deployment is a separate task after the reviewed rebrand.

**Stop here after the RB-1 commit. Await the user's go.**
