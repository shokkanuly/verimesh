# Horkos Submission Pack

**Engineering and LIVE run ready; submission not complete.** Internal target:
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
- [ ] Clean release pushed to an empty private repository; remote CI green.
  Supplied repository is private but its old history still fails the secrets gate.
- [ ] Judge access confirmed for `metropolis@hackathon.monad.xyz`, or approved
  public release. Nothing may be made public before the human says "publish".
- [ ] Vercel deployment and actual HTTPS acceptance. Human will deploy using
  [the runbook](docs/09-hosting.md); no operator keys are required.
- [ ] Technical demo video <= 3 minutes; pitch <= 2 minutes; actual upload URLs.
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
| Supplied private repository | https://github.com/shokkanuly/verimesh ; old scan-failing history, not the clean release |
| Clean repository / green CI / judge access | Pending empty private repository URL and remote run |
| Dashboard / API | Human Vercel deployment pending; no URL invented |
| Deployment | [Canonical addresses and hashes](deployments/monad-testnet.json) |
| One LIVE run | [replay.json](evidence/live/replay.json); 20 scene receipts + funding, six expected reverts |
| Demo / pitch / optional ad | Human recording/upload pending |
| Logo | [PNG, 26,462 bytes](brand/horkos-icon-1024.png) |
| Submission confirmation | Human form submission pending |

Local screenshots, fixtures and drafts cannot replace missing hosted URLs,
remote CI, actual videos, judge access or submission confirmation.
