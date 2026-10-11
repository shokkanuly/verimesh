# Rebrand Reports

Fresh P1 verification on October 11, 2026 is recorded in
[P1-rebrand.md](../../evidence/ship/P1-rebrand.md). The active SDK, Solidity
library and verdict generator already use EIP-712 name `Horkos`, version `1`.
The existing parity/domain checks, workspace and contract builds, scoped gas
check and five recorded bundle verifications passed locally. No further
protocol rename or compatibility fallback was needed.

The domain change alters verdict digests. Archived pre-Horkos evidence remains
historical; its signatures must not be presented as current Horkos verdicts.
This verification does not establish deployment readiness, live receipts,
remote CI or publication. The single-signer trust assumption remains unchanged.

The frozen baseline plan is retained as historical evidence in
[RB-1-plan.md](../../evidence/rebrand/RB-1-plan.md), alongside the
[inventory](../../evidence/rebrand/RB-1-files.md) and
[RB-2 checkpoint status](../../evidence/rebrand/RB-2-status.md).

Historical reports are not active deployment configuration or current release
acceptance. New measurements and regenerated artifacts are recorded separately.
