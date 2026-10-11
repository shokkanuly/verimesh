# Normalized Input Parity and Exact Integer Hardening

October 8, 2026. **Implemented and verified locally; not deployed.**
This closes the shared normalized-event/inputHash parity gap (M3/T-32),
not the fresh testnet, chain-derived evidence or final release gates.

## Source and Scope

Tested the current working tree based on local HEAD
`0096ea8e29c1087ed9247db1785c4cb58f87389b`, branch `fix/ship`, including the
uncommitted frontend changes and this engineering tranche. This is not an
isolated committed-checkout acceptance, remote CI run or native-fork refresh.
The earlier [clean-checkout audit](phase6-clean-checkout.json) remains pinned
to its own source commit and results.

- Added [InputHashLib](../contracts/src/libs/InputHashLib.sol) with the same
  seven-field `keccak256(abi.encode(...))` commitment as the SDK. The preimage
  is 224 bytes: bytes32 routeId, uint256 amount, uint256 sourceChainId, uint256
  targetChainId, address recipient, uint64 timestamp and uint64 nonce.
- Added [12 public shared fixtures](../test-vectors/input-vectors.json), with
  encoded bytes and hashes. Cases cover zero, maximum field widths, integers
  above JavaScript's safe range, swapped chains and each single-field mutation.
  Numeric fixture values are decimal strings; no private key is involved.
- Hardened [SDK normalization](../packages/sdk/src/normalize.ts) and direct
  `hashInput` calls to reject unsafe/noninteger numbers, negative values,
  malformed numeric strings, overflow and incorrect hex widths. Use bigint or
  decimal strings for large integers. Exact safe numbers and unprefixed hex
  remain supported. Valid existing commitments and the v1 verdict format are
  unchanged; previously rounded or malformed inputs now fail explicitly.
- Added [28 SDK checks](../packages/sdk/test/normalize.test.ts),
  [three Solidity checks](../contracts/test/InputVectors.t.sol) including a
  1000-case fuzz test, and four Node fixture-generation/drift regressions.
- Extended `pnpm check:parity` and the existing CI job to check both fixture
  families. Altered input hashes, encoded preimages or missing vectors fail.

The Solidity helper is an internal library, not a new deployed verifier or a
change to the existing registry's storage, signature domain or acceptance rules.
Hash parity proves encoding agreement, not that supplied observations are true.

## Fresh Local Results

| Command | Result |
|---|---|
| `pnpm build` | PASS: all workspace packages and dashboard |
| `pnpm test` | PASS: 84 Node + 117 package TypeScript tests; zero failures |
| `pnpm lint` | PASS: first-party JS syntax and five TS projects |
| `pnpm check:addresses` | PASS: canonical manifest readers; no address drift |
| `pnpm check:parity` | PASS: 12 input + 14 verdict vectors; 45 selected TS and 23 Solidity tests |
| `MONAD_RPC_URL= forge test --gas-snapshot-check true` in contracts | PASS: 134 Solidity tests; six explicit offline fork skips; scoped gas checks pass |
| `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/verimesh-playwright-browsers pnpm check:dashboard` | PASS: homepage/dashboard routes, responsive layouts, recorded evidence, API rejection/offline states and synthetic RPC correlation |

Package counts: SDK 57, sentinel 44, CLI 13, test kit 3. The parity subsets
are included in the full-suite counts, not additional tests. Its verdict name
filter excludes three unrelated SDK tests; the full SDK suite passes all 57.
The new fuzz test brings offline coverage to ten fuzz tests, 1000 runs each.
Foundry emitted a nonfatal signature-cache permission warning; tests succeeded.
Browser RPC responses are mocked, not fresh live receipts. Browser tests use
temporary local services and remove those services afterward.

## Still Open

Complete-window chain observations and independent CLI source refetch;
stateless verification with explicitly resolved unsigned-epoch semantics;
MockBridge deployment/receipt/publication extension; full F-22 live runner and
three real runs. Fresh safe credentials, verified deployments, history cleanup,
remote CI, hosting, external integration and submission artifacts remain separate
gates. No ignored credential file, canonical deployment manifest or Git history
was changed. No transaction, push, hosting or external message was performed.
