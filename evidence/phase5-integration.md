# F-50 Integration Kit Acceptance

October 8, 2026. Status: implemented and exercised locally; independent engineer
acceptance and external integration remain unproven.

- Followed [GUIDE.md](../integrations/GUIDE.md): frozen install/build,
  `node apps/integrator-demo/demo.mjs` and the TypeScript example pass.
- 14 new Foundry tests exercise signed submit -> action -> consume-once and
  reject wrong agent, policy, model, caller, payload, cross-contract replay,
  insufficient score, stale/expired/revoked verdicts, an unaccepted verdict and
  an altered accepted preimage. Later failures roll back consumption.
- [GuardedAction](../contracts/src/examples/GuardedAction.sol) pins trust at
  construction, uses the complete verdict preimage (inputHash/nonce are not
  stored separately), and binds its input to consumer/chain/caller/payload.
  Its action is a counter/event, not a custody implementation.
- `SimpleGate` remains the minimal teaching example. The guide explicitly
  identifies its missing model, caller and action binding. No deployment ABI
  or canonical manifest was changed.
- Dashboard integration view now quotes the compiled reference implementation
  instead of accepting caller-selected agents/policies. Its browser acceptance
  still passes on desktop/mobile, including recorded tamper and mocked RPC cases.
- The isolated-checkout runner now executes the integration script too.
- Full build passes; 80 Node + 89 TypeScript + **131 offline Solidity** tests pass;
  six explicitly offline fork skips. Address check and scoped gas check pass.
  Existing Vite >500 kB chunk warning remains.

The tiny script uses an ephemeral local signer and Solidity P256 fallback;
neither operator files nor a live wallet are accessed. No measured external
ten-minute integration, published package, team commitment or adoption is claimed.
[Outreach drafts](../integrations/OUTREACH.md) are unsent and contain empty human
evidence rows, not invented prospects.
