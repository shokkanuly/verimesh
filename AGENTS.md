# AGENTS.md

Commit this file at the repo root. Codex and Claude Code read it on every run.
It is permanent context — never re-explain any of it in a task prompt.

## What this repo is

Horkos is an on-chain registry and verifier for machine decisions on Monad.
An agent has an ERC-8004 identity, signs each decision with a P256 key, and any
contract can check `isValid(verdictId, ...)` in one call.

The repo is named `verimesh`; the product is named **Horkos**. The EIP-712
domain name is `"Horkos"` and the rebrand is complete. Do not reintroduce the
old name anywhere except `scripts/rename-check.mjs` and
`scripts/rebrand-inventory.mjs`, which reference it on purpose.

## Hard rules — breaking any of these means the work is rejected

1. Never write `TODO`, `FIXME`, `placeholder`, `stub`, or `not implemented` in
   committed code. If you cannot finish, STOP and report what blocked you.
2. Never touch a file the task did not name. If another file must change, stop
   and say which one and why.
3. Never change the `Verdict` struct, the EIP-712 type string, the domain name,
   the risk tiers, or any public ABI unless the task says to. The domain name
   feeds every verdict digest; changing it invalidates all test vectors.
4. Never add a dependency without asking.
5. Never weaken, skip, delete, or `.skip()` a test to make a build pass. Never
   disable a CI gate to make a badge green.
6. Never fabricate a transaction receipt, address, or test result. If a live
   chain was not reached, say so. This repo's existing honesty about unproven
   claims is correct — preserve it.
7. Never print, echo, or commit a private key, even a test one.

## Commands

For code discovery, prefer codebase-memory-mcp graph tools. Index only if the
project is not indexed; use shell search when graph results are insufficient.

| Purpose | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Test | `pnpm test` |
| Lint | `pnpm lint` |
| Addresses | `pnpm check:addresses` |
| TS/Solidity parity | `pnpm check:parity` (needs `forge` on PATH) |
| Secrets | `pnpm check:secrets` |
| Clean checkout | `pnpm check:checkout` |
| Deploy preflight | `pnpm deploy:preflight` |
| Verify deployment | `pnpm verify:deployment` |
| Local sandbox | `pnpm sandbox` |
| Read-only product / recording | `pnpm demo` |
| Contracts only | `cd contracts && forge test` |

A task is not done until `pnpm test` exits 0. Report the exit code. Do not
describe the output — paste it.

## Known current state (do not re-audit)

Verified October 11; current proof is in `evidence/FINAL-REPORT.md`:

- Clean committed checkout passes: 270 Node + 121 package tests; 146 offline
  Solidity pass, six explicit native-fork skips. Separate P0 native fork: six pass.
- `pnpm check:addresses` and `pnpm verify:deployment` pass. Use `pnpm run doctor`
  for the project script; active outflow windows remain a conservative state guard.
- Manifest stage is `demo`: four live Monad contracts, agent 2185 epoch 1,
  five accepted verdicts and a complete real enforcement/reset sequence.
- Sourcify verifies all four contracts. Inputs remain SYNTHETIC; one signer trusted.
- Read-only LIVE product, `pnpm demo`, Vercel config and logo are ready locally.
  Human will deploy; no hosted URL, remote-green CI, videos or form confirmation.
- Clean tracked tree scan: zero findings. Original local and supplied private
  remote histories still fail; do not push into that history or weaken the scanner.
  Only the approved fresh snapshot may be published after explicit human approval.
- Current ship plan requires one native run, not the historical three-run target.
  Conservative deployer spend 1.938387320000021 MON; no second full run fits budget.

## Layout

- `contracts/` — Foundry. `VerdictRegistry.sol`, `libs/VerdictLib.sol`,
  `libs/P256.sol`, examples, tests.
- `packages/sdk` — TypeScript client. Public API; treat as stable.
- `packages/sentinel` — observe → normalize → score → sign → submit, plus the
  evidence API.
- `packages/cli` — `verify-bundle`.
- `apps/dashboard` — Vite UI.
- `scripts/` — all the check/deploy/preflight tooling.
- `evidence/` — **do not add files here unless a task explicitly asks.**
- `docs/` — design docs. Read before changing architecture.

## Conventions

- Solidity 0.8.24, custom errors only, no `require` strings in the registry.
- Signatures are P256 (secp256r1). Monad's precompile is at `0x100`. Local EVM
  has no such precompile — tests `vm.etch` a Solidity fallback there.
- No floating point anywhere that touches a hash or a score. Integers and basis
  points only.
- `test-vectors/verdict-vectors.json` is the contract between Solidity and
  TypeScript. If the two disagree on a digest, that is a build failure.
- TypeScript strict mode. No `any`, no non-null assertions.
- One task ID per commit (`T-12: submit()`), so history reads as a build log.

## Out of scope until told otherwise

zkML, threshold signatures, multi-chain, WebAuthn, BTX encrypted mempool, live
chain watcher, any new product surface. These are roadmap slides, not code.

## Do not write evidence documents

The `evidence/` directory is already 748 KB. Writing another report does not
close a gate. If you want to record a result, put it in the task report below
and let the human decide whether it belongs in a file.

## Report format — end every task with exactly this

```
FILES CHANGED: <list, or none>
COMMAND RUN:   <command>
EXIT CODE:     <number>
OUTPUT:        <last 20 lines, verbatim>
GATE CLOSED:   <which submission gate this closed, or none>
BLOCKED ON:    <none, or the one thing>
```
