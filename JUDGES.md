# Horkos: Five-Minute Judge Guide

**Live Monad testnet prototype.** Four contracts are source-verified; five signed
verdicts and the full enforcement sequence have real receipts. Inputs are
synthetic, the bridge is a mock, and the signer is trusted. The
[public demo](https://horkos-murex.vercel.app) and clean repository are anonymously
readable; [all six CI jobs](https://github.com/shokkanuly/verimesh/actions/runs/38258872422)
pass. Video uploads and form submission remain unconfirmed.

## Inspect In Two Minutes

Start with [LIVE on Monad](https://horkos-murex.vercel.app/dashboard?mode=live),
without a Vercel account or wallet. For a local run, use the four commands in
[QUICKSTART.md](QUICKSTART.md) without a wallet or secrets.
For the product, run `pnpm demo` as described in [README.md](README.md#product).
Open `/dashboard?mode=live`: five accepted events, three guardian actions and
actual explorer links. Guardian now reads NORMAL after the owner's reset.
Select FREEZE, verify its evidence, alter a feature, and verify again.
PASS / OFFLINE means the committed rules and signature agree, not that old
evidence is fresh or supplied features are true. RECORDED is a separate fixture view.

## Live Contracts

Canonical configuration: [manifest](deployments/monad-testnet.json), chain 10143,
agent 2185, active key epoch 1. Do not copy addresses into application source.

| Contract | Monadscan |
|---|---|
| VerdictRegistry | [0x664b308a4f263DB551A7398A78a3dC383916867c](https://testnet.monadscan.com/address/0x664b308a4f263DB551A7398A78a3dC383916867c) |
| TripwireGuardianV2 | [0x499d40fE88d6f0906bF258a1907B915e49941321](https://testnet.monadscan.com/address/0x499d40fE88d6f0906bF258a1907B915e49941321) |
| SimpleGate | [0xFd1b15Dd59B1714F6873951924a7DA010F15494e](https://testnet.monadscan.com/address/0xFd1b15Dd59B1714F6873951924a7DA010F15494e) |
| MockBridge | [0x1C7810075519005F5204Dc5Fea49bB9ce94D093e](https://testnet.monadscan.com/address/0x1C7810075519005F5204Dc5Fea49bB9ce94D093e) |

## Evidence Map

These map the operator's supplied criteria; official form scoring was not independently checked.

| Criterion | One artifact or command |
|---|---|
| Working implementation | `pnpm test` |
| Native Monad use | [Creation/source/seed evidence](evidence/live/deployment.json) |
| Real enforcement | [20-call replay: transfers, cap, delay, freeze, reset, negatives](evidence/live/replay.json) |
| Transparent decisions | `pnpm verify-bundle evidence/live/bundle-freeze.json` |
| Product usability | [Actual RPC/browser acceptance](evidence/live/dashboard-check.json) |
| Developer experience | `pnpm check:checkout` |
| Integration | [Runnable first-party guide](integrations/GUIDE.md) |
| Adoption | [Empty external evidence table](docs/07-adopters.md): 0 documented |
| Trust boundaries | [Security assumptions](SECURITY.md) |
| Delivery | [Submission checklist](SUBMISSION.md) |

Verify runtime and creation receipts with `pnpm verify:deployment`. Sourcify
verified all four contracts: [source verification report](evidence/live/source-verification.json).
No cryptographic audit, production bridge, zkML, trustless AI or external adoption is claimed.
