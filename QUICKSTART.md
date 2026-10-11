# Horkos Quickstart

## Local Sandbox

Prerequisites: Node.js 22 or newer, pnpm 9 or newer, Foundry v1.8.4 (`forge`
and `anvil`). The contract dependencies are vendored in this checkout. No wallet extension, RPC API
key, `.env`, faucet funds or identity NFT is required for the local sandbox.

Run from the repository root. This block is the quickstart acceptance target:

```bash
pnpm install --frozen-lockfile
pnpm sandbox
pnpm verify-bundle evidence/replay/sandbox/bundle-freeze.json
node examples/ts-sentinel/demo.mjs
```

The sandbox builds the workspace/contracts, starts a disposable loopback-only
Anvil chain (31337), generates keys only in memory, deploys a mock identity,
registry, guardian and native-currency bridge adapter, and binds the mock
sentinel. It submits five synthetic incidents, checks receipt-confirmed tiers
and real releases/reverts, then checks tampering, duplication, owner reset and
revocation. It stops its Anvil process even on failure. Anvil's account output
is suppressed; private keys are never written into its public evidence.

`evidence/replay/sandbox/run.json` records public local transaction hashes,
scores, checks and timing. Bundles beside it pass offline verification after the
disposable chain stops. They are **LOCAL / SYNTHETIC**, not explorer-linked Monad
receipts, real attack observations, live identity ownership or adopter traction.
The local P256 verifier is a Solidity fallback, not Monad's native precompile.

## Offline Evidence Only

After the workspace is built, `pnpm replay` produces five deterministic fixture
bundles under `evidence/replay/`. `pnpm verify-bundle` recomputes normalized input,
digest, model hash, integer score and low-s signature. It does not establish the
truth of supplied features or current key ownership without independent chain
checks. Active replay uses `tripwire-rules@2.0.0`; v1 verification remains for
historical evidence.

## Integrator Tests

`packages/testing` exports `createMockSentinel()`. Its `publicKey` can be bound
to a mock registry; `verdictFor({ incident, observedAt, nonce })` returns a real
signed verdict and bundle without exposing private material. Each instance has
its own ephemeral key. Optional domain, agent and policy settings allow testing
the actual consuming contract. See [the executable example](examples/ts-sentinel/demo.mjs).

Foundry consumers can inherit
`contracts/test/helpers/HorkosTest.sol`, call `setUpHorkos()`, then
`submitVerdict(score, nonce)`. The helper installs a local fallback, creates a
mock identity and signs real EIP-712 verdicts. It is test infrastructure only.

## Testnet

Live deployment is a separate, gated workflow. Follow
[the operator workflow](docs/08-deployment-workflow.md), rotate exposed wallets
and bind the active model deliberately. Never paste a secret into chat or use
fixture keys for a funded deployment. The historical manifest is not proof that
the current hardened contracts are deployed. MetaMask is not required for the
local sandbox.
