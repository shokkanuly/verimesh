# F-13 Native Fork Refresh

October 8, 2026. Command:
`MONAD_RPC_URL=https://testnet-rpc.monad.xyz pnpm test:fork`.

The explicit runner pinned block **69192500**. All six native tests passed,
zero failed and zero skipped: ERC-8004 owner lookup, native P256 acceptance,
tampered digest/key/signature rejection and full fork-local verdict flow.
[Raw public output](fork-tests.txt). No transaction was broadcast.

An earlier call with no explicit RPC exited 1 by design. The first configured
attempt failed with an RPC fetch transport error; after a public read-only chain
ID probe succeeded, one retry completed successfully. No skip/fallback was used
to turn that failure into a pass. Foundry reported non-fatal cache/explorer
configuration warnings. Offline fallback tests remain a separate suite.

This read-only native proof does not establish fresh deployed-source equivalence,
new accepted testnet receipts, safe operator credentials or completed live runs.
