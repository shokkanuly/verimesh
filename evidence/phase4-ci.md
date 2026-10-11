# F-41 Local CI Gates

Verified October 8, 2026. Remote CI URL: **HUMAN: create the private repository
and push the reviewed source**. No published green run is claimed.

- Build passes; 80 Node + 89 TypeScript + 117 offline Solidity tests pass.
  Six native fork cases intentionally skip without explicit RPC configuration.
- `pnpm lint` now performs first-party script syntax and five TypeScript project
  checks. The SDK no longer hides a failed/missing linter with `|| true`.
  This is static checking, not a formatter or an ESLint rule-set claim.
- CI contains contract tests, scoped gas, digest parity, address consistency,
  exact quickstart/sandbox, desktop/mobile browser checks and full-history
  secrets scanning. Browser artifacts are synthetic test screens only.
- Gitleaks is pinned to 8.30.1, with its release checksum verified before use.
  The upstream Linux x64 archive/checksum names were checked directly.
- `pnpm check:secrets` outputs only file, commit and rule type. Exit 1 is
  intentional: **18 historical candidates remain**, including known exposed
  wallet assignments. They must be classified/cleaned, not waived to make CI green.
  Twelve public-coordinate false positives (ten new recorded fields and two
  historical fields) are excluded by an anchored public JSON-field rule.
  Regressions prove adjacent/private-key assignments remain detectable.
- Scanner hygiene checks pass: 11 ignored sensitive paths, three includable
  example files, multiline/private-key detection, redaction, exception isolation
  and blank credential placeholders.
- A manual read-only deployment workflow checks verified deployment provenance
  and explicit-block native fork tests. It hosts no signing/deployer credentials
  and intentionally cannot pass the current legacy manifest.

The source-history gate and live deployment gate remain **PARTIAL**. Do not
disable them, expose the old history, or manufacture a CI badge.
