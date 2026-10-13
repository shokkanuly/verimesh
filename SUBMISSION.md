# Horkos Submission Pack

**Engineering, LIVE run and public product ready; submission not complete.** Internal target:
October 13, 2026, 20:00 GMT+5. Supplied hard deadline: October 14, 08:59 GMT+5.
Limits below come from the operator's plan; the human must check the real form.
No form has been opened or submitted by the agent.

## Checklist

- [x] Four contracts deployed and source-verified on Monad testnet 10143.
- [x] Five real accepted verdicts and one complete enforcement/reset sequence.
- [x] LIVE dashboard, read-only verifier, quickstart and integration assets.
- [x] PNG logo: [horkos-icon-1024.png](brand/horkos-icon-1024.png), 1024 x 1024,
  **26,462 bytes**, under 3 MB. Original project artwork, not a substitute logo.
- [x] README, [judge guide](JUDGES.md), [live evidence](evidence/live/replay.json),
  [source verification](evidence/live/source-verification.json).
- [x] Initial clean one-commit snapshot pushed to the fresh repository on
  [codex/release](https://github.com/shokkanuly/verimesh/tree/codex/release),
  root commit `f5933b2abc2f61e3296d9ba5c0be3ee268cce3b9`, now the default branch.
  Approved status/documentation updates are normal child commits; no legacy
  history is imported and the initial root is unchanged. The human authorized
  publication; the clean repository is now public and anonymously readable.
  Old `main` and all previous commits remain unchanged in the private
  [legacy repository](https://github.com/shokkanuly/verimesh-legacy-private).
- [x] Remote CI green. [Actual clean-repository run](https://github.com/shokkanuly/verimesh/actions/runs/38258872422)
  completed: all six jobs pass, including the unchanged full-history secrets
  gate with zero findings. No gate was waived and no history was force-pushed.
- [x] Human-approved public release: clean code and hosted product are readable
  without sign-in. No separate private collaborator invitation is claimed.
- [x] [Public testnet demo](https://horkos-murex.vercel.app)
  deployed and actual anonymous HTTPS/API, desktop/mobile, 3D movement and LIVE
  evidence checks pass. The primary domain needs no Vercel account; previews
  and generated deployment URLs retain their existing protection.
  [Runbook](docs/09-hosting.md); no operator keys were uploaded.
- [x] [Timed demo and pitch scenarios](docs/11-video-outlines.md), with narration
  and exact screen actions. Captured supporting technical demo: 2:38, AI-narrated,
  nine actual product scenes; local media reviewed, not uploaded.
- [ ] Technical demo video <= 3 minutes; human pitch <= 2 minutes; actual upload URLs.
- [ ] Human sends outreach to 8+ actual teams and records real replies in
  [the empty log](integrations/OUTREACH.md). Zero external adopters are documented.
- [ ] Videos reviewed end-to-end on another device; no secrets in frames.
- [ ] Human checks the actual form, uploads assets/links, submits and archives
  confirmation by the internal target. Optional <= 30-second ad is not required.

## Exact Recording Commands

Run from repository root, without displaying `.env` or wallet terminals:

```bash
pnpm demo
```

This builds and starts home, LIVE reader and read-only API on printed free ports.
It sends **no transactions**. The video demonstrates a real completed Monad
run through its current RPC events and canonical receipts, not a new broadcast.
Default dashboard mode is RECORDED; use the printed `/dashboard?mode=live` URL.

In a separate terminal, the operator's read-only readiness check is:

```bash
pnpm run demo:preflight
```

It loads root-local credentials without printing them and never broadcasts.
Immediately after the completed replay it correctly refuses a leftover outflow
window. Wait for natural expiry; do not erase accounting or loosen the check.
That guard does not block viewing the existing LIVE receipts. Do not run
`demo:live` or `ship:demo --broadcast` for recording: another full run would
exceed the remaining 2.5 MON authorization budget.

Latest actual recording preflight: **PASS / exit 0 / ready true** after natural
window expiry, block 70149471, zero broadcasts.
[Public proof](evidence/ship/P7-recording-preflight.json). This readiness does
not authorize further spending or make the old signed verdicts fresh.

## Technical Demo: <= 3 Minutes

| Time | Exact scene and command | Voiceover |
|---|---|---|
| 0:00-0:20 | Open printed home, then `/dashboard?mode=live` | "Horkos records signed machine decisions. These are real Monad testnet events from a completed run, with synthetic inputs." |
| 0:20-0:45 | Select benign, open its Registry receipt; show successful release from `evidence/live/replay.json` | "Normal and near-miss decisions are accepted without a restriction action." |
| 0:45-1:15 | Open throttle, delay and freeze Guardian links; show associated release/revert receipts | "This first-party mock bridge enforces a cumulative cap, delay and freeze. It is not a production bridge integration." |
| 1:15-1:45 | Select freeze Evidence, Verify, alter `proofMismatch`, Verify, Restore, Verify | "The exact bundle passes signature and deterministic scorer checks. A changed feature fails. Supplied-feature truth is not independently proven." |
| 1:45-2:15 | Open tamper, duplicate, owner reset and release-after-reset receipts from the run file | "Onchain tampering and duplicate reuse were rejected. Only the authorized owner reset restrictions before release." |
| 2:15-2:40 | `pnpm verify-bundle evidence/live/bundle-freeze.json`; show verified contract source links | "Evidence is portable and offline-verifiable. Old expired verdicts do not become fresh authorizations." |
| 2:40-3:00 | Show integration view and return home | "v1 trusts one signer. It is not zkML or proof of correct AI inference. Applications select trusted agents, models and policy." |

Use the exact receipt labels present in the run file; all explorer URLs are real.
[Detailed scene links](docs/10-demo-script.md). No slides/code walkthrough should
replace product footage. If hosting is not yet available, label the local reader
explicitly; do not present localhost as an accessible hosted product.

## Pitch: <= 2 Minutes

0:00-0:20: Human introduces real team names, roles and personal motivation.
0:20-0:45: Contracts need attribution, freshness and revocation for offchain decisions.
0:45-1:10: Show Horkos's working identity/key binding, registry and consumer gate.
1:10-1:35: Show the LIVE dashboard and bounded mock-bridge enforcement.
1:35-1:50: State single-signer/synthetic-input limits and **zero documented external adopters**.
1:50-2:00: Human states a specific integration-review ask and realistic next steps.
[Voiceover outline](docs/11-video-outlines.md).

## Actual Link Register

| Deliverable | Verified value |
|---|---|
| Clean public repository | [verimesh](https://github.com/shokkanuly/verimesh), new repository ID 1414641348 |
| Preserved private history | [verimesh-legacy-private](https://github.com/shokkanuly/verimesh-legacy-private), original repository ID 1410630641; no commits deleted or rewritten |
| Clean release branch | [codex/release](https://github.com/shokkanuly/verimesh/tree/codex/release), default branch, initial snapshot `f5933b2`; tested public application `0270e45` |
| Remote CI / judge access | [Clean push run](https://github.com/shokkanuly/verimesh/actions/runs/38258872422): all six jobs pass; code and product publicly readable |
| Dashboard / API | [Public testnet demo](https://horkos-murex.vercel.app) / same-origin read-only `/api`; no login required |
| LIVE reader | [Five real verdicts / three actions](https://horkos-murex.vercel.app/dashboard?mode=live); synthetic inputs |
| Deployment | [Canonical addresses and hashes](deployments/monad-testnet.json) |
| One LIVE run | [replay.json](evidence/live/replay.json); 20 scene receipts + funding, six expected reverts |
| Demo / pitch / optional ad | Local supporting demo: 158.467 s / 29,770,325 bytes; human pitch and upload links pending |
| Logo | [PNG, 26,462 bytes](brand/horkos-icon-1024.png) |
| Submission confirmation | Human form submission pending |

Public code and product access are verified. The supporting demo recording is
local, not an upload URL. The human records the real introduction/pitch, reviews
and uploads both videos, then submits the form and keeps its confirmation.
