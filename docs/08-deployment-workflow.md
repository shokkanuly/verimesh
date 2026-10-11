# Deployment and Bridge Publication Workflow

October 11, 2026: fresh deployment, seed, source verification and one complete
LIVE run are finished. [Current manifest](../deployments/monad-testnet.json),
[receipts](../evidence/live/replay.json), [final report](../evidence/FINAL-REPORT.md).
The budgeted `ship:deploy` runner orchestrated actual writes; its deployed rerun
guard refuses another deployment. Root `.env` is authoritative; never use the
burned `contracts/.env` wallet. Recording needs no new broadcast.

The remainder is the **historical October 9 candidate/publication workflow**,
retained as reference, not current blocker/readiness instructions. Its old
three-run target is superseded by the authorized one-run ship plan. Do not use
the high-gas historical live wrapper for another run: it exceeds remaining budget.

## Operator Requirements

Keep secrets in ignored local files only, never chat, source, command-line
arguments or public artifacts. Do not fund the exposed wallet or public test
fixture. The existing `sentinel-p256.key` is the operator's fresh P256 PEM;
it is not automatically imported into `.env` and must not be overwritten.

| Root `.env` variable | Requirement |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Fresh testnet-only EVM wallet, not the exposed or fixture wallet; at least 0.1 MON as a readiness buffer, not a gas-cost guarantee |
| `AGENT_OWNER_PRIVATE_KEY` | Fresh EVM wallet that actually owns the selected ERC-8004 agent; at least 0.01 MON. It may be the same fresh EVM wallet as the deployer |
| `SENTINEL_AGENT_ID` | Leave empty before fresh registration; record the confirmed receipt ID in the manifest and root `.env` before deploying contracts |
| `SENTINEL_P256_PRIVATE_KEY` | Fresh P256 scalar in the format shown by the blank example; distinct from the EVM wallet key. Import the existing PEM locally, without printing its private material |
| `ETHERSCAN_API_KEY` | Optional local Monadscan source-verification credential; no key is needed to deploy or perform receipt/runtime checks |
| `MONAD_RPC_URL`, `CHAIN_ID` | Monad testnet RPC and chain 10143 |
| `SENTINEL_KEY_X`, `SENTINEL_KEY_Y` | Optional public coordinates; when present they must match the private P256 signer |
| `SCORER_MODEL_HASH` | Optional public hash; when present it must match the built scorer source/config, not an old placeholder |

`.env`, `contracts/.env` and the PEM must be regular, owner-only files. Root
environment values must not conflict with `contracts/.env`: Foundry can load
that second file independently. Remove stale entries or synchronize them
locally. Changing permissions does not rotate a compromised key.

```bash
chmod 600 .env contracts/.env sentinel-p256.key
pnpm build
pnpm deploy:preflight
```

The chmod command changes permissions only; run it only for files that exist.
Preflight reports all local credential/permission blockers without values.
Unsafe local configuration stops before RPC. Once local checks pass, it checks
chain, identity code, NFT ownership, balances and pending nonces at a pinned
block. It refuses dirty source. It never sends transactions or changes keys.

## Receipt Preparation

The Solidity deploy script checks chain/identity code and emits candidate
addresses only. Foundry simulation never writes the canonical manifest.
Deployment must use the committed current source and fresh operator credentials.

Actual Foundry broadcasting, explorer source publication and seed broadcasting
are **not orchestrated by these Node commands**. They remain the next live
F-11 operations once preflight passes. Use the existing deploy/seed scripts;
load secrets locally rather than passing wallet keys as command arguments, and
do not display raw diagnostic traces containing environment values. There is
no `deploy:testnet`, automatic wallet generator or automatic resume command yet.

After a real three-contract deployment and successful explorer verification:

```bash
pnpm deploy:prepare --broadcast contracts/broadcast/Deploy.s.sol/10143/run-latest.json --commit "$(git rev-parse HEAD)"
```

Use the source commit actually used for deployment, not an unrelated newer
commit. Evidence-only commits are accepted only when contract sources and
dependencies are unchanged. The command imports only the three ordered CREATE
hashes, never copies raw Foundry fields, then queries actual canonical receipts,
creation calldata, runtime code, constructor hashes and verified explorer source.
Missing hashes, simulation-only output, failed receipts or source drift fail.

Success writes an ignored, public-data-only candidate at
`deployments/.pending/candidate.json`. The canonical manifest is unchanged.
An existing candidate is never overwritten. The candidate initially expects
key epoch 1 on the fresh registry; it is **not** evidence of a completed seed.

### Full Demo Candidate

The explicit `contracts/script/DeployDemo.s.sol` creates all four fresh
contracts, including MockBridge. It is not an incremental edit of the historical
manifest and does not seed or publish. Live broadcasting and explorer source
publication still require safe credentials and separate operator approval.
After a real ordered four-contract deployment and explorer verification:

