# F-42 Local Sandbox And Test Kit

Date: October 8, 2026. Local Anvil only; no Monad transaction was broadcast.

`pnpm sandbox` builds the workspace and contracts, creates disposable
loopback-only Anvil chain 31337, funds a fresh in-memory local wallet, installs
the local Solidity P256 fallback, deploys four contracts, binds the mock agent
and trusts the active v2 scorer. Its child processes receive a small whitelisted
environment; the runner never uses operator wallet/P256 credentials or writes
private material. Anvil output is suppressed and its process is stopped in
`finally`. The canonical testnet manifest is not touched.

The most recent run produced 31 actual local receipts: 25 successful and six
reverted. Assertions check five accepted verdicts, three receipt/event-confirmed
actions, normal and cumulative-cap releases, delay/freeze reverts with unchanged
balances/accounting, tamper/duplicate rejection, owner reset and key revocation.
Public generated evidence lives under ignored `evidence/replay/sandbox/`.

## Executed Checks

- `pnpm install --frozen-lockfile`: passed, dependency policy verification passed;
  only a workspace importer was added, no external dependency version changed.
  An initial offline lockfile-only attempt lacked registry policy metadata; it
  failed without bypassing the policy check.
- `pnpm sandbox`: passed twice. Latest wall time including workspace build was
  10.43 seconds with dependencies/toolchain already installed. The sandbox
  segment took 2.61 seconds; first accepted verdict took 1.29 seconds within
  that segment. These are warm local timings, not clean-machine promises.
- `pnpm verify-bundle evidence/replay/sandbox/bundle-freeze.json`: exit 0.
- `node examples/ts-sentinel/demo.mjs`: passed, explicitly first-party/synthetic.
- `pnpm test`: 78 Node + 89 TypeScript tests passed, zero skips.
- Offline Forge: 117 passed, six explicit fork skips; scoped gas checks pass.

`packages/testing` now provides `createMockSentinel()` with independent
ephemeral instances, caller-selected domain/agent/policy/time/nonce and verified
five-incident fixtures. Three tests verify those guarantees. The reusable
Foundry fixture was introduced with F-20 and is exercised by its 16 bridge
tests. `QUICKSTART.md` contains the exact four-command local acceptance block.

The quickstart still needs an isolated checkout run and remote CI. Neither
this kit nor these synthetic receipts establishes external integration,
chain-derived observation, live testnet readiness or submission completion.
