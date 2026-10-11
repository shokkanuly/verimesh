# Rubric Audit and Hardening Plan

Received October 7, 2026. Internal submission target: October 13, 20:00 GMT+5.
Hard deadline supplied by the operator: October 14, 08:59 GMT+5.

This is the repository work order derived from the operator's October 7 rubric
audit. It supplements the fix-and-ship task IDs, without silently passing a
phase gate. The authoritative implementation/evidence board is
[06-project-status.md](06-project-status.md).

## Baseline Reconciliation

The supplied audit uses October 6 counts (42 TS / 68 Solidity) and says fork
tests still skip and addresses drift. Subsequent F-10, F-13 and F-14 evidence
records address checking, six explicit passing fork tests and 14 shared verdict
vectors. Those local results do not establish a freshly deployed live product.

Do not infer that the cryptographic core is audited or sound merely from passing
tests. Fresh deployment, real pipeline receipts, enforcement, dashboard events,
external integration and public-ready history are still separate obligations.
See [the current gate](../evidence/phase1-gate.md).

## Work Order and Acceptance

The table below is the original work order, not the current completion board.
The human authorized all remaining local stages on October 8. Bridge/replay,
UI/API, sandbox/test kit, local CI, integration and submission preparation have
since progressed; consult [the current phase overview](06-project-status.md).
Chain-derived sources and stateless design remain open. The
[guarded live orchestration wrapper](../evidence/phase2-live-wrapper.md) is now
implemented and locally tested; actual Monad execution remains open.
Three local enforcement rehearsals now pass, including exact
transfer/cumulative accounting and reset/negative scenes; Anvil time advances
are explicitly local, not live evidence. [Rehearsal results](../evidence/phase2-demo-rehearsal.md).
Shared normalized-event parity is now locally complete: 12 public input vectors,
strict exact-integer/field-width validation and a Solidity encoding fuzz test.
[Fresh results and limitations](../evidence/phase1-input-parity.md).

| Priority / task | Build and prove | Gate / status |
|---|---|---|
| Safety, F-01/F-03 | Fresh funded testnet wallet; fresh P256 signer; agent ownership; metadata-only history scans; approved cleanup | Rotation incomplete; remote deferred to operator; no rewrite authorized |
| Deployment, F-11 | Receipt-confirmed deploy/seed; commit/compiler/code/constructor provenance; archive deprecated manifest; verify explorer source | Preflight, seed safety and confirmed-publication tools tested; actual live broadcast/source/seed/publication blocked on operator configuration |
| Live proof, F-12 | Accepted registry verdict plus tamper/duplicate rejection; revoke/rebind a throwaway agent; real receipts | Blocked on F-11 |
| Verification, F-13/F-14 | Explicit native fork suite, shared digest negatives, measured scoped gas | Existing local evidence; rerun when sources change |
| Enforcement, F-20/F-21 | Atomic MockBridge release hook; benign and near-miss among five incidents; separate boundary tests | Phase 2 not yet authorized |
| Chain evidence, F-20/F-21 extension | Outflow logs -> features -> scorer -> verdict; bundle `sources`; RPC CLI refetches and re-derives | Not built; define complete observation windows and provenance, not just cherry-picked log references |
| Stateless path, new F-21S | `verifyVerdict` and `_consumeSigned`, matching rejection tests; unchanged v1 digest | Not built; resolve unsigned-epoch caveat first (see SECURITY.md) |
| Demo, F-22 | Preflight then benign/throttle/delay/freeze/release/tamper scenes; three clean runs with receipts | Requires Phases 1/2 and real enforcement |
| Live UI/API, F-30/F-31 | Chain events; visible LIVE/RECORDED; disk persistence; fully verified uploads; limits/CORS/read-only | Phase 3 not authorized; seeded dashboard and in-memory API remain |
| Hosting, F-32 | Static dashboard and read-only API with no hosted keys | Operator selects/authorizes host |
| DX, F-40/F-42 extension | Zero-config `pnpm sandbox`; throwaway identity/key; testing package/Foundry fixture; examples execute in CI | Planned, not available yet; local P256 fallback must be explicitly local/synthetic |
| Quickstart, F-42 | `QUICKSTART.md`; prerequisites; runnable test markers extracted in clean-container CI; measured first-verdict timing | No 90-second sandbox or 10-minute quickstart claim until measured |
| CI, F-41 | Build/tests/parity/addresses/secrets/quickstart/deployment drift; published green run URL | Local workflow only; repo creation deferred to operator |
| Integrators, F-50/F-51 | Tier-C Tripwire; assess HyperCompute/StreamMesh before choosing a second adapter; guide/testing kit; honest adopter table | No other repositories inspected; no external adopter or commitment claimed |
| Outreach, F-50/F-51 | Operator sends to at least eight real named teams by Oct 9; dated links/quotes; Oct 11 tier-A/B decision | No messages sent; no invented names, interest or transactions |
| Packaging, F-52/F-60/F-61 | JUDGES/ARCHITECTURE/SUBMISSION; real artifact links; videos; logo; final clean-checkout report | Planned; no fake URLs or checked boxes |

