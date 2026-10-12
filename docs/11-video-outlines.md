# Horkos: Ready-To-Record Video Scenarios

These are recording scenarios, not uploaded videos. Use the deployed read-only
product and completed Monad receipts. Do not broadcast another run, display
wallet terminals, or show authentication codes. The human reviews the final
videos, uploads them, and submits the form.

## Technical Demo: Target 2:45, Maximum 3:00

Open the hosted home, then its `/dashboard?mode=live` page. Keep LIVE, Monad
Testnet and SYNTHETIC input provenance visible. Start after the five rows load.
The supplied product screen recording is supporting footage; its narration is
synthetic, not a team member's voice.

| Time | Screen And Action | Ready-To-Read Narration |
|---|---|---|
| 0:00-0:15 | Home: show the Horkos name, logo and moving scene; open Live on Monad. | "Horkos records signed machine decisions on Monad. This is a working testnet prototype. We use synthetic inputs and trust one signer." |
| 0:15-0:40 | LIVE timeline: show five accepted events, three applied actions and Guardian Now NORMAL. | "These five verdicts were accepted on the real Monad testnet. Three have matching guardian actions. Each row links to an actual registry receipt. The guardian is normal after the owner's reset." |
| 0:40-1:00 | Scroll through benign, near-miss, throttle, delay and freeze; point to Registry and Guardian links. | "Benign and near-miss decisions need no restriction. Throttle, delay and freeze demonstrate bounded enforcement through our first-party mock bridge. The completed run includes blocked releases and an authorized reset. This is not a production bridge integration." |
| 1:00-1:25 | Select freeze Evidence; click Verify and hold on PASS / OFFLINE. | "This is the exact accepted freeze bundle. The verifier recomputes normalized inputs, the versioned rule score, the EIP-712 digest and the P256 signature. It does not prove that supplied features are true." |
| 1:25-1:45 | Change `features.proofMismatch` from 1 to 0, keeping valid JSON; Verify; show MISMATCH. | "Changing a supplied feature breaks the signed commitments. The verifier reports the mismatch instead of silently substituting another bundle." |
| 1:45-2:00 | Restore selected bundle; Verify; hold on PASS / OFFLINE. | "Restoring the original accepted evidence passes again. This demonstrates portable signature and deterministic rule consistency, not correct AI inference." |
| 2:00-2:20 | Open Contract addresses; show the four explorer links. Open the completed scene receipts when useful. | "All four contracts are deployed and source-verified. The completed run rejected tampering and duplicate reuse, then allowed an authorized owner reset. Historical verdicts are expired; they are not fresh spending permissions." |
| 2:20-2:45 | Integration tab: show Consumer Integration and trust limits; finish on Horkos home. | "Consuming applications choose trusted agents, models, freshness and policy, and enforce reuse protection. v1 has one trusted signer, synthetic inputs and zero documented external adopters. Horkos makes authority explicit and evidence inspectable." |

Do not type the whole bundle manually. Change only the stated numeric field.
Use [the exact receipt scene links](10-demo-script.md) and keep receipt status
honest. If an explorer does not load, show the existing product link and explain
that the browser could not open it; do not invent a receipt screen.

Read-only fallback: `pnpm demo` starts the same product locally without operator
keys or transactions. Label that footage local. Offline proof:
`pnpm verify-bundle evidence/live/bundle-freeze.json`.

## Pitch: Target 1:50, Maximum 2:00

The human records the introduction using their real name and role. A camera
introduction plus actual product footage is sufficient; slides are optional.
Do not invent teammates, personal motivation, users, commitments or revenue.

| Time | Camera Or Screen | Ready-To-Read Narration |
|---|---|---|
| 0:00-0:15 | Human on camera. State your actual name, role and a real reason you chose this problem. | Introduce yourself in your own words. Keep this to two sentences. |
| 0:15-0:35 | Horkos home, then LIVE timeline. | "When a contract acts on a machine decision, a score alone is not enough. The application needs to know who signed it, which inputs and rules it committed to, and whether the decision is fresh and can be revoked." |
| 0:35-0:55 | LIVE verdict row and Contract addresses. | "Horkos connects ERC-8004 agent identity to a bound P256 key. Its Monad registry accepts signed verdicts, while consuming contracts enforce their own trusted agents, models, freshness and reuse rules." |
| 0:55-1:20 | Freeze evidence: PASS, edit, MISMATCH, Restore, PASS. | "Our testnet prototype has four source-verified contracts and five real accepted verdicts. The mock bridge demonstrates throttle, delay, freeze and an owner reset. The evidence tool shows exactly what agrees, and rejects altered features." |
| 1:20-1:40 | LIVE label and integration scope note. | "We are explicit about the limits. Inputs are synthetic, v1 trusts one signer, and the bridge is a first-party reference. We claim no external adopters, no zkML and no proof of correct AI inference." |
| 1:40-1:50 | Integration view, then home. | "Our next step is a real integration review with teams that need bounded machine-driven actions. We are asking for feedback on the consumer policy and evidence flow, not claiming production readiness." |

## Recording And Upload Checklist

1. Record at 1080p or comparable readable resolution; keep text large enough.
2. Use a normal speaking pace. Finish before the limits; do not speed up proof.
3. Review start to finish: correct LIVE mode, readable evidence, audible voice,
   no secrets or authentication prompts, and truthful prototype limits.
4. Upload each video through your chosen service and check the resulting link
   from a signed-out browser. A local file is not an uploaded video URL.
5. Put the two actual upload links in `SUBMISSION.md`; verify the official form
   requirements and submit yourself. Do not mark submission confirmed until
   the portal shows its real confirmation.

## Optional Advertisement: Maximum 0:30

0:00-0:10: Horkos name and actual LIVE product.
0:10-0:20: PASS, tamper MISMATCH and bounded mock-bridge action.
0:20-0:30: Actual accessible URL and single-signer/testnet limits.
This optional clip is lower priority than the two required videos and submission.
