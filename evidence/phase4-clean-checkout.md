# F-40 Isolated Checkout Acceptance

Date: October 8, 2026. Tested source commit:
`e6c9d82d408b240857a84333e2589086f1104e87`.

`pnpm check:checkout` made a private temporary local clone of committed source,
with no working-tree secrets or dependency/build directories copied. Existing
history stayed local and the temporary clone was removed in `finally`; this
was not an approved public/history-free release snapshot or a remote push.
The current repository vendors its contract dependencies; no submodule fetch
was needed.

All 19 recorded steps passed: clone/checkout/cleanliness, the exact four-command
QUICKSTART acceptance block, full tests, offline Forge with scoped gas checks,
address consistency, shared-vector parity, replay, each of five CLI checks,
and final source cleanliness. Tested commit had 78 Node + 89 TS tests;
Forge reported 117 passed/zero failed/six explicit offline fork skips.

The quickstart block took 15.15 seconds with installed toolchains and a warm
package cache. Its sandbox segment took 3.81 seconds, first accepted local
verdict 2.50 seconds within that segment, with 31 public local receipts. No
claim is made about a cold machine, Monad throughput or live deployment.

The entire acceptance run took 270.78 seconds. The later `pnpm replay` step
accounted for an anomalous 244.52 seconds but exited successfully. This outlier
is retained rather than hidden; it does not describe the quickstart's timing.

Two additional runner tests check extraction of the real document and reject
ambiguous/shell-expanded acceptance blocks. Current workspace build, 80 Node
+ 89 TS tests and 117 offline Solidity tests pass, with six explicit fork skips.
The machine-readable generated report is ignored at
`evidence/replay/clean-checkout.json`; rerun the command to check a newer commit.

Remote CI has not run because no GitHub repository has been configured. A
local checkout check is not a CI badge or source-history security clearance.