Tier A means an external team's testnet integration with a commit/PR. Tier B
means a named external person's documented commitment and scope. Tier C is a
first-party consumer and must never be counted as adoption. Synthetic load lives
under `evidence/load/`, labeled synthetic and excluded from traction totals.

## Deployment Check Contract

Implemented commands: `pnpm verify:deployment` and `pnpm run doctor`. Both are
read-only; neither publishes manifests, sends transactions or rotates secrets.
Use the explicit `run` form: pnpm 12 has a built-in `doctor` command that shadows
the project script. No global pnpm configuration is changed to work around it.
They intentionally fail on the existing historical manifest.

The new checks accept deployment records under `contracts.<name>` with `address`,
`txHash`, `block`, `runtimeCodehash`, `constructorArgsHash`. They require:

- `chainId: 10143`, `commit` (source Git SHA), `solc: "0.8.24"`, public `deployer`.
- `agent: { agentId: "decimal uint256", keyX, keyY, epoch }` (public data only).
- `allowlists: { agents: ["decimal IDs"], models: ["bytes32 hashes"] }`.
- `owners: { agent, guardian, demo }` (public addresses). The permissionless
  VerdictRegistry has **no admin owner**, so `owners.registry` would be misleading.
- When a MockBridge is recorded: the same complete creation/code/constructor
  receipt record as the core contracts. Full doctor also requires
  `guardian.outflowCap` (positive uint256 decimal string in smallest units).

The historical string-address manifest is **not** upgraded by inventing receipt
metadata. Runtime consumers and Foundry readers now accept both strings and
receipt records; publication switches the canonical file only after verification.
The verifier covers the three Phase 1 contracts and conditionally the bridge,
including its constructor guardian address and fresh artifact/source checks.
Doctor checks both directions of the guardian/bridge link, bridge owner versus
`owners.demo`, and pending bridge ownership. [Local verification evidence](../evidence/phase2-bridge-verification.md).
The combined four-contract demo workflow is now implemented and locally tested:
explicit stage/cap preparation, configuration receipts and atomic publication.
Phase 1 cannot bypass it by accepting a bridge. [Workflow results](../evidence/phase2-bridge-workflow.md).

`verify:deployment` refuses a dirty tree. The source commit must exist locally;
later evidence-only commits are allowed only if `contracts/` and `.gitmodules`
are unchanged. It recompiles with Forge, pins a block, verifies successful
canonical creation receipts, the actual creation input/deployer/chain, constructor
hashes, full runtime hashes and executable bytes. Solidity CBOR metadata is
decoded with `cborg`; only artifact `immutableReferences` are masked. Constructor
transaction checks cover the values that masking would otherwise hide.
The Etherscan V2 source check requires a local `ETHERSCAN_API_KEY`; failed,
unavailable or unverified explorer responses fail rather than passing silently.
The command suppresses arbitrary compiler/RPC/API exception text to avoid
leaking keys in provider URLs or diagnostic payloads.

