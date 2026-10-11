# 05 — Execution Plan

Today: Mon Oct 5, 2026. Track deadline: Wed Oct 14, 08:59 GMT+5. **Internal submit target: Tue Oct 13, 20:00 GMT+5.**

## 1. Schedule with gates

A gate is a pass or fail check. If a gate fails at end of day, apply the cut list (§3) the same night, not the next morning.

| Date | Focus | Gate at end of day |
|------|-------|--------------------|
| Mon Oct 5 | M0: checks V1–V6, repo skeleton, test vectors | Skeleton builds; V1 and V2 answered |
| Tue Oct 6 | M1: types, `bindKey`, `submit` | Valid and tampered signature tests pass locally |
| Wed Oct 7 | M1: `isValid`, consumer base, invariants | Test matrix (03 §4) green |
| Thu Oct 8 | M2: deploy; T-21 real-precompile proof | **A real SDK signature is accepted on Monad testnet.** If not, stop and debug before anything else |
| Fri Oct 9 | M3: scorer, pipeline, evidence API | Replay creates accepted verdicts on testnet |
| Sat Oct 10 | M4 + start M5: Tripwire V2, executor, CLI | throttle → delay → freeze visible on explorer |
| Sun Oct 11 | M5: dashboard, SimpleGate, integrator outreach follow-up | Dashboard shows full chain; one outside conversation active |
| Mon Oct 12 | M6: README, threat model, CI, 3 clean demo runs; **Colosseum submission (Oct 12)** | Quickstart works on a clean machine |
| Tue Oct 13 | M7: videos, logo, repo access, submit | Submission form complete by 20:00 |
| Wed Oct 14 | Buffer only. Deadline 08:59 | Do not plan work here |

## 2. Effort allocation versus the scoring

| Criterion (weight) | Share of remaining effort | Why |
|--------------------|---------------------------|-----|
| Technical Execution (20%) | 30% | Contracts, tests, real precompile proof |
| Design & Craft (20%) | 20% | SDK ergonomics, README, quickstart |
| Originality (15%) | 10% | Positioning and threat-model honesty |
| Founder & Market Readiness (25%) | 20% | Named adopters, comparison with rolling your own, pitch |
| Traction (20%) | 20% | Outreach every day from Oct 6, not only at the end |

## 3. Cut list (apply in this order when behind)

1. Drop the live watcher (STRETCH) and use the replay feed only.
2. Drop WebAuthn guardian passkey (STRETCH); keep the P256 sentinel key.
3. Drop BTX.
4. Drop the in-browser "re-verify" button; keep the CLI.
5. Drop `integrator-demo`; keep `SimpleGate` plus the outreach thread.
6. Never cut: registry, consumer base, Tripwire V2 path, testnet proof, tests, README quickstart, threat model, videos.

## 4. Traction plan (20% + part of 25%)

**Target adopter types** (name real teams from the hackathon channels, not categories, by Oct 8):
1. Teams building bridges, lending or DeFi guards that need a "pause on anomaly" signal.
2. Teams building AI agents that pay or trade and need an auditable decision record.
3. Teams building access control or credentials that depend on a machine-generated eligibility result.

**Outreach rhythm**
- Oct 6: write the 6-line pitch and the 10-line integration snippet (even before the code works, the interface is fixed).
- Oct 8: after the testnet proof, send the snippet with a deployed address to at least 5 teams.
- Oct 10–12: help any interested team integrate; offer to write the adapter yourself.
- Evidence to collect: message thread screenshots, a PR or commit in their repo, their contract calling `isValid`, a quote.

**Message template**

> Hi, I'm building Horkos on Monad: a registry where an AI agent signs decisions with a P256 key tied to its ERC-8004 identity, and any contract can check `isValid(verdictId, ...)`. If your app takes any action based on a machine decision (risk score, eligibility, anomaly), you can gate it in about 10 lines. Deployed on testnet at <address>. Can I help you wire it in this week?

**Post-event plan (name it in the pitch, with dates)**
- Week 1 after the event: threshold attestor design doc, open issue list.
- Week 2–3: integrate with the first external team's production path.
- Month 1: ERC-8004 reputation feedback after verified outcomes.

