# Horkos Project Status

Updated October 11, 2026. **LIVE engineering complete; release/submission partial.**
This board supersedes the dated October 9 undeployed/three-run work orders.
The current ship authorization requires one clean native run, which is complete.

| Step | Status | Evidence / remainder |
|---|---|---|
| P0 preflight | DONE | Root-local fresh roles; agent registration and explorer-key handling; deployed rerun guard |
| P1 rebrand | DONE | Horkos EIP-712 version 1, vectors/parity, original brand assets |
| P2 deployment/seed | DONE | Four Monad contracts, agent 2185 epoch 1, creation/seed/runtime proof, Sourcify 4/4 |
| P3 enforcement | DONE | Five accepted verdicts, three actions, cap/delay/freeze/reset and real negative receipts |
| P4 product/hosting | PARTIAL | LIVE reader and read-only API tested; human will deploy prepared Vercel configuration |
| P5 release/DX | PARTIAL | Zero-finding tree and passing isolated checkout; supplied private remote's old history fails; empty private repo and remote CI pending |
| P6 traction assets | DONE | Runnable first-party guide, unsent outreach drafts and empty external log |
| P7 submission assets | DONE locally | Logo 26,462 bytes, read-only launcher, commands and video outlines; human videos/form still pending |
| P8 report | DONE locally | [Final report](../evidence/FINAL-REPORT.md); no missing delivery claims hidden |

## Current Proof

- [Canonical live addresses/receipts](../deployments/monad-testnet.json),
  [Sourcify verification](../evidence/live/source-verification.json),
  [one actual LIVE run](../evidence/live/replay.json).
- Tests: 270 Node + 121 package tests; 146 offline Solidity with six intentional
  native-fork skips. Separate P0 native Monad fork: six passed, none skipped.
- [Actual RPC browser check](../evidence/live/dashboard-check.json): five verdicts,
  three actions, selected evidence verification/tamper, desktop/mobile.
- [Clean checkout](../evidence/ship/P5-clean-checkout.json) and
  [zero-finding tracked tree / failing old remote history](../evidence/ship/P5-scan.json).
- [Vercel handoff](09-hosting.md), [eight local API adapter checks](../evidence/ship/P4-vercel-local.json).
  This is not a hosted-deployment proof.

Inputs remain SYNTHETIC, MockBridge is first-party and v1 trusts one signer.
External adopters and commitments: zero documented. Current guardian NORMAL
after reset does not erase prior outflow accounting or refresh old verdict TTLs.

## Remaining Delivery

An empty private repository is needed: the supplied private repository's old
history contains three scanner findings. No history rewrite or
force-push is authorized. Human must say "publish" before public visibility,
confirm judge access, deploy Vercel, record/review/upload demo and pitch, send real
outreach and submit the checked form by October 13, 20:00 GMT+5.

No second full replay: conservative deployer spend is 1.938387320000021 MON
of the authorized 2.5 MON. Recording uses existing LIVE receipts, not new spending.
Read-only preflight may refuse a still-active prior window until natural expiry.

## Roadmap, Not Shipping Gates

Stateless consumption, chain-derived feature refetch, WebAuthn, quorum, extra
live-wrapper tests, extra explorers and load testing remain parked. Historical
phase reports under `evidence/` describe their original dates; do not interpret
their old "undeployed" status or three-run requirement as the current ship plan.
