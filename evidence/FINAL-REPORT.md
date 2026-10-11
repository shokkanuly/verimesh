# Horkos Ship Report

Updated October 11, 2026. **LIVE engineering delivered; publication and submission
PARTIAL.** Contracts and one enforcement run are real Monad testnet evidence.
The human will deploy Vercel, provide an empty private release repository, approve
publication, record/upload videos and submit the form. Nothing has been made
public, no outreach was sent, and no submission confirmation exists.

## Live Deployment

Chain **10143**, agent **2185**, active bound P256 key epoch **1**.
Deployment source: `d2e3e4d153600e9ef7aef3fa46b449fd98ea3087`.
Canonical addresses, owners, creation/seed hashes and runtime codehashes:
[manifest](../deployments/monad-testnet.json).
[Public deployment proof](live/deployment.json).

| Contract | Real explorer link |
|---|---|
| VerdictRegistry | [0x664b308a4f263DB551A7398A78a3dC383916867c](https://testnet.monadscan.com/address/0x664b308a4f263DB551A7398A78a3dC383916867c) |
| TripwireGuardianV2 | [0x499d40fE88d6f0906bF258a1907B915e49941321](https://testnet.monadscan.com/address/0x499d40fE88d6f0906bF258a1907B915e49941321) |
| SimpleGate | [0xFd1b15Dd59B1714F6873951924a7DA010F15494e](https://testnet.monadscan.com/address/0xFd1b15Dd59B1714F6873951924a7DA010F15494e) |
| MockBridge | [0x1C7810075519005F5204Dc5Fea49bB9ce94D093e](https://testnet.monadscan.com/address/0x1C7810075519005F5204Dc5Fea49bB9ce94D093e) |

Sourcify verified **4/4** contracts without an API key:
[source-verification.json](live/source-verification.json). Verified-source links
are recorded there. `pnpm verify:deployment` independently rechecks actual
creation calldata, constructors and complete runtime against a fresh build.
Its optional Monadscan source sub-check reports "not-verified" without an API
key; that does not replace or contradict the separate Sourcify proof.

Fresh release snapshots do not contain the old deployment Git object. The
[source-tree proof](../deployments/source-tree.json) pins the protected source
file hash to that deployment. Only the two human-approved unused upstream test
directories and the isolated DeploymentSafety test fixture are excluded;
runtime, scripts, dependencies and build configuration remain exact.

## Real Enforcement

[One complete run](live/replay.json): five accepted signed verdicts, three applied
actions, **20 scene receipts: 14 success + 6 expected revert**, plus bridge funding.
Benign and near-miss release; throttle enforces a cumulative cap; delay/freeze
reject releases; owner reset permits release. Tamper, duplicate and consumed-action
reuse reject. The run used Monad's native P256 precompile, not a local fallback.

| Scene | Real receipt |
|---|---|
| First accepted verdict | [930107da...](https://testnet.monadscan.com/tx/0x930107da363ab95a0410301a765afb1e08b5c864b2ca26f489c5c29dc71cce49) |
| Freeze action | [399115d7...](https://testnet.monadscan.com/tx/0x399115d72c573d4b77428b7064f8305420409f27c200f1ed7b90ab3e51d07710) |
| Tampered submission | [f5cb7fc5...](https://testnet.monadscan.com/tx/0xf5cb7fc5ca0192467e1c504a8bb74c4cb01ddd4279f10477b0b71e7b83ee0cb7) |
| Duplicate submission | [d98e6f3c...](https://testnet.monadscan.com/tx/0xd98e6f3c14fd54b5cca748ad84ae0f21f1177da601e0df291a6ae8f10e7a5717) |
| Authorized owner reset | [5bd895d4...](https://testnet.monadscan.com/tx/0x5bd895d4339a8aec593c85d031d0acccf80b6978fb8f8a5953c20c647d2f0428) |
| Release after reset | [4c7393e4...](https://testnet.monadscan.com/tx/0x4c7393e442dec845d96abbdcebddca3879bddc0423e8bbc9f6a75366737c28ad) |

Conservative total deployer spending: **1.938387320000021 MON**, including the
human's owner funding and fee, below the authorized **2.5 MON**. Full submitted
gas limits were charged in the run. A second full run will not fit the remaining
budget and was not performed. No further broadcast is required for recording.

Guardian now reports NORMAL after reset. Historical verdicts are expired,
not fresh permissions. Read-only demo preflight conservatively refuses leftover
outflow accounting until the natural one-hour window expires; no safety check
was relaxed to manufacture readiness.

## Verification

Executable source tested at `352ead6421d54e37baa9860b73b13a1c62911493`.
The following counts are actual runs, not user/adopter estimates or summed subsets.

| Check | Actual result |
|---|---|
| Frozen install, build, lint, canonical address check | Exit 0 |
| Node tests | **270 pass, 0 fail** |
| Package tests | **121 pass, 0 fail**: SDK 60, sentinel 45, CLI 13, testing 3 |
| Offline Solidity and unchanged scoped gas baselines | **146 pass, 0 fail, 6 intentional fork skips** |
| Separate native Monad fork | **6 pass, 0 fail, 0 skip**, run in P0; not repeated after documentation/fixture cleanup |
| Shared normalized-input/verdict parity | Exit 0; 46 selected TS + 23 Solidity tests are subsets, not additional totals |
| Isolated clean checkout | Exit 0; [all 20 steps](ship/P5-clean-checkout.json), no ignored credentials copied |
| Five replay bundles / CLI | Exit 0; independently recomputed model/input/score/digest/signature |
| Standard browser acceptance | Exit 0; desktop/mobile, recorded/API states and explicitly mocked RPC cases |
| Actual RPC browser acceptance | Exit 0; [5 verdicts, 3 actions](live/dashboard-check.json), exact links, PASS then feature MISMATCH, no overflow/errors |
| Read-only API | Ten bundles, zero rejected; uploads 405, unlisted origins 403 |
| Vercel adapter locally | [Eight actual checks](ship/P4-vercel-local.json), raw/preparsed JSON, tamper, 64 KiB bound; not a hosted deployment |
| Clean tracked tree scan | Exit 0, **0 findings**, pinned Gitleaks 8.30.1; [metadata proof](ship/P5-scan.json) |
| Supplied remote all-branch history scan | Exit 1, **3 key-fixture findings**; not waived |
| Remote CI / hosted HTTPS / form submission | Not run or confirmed |

The checkout report gives exact local timing; cached dependencies and Anvil are
not a universal installation-time promise. The Three.js chunk warning is
non-fatal (528.29 kB raw, 133.11 kB gzip); no performance guarantee is claimed.

## Product And Release

Home uses original Horkos artwork, logo colors, responsive typography and a moving
Three.js scene inspired by the supplied reference. The operational dashboard
keeps compact LIVE/RECORDED views. RPC logs are fetched in <= 100-block batches
including original demo blocks, correlated by verdict ID and checked against
canonical block state. RPC failures never become recorded-row success.

`pnpm demo` starts keys-free, read-only product services on free loopback ports.
[Vercel configuration](../vercel.json) and [hosting handoff](../docs/09-hosting.md)
are prepared; the human chose to deploy. No account deployment or public URL exists.
The PNG [logo](../brand/horkos-icon-1024.png) is **1024 x 1024 / 26,462 bytes**.

GitHub metadata confirms [the supplied repository](https://github.com/shokkanuly/verimesh)
is private with push access. Its existing history scan covers three old key
fixtures; pushing another root commit there cannot remove those findings.
An empty private repository URL was requested. Original local/remote history
was not rewritten, force-pushed or made public. Only a separately scanned fresh
snapshot is eligible for release, and public visibility still requires "publish".
No remote CI result, collaborator access or green badge is invented.

Earlier failed attempts were retained as facts: RPC publication initially hit
Monad's 100-block limit, fixed without another deployment; clean checkout's
canonical-manifest test was legitimately stale, isolated with human approval
and every assertion retained; upstream fixtures were pruned with approval while
runtime/project tests stayed intact. The Vercel parsed-body adapter initially
failed locally and was corrected before its passing report.

## Criteria To Artifacts

This maps the operator's supplied criteria, not a verified official scoring rubric.

| Criterion | Artifact |
|---|---|
| Implementation correctness | `pnpm test` |
| Monad execution | [Deployment/source proof](live/deployment.json) |
| Enforced decisions | [Actual replay](live/replay.json) |
| Transparency | [Exact LIVE freeze bundle](live/bundle-freeze.json) |
| UX | [Unmocked RPC browser proof](live/dashboard-check.json) |
| Developer experience | [Clean checkout](ship/P5-clean-checkout.json) |
| Integration | [First-party guide](../integrations/GUIDE.md) |
| Adoption | [Empty adopter table](../docs/07-adopters.md): **0 external adopters / 0 commitments documented** |
| Security assumptions | [SECURITY.md](../SECURITY.md) |
| Delivery | [Submission checklist/recording outline](../SUBMISSION.md) |

## Limits And Outstanding Human Work

Input events/features are **SYNTHETIC** even when accepted/enforced **LIVE**.
RECORDED bundles and mocked unit RPC are fixtures; Anvil identity and local P256
fallback are not native proof. MockBridge and examples are first-party reference
integrations, not external adoption. Signature attribution does not prove input
truth or correct inference. v1 trusts one signer; no cryptographic audit is claimed.

Still required: clean private remote and green CI, judge access/publication approval,
actual protected Vercel deploy and HTTPS QA, human outreach to real teams,
demo/pitch recording and uploads, form review/submission and confirmation.
Internal submission target: **October 13, 2026, 20:00 GMT+5**.

Parked: stateless `verifyVerdict` / `_consumeSigned`, chain-derived feature refetch,
WebAuthn, k-of-n quorum, extra live-wrapper regressions, extra explorers and load
tests. None were added to inflate the shipping scope.
