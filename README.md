# Horkos

<img src="brand/horkos-icon-1024.png" alt="Horkos logo" width="64">

**Every machine decision. Accounted for.**

Horkos binds P256-signed verdicts to ERC-8004 agent identity on Monad, then lets
applications enforce their own trust, freshness and reuse rules.

**LIVE on Monad testnet:** four source-verified contracts, five accepted verdicts,
and one complete throttle/delay/freeze/owner-reset run. Inputs are **SYNTHETIC**;
one signer is trusted. The [public testnet demo](https://horkos-murex.vercel.app)
and [all six CI jobs](https://github.com/shokkanuly/verimesh/actions/runs/38258872422)
are verified. Video uploads and form submission remain human tasks.

[Live addresses and deployment receipts](deployments/monad-testnet.json) |
[Five-minute judge guide](JUDGES.md) | [Enforcement receipts](evidence/live/replay.json) |
[Sourcify verification](evidence/live/source-verification.json)

## Quickstart

Node 22+, pnpm 9+, Foundry 1.8.4 (`forge`, `anvil`). No wallet or secrets needed.

```bash
pnpm install --frozen-lockfile
pnpm sandbox
pnpm verify-bundle evidence/replay/sandbox/bundle-freeze.json
node examples/ts-sentinel/demo.mjs
```

This is the under-ten-minute local path, not native Monad proof. It creates a
disposable Anvil chain and in-memory keys; local P256 uses a fallback. Full
acceptance and measured timing: [QUICKSTART.md](QUICKSTART.md).

## Product

Open [Horkos](https://horkos-murex.vercel.app) or the
[LIVE reader](https://horkos-murex.vercel.app/dashboard?mode=live), without signing in.
The hosted API is same-origin and keys-free; desktop/mobile and evidence checks pass.
For local recording, run `pnpm demo` and open the printed URL, then `/dashboard?mode=live`. The launcher
chooses free loopback ports and loads no operator keys. The default `/dashboard` shows **RECORDED** fixtures.
LIVE reads actual RPC logs, including demo receipt blocks, without substituting
fixtures on failure. The keys-free API is read-only; uploads return 405.
[Local live-browser proof](evidence/live/dashboard-check.json),
[Vercel configuration](vercel.json), [hosting runbook](docs/09-hosting.md).

## Integrate And Verify

[Integration guide](integrations/GUIDE.md): short Solidity/TypeScript examples,
action-binding reference and runnable first-party fixtures. No published npm
package or external adopter is claimed.

```bash
pnpm build
pnpm test
pnpm lint
pnpm check:addresses
pnpm check:parity
pnpm check:checkout
pnpm check:dashboard
pnpm verify-bundle evidence/live/bundle-freeze.json
pnpm verify:deployment
```

Browser checks need `pnpm exec playwright install chromium`. Offline contracts:
`MONAD_RPC_URL= forge test --root contracts`. Native fork tests: `pnpm test:fork`.
[Scoped gas measurements](evidence/phase1-parity-gas.md) are not transaction fee
predictions: Monad charges the full submitted gas limit in this run.

## Honest Limits

A signature proves attribution, not supplied-feature truth or correct AI inference.
Tripwire uses deterministic integer rules and a **mock bridge**, not a production
bridge. Re-executing old evidence does not make an expired verdict fresh.
External adopters and commitments: **0 documented**. Stateless consumption,
chain-derived feature refetch, WebAuthn and quorum are parked roadmap work.

The approved clean release is public, with zero full-history scanner findings
and all six CI jobs passing. The scan-failing legacy history remains private and
separate; no history was rewritten or force-pushed. Submission is not confirmed.
[Historical project notes](docs/06-project-status.md), [final report](evidence/FINAL-REPORT.md),
[submission checklist](SUBMISSION.md), [video scenarios](docs/11-video-outlines.md),
[security assumptions](SECURITY.md).
