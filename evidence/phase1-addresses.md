# F-10 Address Configuration

Verified October 7, 2026, before the F-10 commit.

`deployments/monad-testnet.json` is the source for runtime contract addresses.
Dashboard configuration imports it, Node scripts and package tests read it, and
Foundry deployment/seed/fork scripts parse it. Obsolete environment address
overrides cannot redirect the replay: mismatches fail before signing/submission.
README and planning docs link to the manifest instead of copying addresses.
The old dashboard/README SimpleGate mismatch has been removed.

The checker covers application/package/script/contract sources, docs, README and
`.env.example`. It rejects deployment address literals, including unknown/stale
ones. Immutable evidence JSON is deliberately not rewritten: its registry domain
is part of the signed historical record. Tiny protocol/mock addresses, explicit
test recipients, and the historical dashboard owner metadata are not deployment
configuration. Verdict vector domains are deliberate fixtures, not live addresses.

## Commands

| Command | Actual result |
|---|---|
| `pnpm check:addresses` | Exit 0; no duplicated live address configuration |
| `node --test scripts/check-addresses.test.mjs` (via `pnpm test`) | 9 passed; covers docs, env example, dashboard, SDK test and Solidity script drift |
| Deliberate stale address in temporary README, invoking the checker executable | Exit 1; regression asserts `README.md:1: address literal`; temporary copy removed |
| `pnpm build` | Exit 0; all four packages/apps build; existing Vite >500 kB warning remains |
| `pnpm test` | Exit 0; 9 address regressions and 42 TypeScript tests pass |
| `cd contracts && forge test` | Exit 0; 68 pass, 6 fork tests skip (F-13 not fixed yet) |
| `git diff --check` | Exit 0 |

No deployment manifest address or signed historical evidence was changed.
No transaction was broadcast. Fresh deployment is a separate, blocked F-11 task.