## 5. Why integrators would use this instead of building their own

| Rolling your own | With Horkos |
|------------------|---------------|
| Custom oracle signer and ABI per project | One verdict format and one verifier |
| Private key tied to a hot wallet | P256 key bound to an ERC-8004 identity, revocable |
| Decision logic is a black box | Evidence bundle plus a CLI to re-execute |
| No shared history | Public registry of verdicts per agent, reusable reputation |

## 6. Demo script (3 minutes, live product only)

| Time | Show | Say |
|------|------|-----|
| 0:00–0:20 | Dashboard idle, one-line problem | "Apps act on AI decisions they can't audit." |
| 0:20–0:50 | Explorer: agent registered (ERC-8004), key bound | "The sentinel is an onchain identity with a P256 key, no seed phrase on the server." |
| 0:50–1:30 | Start replay; event arrives; score 0.94; signed verdict tx accepted | "Signature verified by Monad's P256 precompile." |
| 1:30–2:10 | Tripwire applies tier; throttle then delay then freeze (explorer links) | "The guardian only trusts allowlisted agents and models, and each verdict is single-use." |
| 2:10–2:40 | Run `verify-bundle`: PASS. Edit one field: MISMATCH. Revoke key: next verdict rejected | "Anyone can re-execute the decision; compromise is containable." |
| 2:40–3:00 | Show the 10-line integration and the second team's usage | "Your contract can gate on a machine decision in ten lines." |

Prepare: pre-funded wallets, a pre-deployed fallback set of verdicts if RPC is slow, and a terminal font large enough to read in the recording.

## 7. Pitch video outline (2 minutes)

1. 0:00–0:20 Who you are (student developer and founder; mention shipped projects relevant to the judges, such as ChainStory and Tripwire if they help the story).
2. 0:20–0:50 Problem: machine decisions drive money and access, but nothing ties a decision to an accountable identity and reproducible evidence.
3. 0:50–1:20 Solution in one sentence, then the three Monad building blocks used.
4. 1:20–1:45 Who adopts it and why (the table in §5), plus the integration you actually got.
5. 1:45–2:00 Honest limits (single signer) and the post-event plan.

## 8. Submission checklist (Oct 13)

- [ ] Project logo (JPG/JPEG/PNG/WEBP, 3 MB max)
- [ ] Public GitHub repo; **access confirmed for metropolis@hackathon.monad.xyz**
- [ ] Technical demo video, 3 min max, YouTube/Loom/Vimeo, shows the live product (no slides, no code walkthrough)
- [ ] Pitch video, 2 min max, introduces team, problem, motivation
- [ ] Live product link on Monad testnet or mainnet, with access instructions and any test credentials for judges
- [ ] Optional 30 s advertisement
- [ ] README: quickstart, addresses, architecture picture, gas numbers, limits
- [ ] Both videos watched once end-to-end on a different device
- [ ] Live link opened from a clean browser profile
- [ ] No secrets visible in any video frame or repo file

## 9. Risk register

| Risk | Likelihood | Impact | Response |
|------|------------|--------|----------|
| P256 precompile integration slips | Medium | High | Time-box 1.5 days. T-21 on Oct 8 is the gate. Fallback: Solidity P256 verifier contract (costly, say so honestly) |
| ERC-8004 registry not deployed or different ABI | Medium | Medium | Check on Day 1. Fallback: minimal own identity adapter behind `IERC8004Identity`, and say so |
| No external integrator by Oct 12 | Medium | Medium | Offer to write the adapter; use ScopeLock as a clearly labeled internal second consumer |
| Demo RPC flakiness | Medium | High | Pre-deployed fallback verdicts; record a clean take early |
| Scope creep from the original Horkos doc | High | High | Re-read README decisions D1–D9 each morning |
| Colosseum and Superteam deadlines compete for time | High | Medium | Colosseum submission is Oct 12 and reuses Tripwire; skip the Superteam side track if it costs more than half a day |

## 10. Daily ritual (10 minutes)

1. Update the status board in README.
2. Check yesterday's gate. If failed, apply the cut list now.
3. Send at least one outreach message.
4. Run `forge test` and `pnpm test` before ending the day; commit with a task ID.
