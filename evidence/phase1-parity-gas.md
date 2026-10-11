# F-14 Shared Verdict Parity and Scoped Gas

Verified October 7, 2026. Toolchain: Forge 1.8.4 (50af4efe), Solidity 0.8.24,
Ethereum compiler target Cancun, optimizer disabled, Node 22, pnpm 9.

## Shared Vectors

`test-vectors/verdict-vectors.json` contains 14 deterministic public-only cases.
The original five cases remain in their original positions. Nine cases add every
unsigned verdict-field mutation (agentId, modelHash, inputHash, policyId, scoreBps,
observedAt, expiry, nonce) and a different registry domain. Wrong-chain and expired
cases were already present. Mutations preserve the canonical signature; wrong
domains are signed for those other domains, then rejected by the canonical registry.
The two legacy tweaked-and-re-signed cases remain valid controls, not tamper cases.

Both suites compare domain separator, struct hash and complete digest. TypeScript
also checks signature/expiry expectations. Solidity tests submit each case to a
fixture-domain registry and require the actual BadSignature/Expired error. The
mutated agent has an active key so KeyNotActive cannot mask BadSignature. Existing
Foundry vector tests and all existing behavioral tests are retained.

The generator no longer serializes any private-key field. The existing public
fixture key is constructed only in memory for deterministic offline signing.
It must never be used as an operator key or bound to a live agent.

`pnpm check:parity` verifies deterministic fixture bytes, runs Vitest parity, and
runs both Solidity vector suites. A dedicated CI job uses that command. CI also
runs the address/parity regressions and checks scoped gas snapshots. Foundry is
pinned to the locally verified 1.8.4 version. Remote CI has not run: no repo exists yet.

## Actual Results

| Command | Result |
|---|---|
| `pnpm build` | Exit 0; SDK, sentinel, CLI and dashboard build; existing Vite large-chunk warning remains |
| `pnpm test` | Exit 0; 51 TS tests + 11 Node address/parity regressions pass |
| `pnpm check:addresses` | Exit 0 |
| `pnpm check:parity` | Exit 0; 14 vectors; 17 TS parity tests pass, 3 unrelated tests excluded by selector; 20 Solidity vector tests pass, no skips |
| Deliberate digest-bit mutation in a temporary vector copy | Generator `--check` exits 1; automated regression asserts mismatch rejection; temporary copy removed |
| `cd contracts && MONAD_RPC_URL= forge test` | Exit 0; 88 offline tests pass, 6 intentionally disabled fork tests skip |
| `cd contracts && MONAD_RPC_URL= forge snapshot` | Exit 0; 88 tests pass; whole-test `.gas-snapshot` refreshed without removing existing tests |
| `forge test --rpc-url ... --fork-block-number 68910254 --match-contract 'OperationGasTest\|SharedVectorRegistryTest' -vv` | Exit 0; 20 native-fork tests pass, 0 skipped; no fallback etched |
| Offline `forge test --match-contract OperationGasTest --gas-snapshot-check true` | Exit 0; all 5 scoped snapshots reproduce |
| Native-fork `forge test --rpc-url ... --fork-block-number 68910254 --match-contract OperationGasTest --gas-snapshot-check true` | Exit 0; all 5 native scoped snapshots reproduce |
| `pnpm replay` and `pnpm verify-bundle evidence/replay/bundle-freeze.json` | Exit 0; three offline bundles generated, freeze bundle passes all five CLI checks |
| `pnpm verify:testnet` | Exit 0; SDK signature accepted and tampered digest rejected at block 68912091; [RPC proof](testnet-proof.json) refreshed |

## Measurement Scope

Foundry's [gas snapshot API](https://getfoundry.sh/reference/cheatcodes/gas-snapshots/)
captures individual callee frames using `snapshotGasLastFrame`. Deployments,
fixture parsing, signature generation, assertions, caller/ABI overhead and base
transaction gas are outside the measurement. All target accesses are cooled
before the measured call. `isValid` measures the accepted-verdict happy path,
not the cheap unknown-verdict path. `applyVerdict` measures one delay-tier action.
Initial binding uses a fresh agent; rotation uses an existing key slot.
Identity ownership is a mock in both benchmarks; real ERC-8004 lookup costs differ.

| Scoped operation | Ethereum local / Solidity fallback | Native Monad fork at 68910254 |
|---|---:|---:|
| bindKey_initial | 98,606 | 107,975 |
| bindKey_rotate | 41,706 | 56,975 |
| submit | 345,389 | 132,837 |
| isValid_accepted | 11,697 | 19,684 |
| applyVerdict_delay | 99,856 | 137,006 |

Raw operation values are in [local JSON](../contracts/snapshots/EthereumLocalFallback.json)
and [native JSON](../contracts/snapshots/MonadForkNative.json). The separate
`.gas-snapshot` contains whole-test totals, not values for the table. No percentage
claim compares all methods across two different EVM gas models. Native numbers
are fork-local simulations, not transaction receipts or deployed-source equivalence.

Normalized-event/inputHash cross-language vectors are still a separate roadmap
gap; F-14 verifies the requested verdict/domain/signature cases, not scorer accuracy.
No transaction was broadcast and no private-key value is included in this report.
