# F-20 Local Bridge Enforcement

Date: October 8, 2026. No testnet transactions were broadcast.

`contracts/src/examples/MockBridge.sol` is a native-currency reference adapter,
not a production bridge. Only its two-step owner can release funds. Every
release calls the configured guardian before transferring; a rejected recipient
or insufficient balance reverts the accounting and transfer together.
Reentrancy is blocked, including when the bridge owner is a receiver contract.

The reusable `contracts/test/helpers/VerimeshTest.sol` creates an ephemeral P256
key in memory, binds a mock agent, and signs real registry verdicts. The fallback
at `0x100` is local-only and is not evidence of native Monad execution.

## Executed Checks

- `pnpm build`: passed; existing dashboard chunk-size warning remains.
- `pnpm test`: 78 Node and 56 TypeScript tests passed, no skips.
- `cd contracts && MONAD_RPC_URL= forge test --gas-snapshot-check true`:
  117 passed, zero failed, six explicit offline fork skips.
- Sixteen bridge tests cover normal releases, cumulative and prior outflow,
  delay/freeze, exact expiry, authorized early reset, no tier downgrade or
  renewal, release authorization, invalid parameters, failed-transfer rollback,
  insufficient funds, reentrancy, and six threshold boundaries. The cumulative
  cap fuzz test ran 1,000 cases.

## Still Required

F-20 is locally implemented, but live acceptance remains partial. The historical
manifest has no verified MockBridge deployment. Fresh deployment, adapter
configuration, and explorer-linked blocked-release/reset receipts are pending
the safe operator credentials and Phase 1 live gate. No live release attempt is
represented by the local tests.