`doctor` recompiles for current ABIs and pins every read/log range to one block.
It checks registry/identity/guardian linkage, ERC-8004 agent ownership, the local
P256 public key versus manifest/currentKey, active epoch, guardian owner and
pending transfer, policy, effective tier, scorer hash and both allowlists.
Guardian trust-change events now make extra trusted entries detectable by
replaying all trust changes from its deployment block. They are not emitted by
the historical deployed guardian; this source must be redeployed first.
Bridge configuration/owner/link/cap, clean outflow window and at least 0.1 testnet MON in
the demo wallet are additional readiness checks. Reorganized snapshots fail.
`doctor` is a state check, not a substitute for `verify:deployment`.
`demo:preflight` now combines both with credentials, funding and all four seed
receipts at one snapshot; it does not execute or certify live demo scenes.

The Solidity deploy script no longer writes JSON during Foundry simulation.
Its addresses are candidates until the deployment wrapper verifies actual
receipts. Preflight, receipt preparation, archiving/atomic publication and
idempotent seed are now implemented; see [the operator workflow](08-deployment-workflow.md)
and [continuation evidence](../evidence/phase1-deployment-workflow.md).
`deploy:preflight`, `deploy:prepare`, `deploy:publish` and `demo:preflight` never send transactions.
`doctor --phase1` explicitly stays non-demo-ready; default doctor still requires
F-20. Live broadcasting/source publication/seed broadcasting, `deploy:testnet`,
`reseed` and `keys:generate` are not automated by this tranche.

## Claims and Design Corrections

- v1 is single-signer, auditable and trust-minimized, not trustless AI or zkML.
  The signer attests to input/model hashes; it does not prove the input is true.
- Current integration is submit then consume. Registry validity does not prove
  unused status; consume-once is local to each consumer.
- Stateless verification cannot prove a signed key epoch with the unchanged
  eight-field v1 verdict. Specify same-key rebind/revocation behavior before
  implementing or advertising the proposed one-transaction path.
- Raw P256 is not WebAuthn. A guardian passkey is optional only after Gates 1
  and 2 pass; no passkey or k-of-n/challenge/zkML implementation is claimed.
- Source/API/CLI sketches in the supplied audit are targets, not existing API
  guarantees. Integration examples must compile/run before timing or line-count
  claims are published. The 8.5 engineer-day comparison is an estimate, not a
  measured benchmark.

## Operator Schedule and Cut Order

| Date | Target, not a claim of completion |
|---|---|
| Oct 7 | Rotate/fund keys, decide history plan, prepare verified fresh deployment; private push when operator creates repo |
| Oct 8 | Real registry receipt, verify/doctor, fork results, outreach |
| Oct 9 | Bridge enforcement, chain-derived evidence, stateless design, choose second consumer |
| Oct 10 | Local sandbox/testing kit, real dashboard, evidence API hardening |
| Oct 11 | Clean-container quickstart, adapter/outreach follow-ups, honest named-user decision |
| Oct 12 | Clean checkout, published CI, three live demos, judge access, final report |
| Oct 13 | Hosting/videos/logo/form; internal submit target 20:00 GMT+5 |
| Oct 14 | Buffer only |

Cut first: optional WebAuthn, browser-side re-verification, second first-party
adapter, hosting beyond static dashboard/read-only API. Discuss cuts with the
operator. Never cut secret cleanup, deployment verification, real verdict,
enforcement, tested quickstart or honest trust/adoption claims. Repository
creation, cleanup approval, funding, outreach, hosting authorization, recording
and submission remain operator actions. Do not auto-message other teams or chats.
