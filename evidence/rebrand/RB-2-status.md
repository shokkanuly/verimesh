# REBRAND REPORT - RB-2 In Progress

Status: **PARTIAL - user-requested checkpoint; verification failures remain**.
Branch: `rebrand/horkos`. Base: RB-1 commit
`678bf8dc7de4bc20741bb3d85713998b65b7c4a1`.

## Applied Changes

- Six inventoried paths moved with `git mv`; 86 inventoried first-party text files mechanically rewritten using the exact case-aware map.
- Package names/imports/CLI binary and ABI getter callers now use Horkos naming. pnpm script names, CLI subcommands, unrelated project names and decision logic are unchanged.
- `pnpm install` regenerated the lockfile; its diff contains only workspace dependency-name replacements/order, with no dependency-version changes.
- Four EIP-712 domain literals remain unchanged intentionally until RB-3; existing signed vectors have not been regenerated.
- The renamed DOCX has identical binary contents; its text replacement remains assigned to RB-5.
- Production scorer inputs, active deployment manifest, raw historical evidence, baseline inventory and supplied logos have not been altered.
- The user explicitly requested a checkpoint commit after the failed checks. This records the current rename work, not completed RB-2 acceptance.
- No remote modification, push, deployment, key rotation or signing-artifact regeneration occurred.

The mechanical script is `scripts/rename-check.mjs`. It validates inventoried
source bytes, match counts, production model inputs and protected-file hashes
before performing any move/write. This is a bulk mechanical rewrite, not a
global replacement over secrets, vendored code or generated evidence.

The test-only `MODEL_HASH` in the inventoried consumer fixture also follows its
renamed label. This is not either production scorer hash:

```text
keccak256("verimesh-test-model"):
0xcee4785c9bc5b98cc4609d2cd4a6b2a6dd2d6f9f6ddeed3d25b59f59f026cbb8
keccak256("horkos-test-model"):
0x51f4f5622927a020cd8902d4ed9e616aaf842ce4a546b6637d7d9a93c8c1bf95
```

## Actual Verification

| Command | Result |
|---|---|
| `pnpm install` | PASS, pnpm 12.9.1; lockfile policy check passes |
| `pnpm install --frozen-lockfile` | PASS in the existing workspace; fresh-checkout acceptance not yet run |
| `pnpm build` | PASS; dashboard 2,357 modules |
| `forge build` in `contracts/` | PASS; Solc 0.8.24 compiled 59 files; nonfatal lint warnings retained |
| `pnpm lint` | PASS; JavaScript syntax and all five TypeScript projects |
| `pnpm test` | FAIL: Node tests 262 passed, 1 failed, 0 skipped; Vitest stage did not run because the Node command failed |
| `env MONAD_RPC_URL= forge test --gas-snapshot-check true` | FAIL: measured gas differs from the committed snapshot; no complete-suite acceptance claimed |

Checkpoint secret audit: 87 staged text files scanned, with one finding for the
documented public offline fixture in `packages/sentinel/src/replay.ts`, lines
86-87. The complete file is byte-identical to HEAD apart from the npm import
scope, and live mode still requires an operator-provided key. Its value was not
printed. There are zero new credential findings. The zero-context staged diff
scan reports zero findings. Three binary renames preserve the original bytes;
history and ignored credentials are outside this scan. No scanner rules were
weakened. This is a classified scoped audit, not a clean-history certificate.

## Stop Causes And Proposed Repair

1. The unchanged address guard rejects four historical address literals in
   `docs/rebrand/RB-1-plan.md`, lines 239-242. This is a report-placement mistake,
   not a newly duplicated application configuration. RB-1 checks were run before
   that final report was added, so they did not establish acceptance of the
   eventual complete RB-1 tree. Proposed repair: move the byte-preserved report
   into `evidence/rebrand/`, the existing historical-evidence location, and leave
   the guard and its regression tests unchanged. No new address exemption.
2. The gas snapshot checker reports
   `[EthereumLocalFallback] applyVerdict_delay: 99856 -> 99791`. RB-2 changed the
   public getter selector while holding the EIP-712 domain/vector data constant;
   compiled dispatch can change measured gas. Proposed repair after approval:
   verify the name-only source diff, regenerate the actual measurements and
   retain strict checking. Do not relax tolerances or disable the snapshot gate.

The legacy bundle failure already approved in RB-1 remains unchanged and is
not used to waive either new failure. RB-3 onward has not started. No safety
guard was modified to get a passing result.

Approval requested for further repair: move the frozen historical report and
refresh only verified name-derived gas measurements, preserving all verification
rules. The checkpoint request does not authorize either repair or waive the
failed checks. RB-3 through RB-6 remain outstanding.

## Remaining After This Checkpoint

1. Finish RB-2 acceptance: repair the report placement, confirm/regenerate the
   measured gas snapshot and run the fresh-checkout frozen install/build gates.
2. RB-3: switch the signing domain, regenerate shared vectors/signatures and all
   active bundles/ledgers, replace the approved legacy bundle and migrate old
   deployment/evidence records to explicit archives. Production scorer hashes
   remain unchanged; no fabricated new deployment addresses.
3. RB-4: integrate the supplied logo originals, favicon/PWA/social assets and
   palette, measure contrast and verify light/dark screenshots. Two original
   SVGs are still missing unless the user supplies them or revises the scope.
4. RB-5: finish the naming note/tagline/one-liner, structured DOCX text rename,
   metadata and submission-logo references; execute the documented quickstart.
5. RB-6: complete full tests, native fork/parity, all active bundle checks,
   sandbox/clean-checkout, address/secret/leftover checks and remote CI evidence.

The wider project is not release-complete either. The current project board
still lists complete-window chain-derived features/source refetch and stateless
verification as unimplemented. Safe operator configuration, fresh verified
deployment, real live verdict/enforcement receipts, three real runs, public
hosting/CI, approved history-safety work, external integration evidence,
recordings and actual submission remain separate release gates. This checkpoint
does not execute or approve those activities.