```bash
pnpm deploy:prepare --broadcast contracts/broadcast/DeployDemo.s.sol/10143/run-latest.json --commit "$(git rev-parse HEAD)" --demo --outflow-cap 10000000000000000
```

The cap above is illustrative, in smallest native units; choose the intended
positive uint256 cap for the actual demo. Use the committed source SHA actually
deployed, not an unrelated HEAD. Four creations without `--demo`, three with
it, extra calls, missing hashes, wrong order and invalid caps all fail.
An existing ignored candidate must be inspected and deliberately retained/moved
by the operator before another is prepared; it is never overwritten silently.
The candidate records `stage: "demo"` and the cap but is still unseeded evidence.

## Repeatable Seed

Run `contracts/script/Seed.s.sol` against the candidate by setting
`DEPLOYMENT_MANIFEST=../deployments/.pending/candidate.json` from `contracts/`.
The script uses public coordinates/model/owners from that candidate and the
fresh operator wallet credentials. It checks all targets before its first
transaction, including chain, identity ownership, guardian ownership, linkage,
policy, pending ownership and epoch.

An identical active key is not rebound; rerunning does not bump the epoch.
Already-trusted agent/model entries are skipped. A different key or revoked key
fails instead of silently rotating/reactivating it. If MockBridge is absent,
the script explicitly leaves F-20 pending and requires the guardian bridge to
remain unset. An EOA placeholder from the old bridge environment variable is
never configured. A recorded bridge must have code, a positive uint256 cap,
the intended guardian, the deployer as release owner and no pending ownership
transfer. Its recorded demo owner must also match. These checks happen before
binding/trust/configuration transactions, and an identical bridge seed is skipped.
[Bridge safety evidence](../evidence/phase2-bridge-verification.md).

Console output says simulation finished, not receipt-confirmed seed complete.
If a broadcast partially succeeds, inspect its real receipts and current state;
do not redeploy or rotate keys blindly. The idempotent script can complete
missing intended bindings/trust entries after those checks.

## Confirm And Publish

```bash
pnpm deploy:publish
pnpm deploy:publish --write
```

Default publication is verification-only. The candidate's explicit stage selects
three-contract Phase 1 checks or four-contract demo checks. Source/runtime,
doctor state and seed receipts share one pinned snapshot. Phase 1 requires
binding and agent/model trust receipts; demo additionally requires the exact
`BridgeConfigured` event and `configureBridge` calldata/cap from the guardian
owner, not earlier than the recorded bridge-creation block. Both paths check
canonical receipts and receipt logs; neither sends a transaction.

Only `--write` publishes. After checks pass, it archives the prior manifest with
a `DEPRECATED` notice, records verified seed receipt hashes, and atomically
replaces the canonical JSON. Closed schemas prevent carrying through secrets,
unknown Foundry fields or credential-bearing RPC URLs. Symlinks, competing
publishers and a changed canonical/candidate/source file are rejected. Verification
failure leaves the canonical manifest unchanged; chain transactions cannot be
rolled back by a publication failure. A crash may leave archive/lock files to
inspect, not an authorization to rebroadcast.
The final source/candidate guard permits only its two exact verified archive
outputs to become dirty during publication. Their contents are also rechecked;
unrelated/source changes are not ignored.

The new public manifest/archive make Git dirty. Review and commit those public
artifacts before rerunning:

```bash
pnpm verify:deployment
pnpm run doctor --phase1
```

For a published `demo` manifest, use the combined read-only gate instead:

```bash
pnpm demo:preflight
```

It requires safe credentials/permissions, matching roles, a clean committed
source, verified four-contract provenance, correct key/allowlists/bridge state,
funded operator wallets, no pending operator transactions and all four published
seed receipts. Checks use one pinned snapshot, apart from explicit pending-nonce
reads. A failed check never falls back to recorded readiness. This does not
reserve funds in MockBridge or prove the planned live release/reset scenes;
the guarded F-22 wrapper adds those checks, but three real runs remain open. The key-free local
scene rehearsal is available separately:

```bash
pnpm demo:rehearse
```

It runs three disposable Anvil sequences, never Monad, with exact funding,
release/cap/delay/freeze, reset, tamper/duplicate/consumed-action checks. Local
time advances between runs are explicitly recorded. `resetCircuit` does not
clear cumulative outflow; a live sequence must wait for a real fresh window.
No `--live` flag is accepted. [Local report and live limitations](../evidence/phase2-demo-rehearsal.md).

### Guarded Live Demo

