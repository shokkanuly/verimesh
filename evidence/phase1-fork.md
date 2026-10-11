# F-13 Fork Suite

Verified October 7, 2026 with Forge 1.8.4 (commit 50af4efe).

## Root Cause and Fix

The previous `try vm.createSelectFork(...) catch` hid an EVM mismatch:
"cannot create a monad fork with an EVM instantiated for ethereum".
The current Foundry selects the chain's EVM from `--rpc-url`; the environment
variable alone does not select it. Explicit fork creation errors now propagate.
An absent/empty `MONAD_RPC_URL` is the only intentional offline skip, with a
logged reason. Missing identity bytecode and a wrong chain ID fail setup.

The runner supplies both environment and RPC option, pins one block for all six
tests, requires six named PASS results and zero skips, and saves real output.
Failures include the underlying reason for every affected test. No test assertion
was relaxed, no precompile was mocked in the fork suite, and nothing was broadcast.

## Commands

| Command | Actual result |
|---|---|
| `MONAD_RPC_URL=http://127.0.0.1:1 pnpm test:fork` | Exit 1; HTTP connection failure, not skips; failure report saved before successful rerun |
| `MONAD_RPC_URL=https://testnet-rpc.monad.xyz pnpm test:fork` | Exit 0; 6 passed, 0 failed, 0 skipped at pinned block 68910254; [raw output](fork-tests.txt) |
| `pnpm build` | Exit 0; existing Vite chunk warning remains |
| `pnpm test` | Exit 0; 9 address regressions + 42 TypeScript tests pass |
| `cd contracts && MONAD_RPC_URL= forge test` | Exit 0; 68 offline tests pass, six explicitly disabled fork tests skip |
| Plain `forge test` with ignored local RPC environment and sandbox network | Exit 1; explicit fork setup now reports DNS failure rather than hiding it |
| Entire suite with `forge test --rpc-url ...` | 11 pass, 4 setup failures: native precompiles cannot be overwritten with `vm.etch` |

The last diagnostic is why offline Solidity-fallback tests and native fork tests
run separately. It is not resolved by deleting tests or replacing their fallback
assertions. F-13's six integration tests run and pass through the explicit runner.
These fork-local deployments/pranks are not fresh deployed-contract receipts (F-11/F-12).
