# Adoption and Integration Evidence

October 11, 2026. External adopters: **0 documented**. External commitments:
**0 documented**. No outreach was sent by the agent. These counts describe
available evidence, not presumed interest or the total addressable market.

| Tier | Required evidence | Current status |
|---|---|---|
| A: external integration | External team's testnet consumer plus dated commit/PR and actual receipt links | None documented |
| B: external commitment | Named person's dated statement, permission to quote, concrete integration scope | None documented |
| C: first-party reference | Repository source and reproducible acceptance | Live Tripwire/MockBridge receipts; local GuardedAction; not external traction |

## Human-Maintained External Evidence

| Actual team/person | Tier | Concrete scope | Date | Commit/PR/message link | Permission to quote |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |

HUMAN: fill only after real contact and verification. Log sent outreach separately
in [OUTREACH.md](../integrations/OUTREACH.md). Synthetic incidents, fuzz runs,
sandbox receipts, first-party adapters and browser mocks count as **zero users**.
No partner's repository or compatibility was assessed. HyperCompute/StreamMesh
remain unassessed operator-supplied possibilities, not selected integrations.

## Build Your Own vs. Horkos

This is a scope comparison, not a benchmark or a claim of saved engineering days.

| Concern | Roll your own | Current Horkos implementation | Limits retained |
|---|---|---|---|
| Signature/domain | Design encoding and verification | Shared eight-field EIP-712 digest; P256, low-s, parity vectors | Single signer; not proof of inference |
| Identity/rotation | Implement owner-controlled bindings | ERC-8004 ownership lookup, key epochs and revocation | Operator identity and key security remain essential |
| Consumer replay | Design application reuse rules | `_consume` once per consumer | Not global replay prevention; bind your exact action |
| Application trust | Design all policy rules | Example pins agent/policy/model/caller | Caller must select sound domain semantics |
| Evidence tooling | Build verifier and diagnostics | Versioned scorer/source hash, CLI and bounded read-only API | Features not independently derived from chain |
| Enforcement | Implement bounded transfer restrictions | Live testnet MockBridge throttle/delay/freeze/reset | Synthetic inputs; not production bridge |
| Developer setup | Create fixtures and runner | Ephemeral test kit, Anvil sandbox, tested quickstart | Requires Node/pnpm/Foundry; no published packages |
| Live operations | Fund, deploy, monitor and publish | Source-verified deployment and real receipts | Public hosting and remote CI pending |

First-party acceptance is documented in
[phase5-integration.md](../evidence/phase5-integration.md). A second first-party
adapter would still be Tier C, not a substitute for external evidence.