The separate `demo:live` command is implemented and locally tested, not executed
on Monad. Build first and use `pnpm demo:live --help` for public usage. Even the
read-only plan requires the published demo manifest, safe credentials and clean
source. The current uncommitted checkout is not eligible for live execution.

Choose a public agent-owner recipient, run count and explicit budgets. Set the
three shell variables below to reviewed public values, not private keys. For
cap `C >= 4`, unit `U = floor(C/4)` and runs `N`, the bridge needs at least
`N*(C+U)`; approve at least `N*(C+U+3)` attempted transfer units. Gas reserves
cover `20*N` calls, each with a fixed 2,000,000 gas limit, including reverts.
Monad charges the full limit; the gas-price ceiling is derived from the chosen
gas budget. No automatic funding or budget increase occurs.
[Budget rules and official source](../evidence/phase2-live-wrapper.md).

Keep operator wallets dedicated and idle throughout the run. Review/commit
intended source and verified public deployment artifacts, complete the combined
preflight, and separately authorize/pre-fund the bridge before obtaining a
ready plan. Do not run deployment, reseeding, trust/cap changes or key rotation
concurrently. The recipient must be the distinct owned agent-owner EOA, not a
contract or delegated account. This is a synthetic enforcement demo, not
chain-derived feature evidence.

Read-only three-run planning, with no signing, lock or evidence output:

```bash
pnpm demo:live --recipient "$AGENT_OWNER_ADDRESS" \
  --max-transfer-wei "$MAX_ATTEMPTED_TRANSFER_WEI" \
  --max-gas-wei "$MAX_GAS_FEE_WEI" --runs 3 --wait-windows
```

Only after separate human approval of testnet spending and owner reset, rerun
that exact reviewed plan with both authorizations:

```bash
pnpm demo:live --recipient "$AGENT_OWNER_ADDRESS" \
  --max-transfer-wei "$MAX_ATTEMPTED_TRANSFER_WEI" \
  --max-gas-wei "$MAX_GAS_FEE_WEI" --runs 3 --wait-windows \
  --broadcast --allow-owner-reset
```

These are operator recipes, not commands run by the agent. One-run mode omits
`--runs 3 --wait-windows`. Three runs require two real one-hour window waits;
reset never clears outflow. Source/configuration and combined preflight are
checked again after each wait. Failures stop writes instead of changing state
to make a scene pass. Two confirmations and a final canonical receipt audit
are required. Live acceptance is not proven by the local mocked tests.

### Interrupted-Run Reconciliation

Read ignored `deployments/.pending/demo-live.lock` to locate the new UUID report
under `evidence/replay/live/`. It contains prepared intents, hashes when known,
verified public bundles and partial scene checks. Reports use atomic fsynced
writes; raw provider diagnostics and private credentials are not persisted.

1. Preserve the lock/report and stop using those wallets. SIGINT/SIGTERM stops
   further writes but does not cancel transactions already sent.
2. For each known hash, independently confirm canonical transaction/receipt,
   chain, sender, nonce, target, calldata, zero value, gas and status. For a lost
   acknowledgement, locate the sender/nonce from its saved preparation block;
   reconcile all possible included or pending attempts, not just an RPC error.
3. Recheck bridge balances, recipient receipts, guardian tier/window/outflow,
   key/epoch/trust and remaining budgets. A partially completed sequence is not
   a passed run and cannot be undone by deleting its files.
4. Prepared/pending/broadcast-unknown intents keep the lock. There is no
   automatic resume, rebroadcast, nonce replacement or stale-lock cleanup.
   Removing a lock or starting a new funded run requires explicit operator
   review after every intent is resolved and a fresh safe state is established.

Confirmed runs release only their own lock; UUID reports are retained. If the
ledger cannot be saved or a receipt disagrees with its intent, stop and inspect
existing evidence. Never paste private values or raw credential-bearing logs
into chat. [Local wrapper evidence](../evidence/phase2-live-wrapper.md).

`--phase1` is explicit: it reports `demoReady: false` and `bridgePending: true`.
It cannot bypass checks for a recorded or already configured bridge. Default
`pnpm run doctor` still requires the F-20 bridge and full demo state. Use `run`:
pnpm 12's built-in `doctor` otherwise shadows the project script.

Runtime TypeScript/Foundry readers now accept both legacy string addresses and
confirmed records. This compatibility is not verification of legacy addresses.
`verify:deployment` verifies all four contracts when a bridge is recorded.
Use the explicit demo candidate and verified configuration receipt, not a manual
bridge insertion into a Phase 1 manifest. Doctor alone remains a state check;
`demo:preflight` combines source, seed, credential and readiness verification.
[Local workflow evidence and current blockers](../evidence/phase2-bridge-workflow.md).
No historical signed bundle domain is rewritten. F-12, Phase 2 live acceptance,
history cleanup and remote CI remain separate obligations.
