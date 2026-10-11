# F-30 Explicit Live And Recorded Dashboard

Date: October 8, 2026. Local dashboard, not a hosted/live deployment proof.

The timeline's LIVE mode reads `VerdictAccepted` and `ActionApplied` from the
manifest addresses using shared SDK ABIs, polls a recent 2,001-block range,
deduplicates by verdict ID and correlates guardian actions by that ID. The
snapshot checks chain ID and head canonicality. Scanned-range counts and
guardian state come from the RPC, not static statistics. A disconnected feed
clears stale rows and shows an error rather than switching silently to fixtures.
No event in the recent range is not proof of no historical activity.

RECORDED mode contains five committed, deterministic, explicitly synthetic
offline bundles. No transaction/action is claimed for those rows. Selecting any
row loads that exact bundle into the verifier; live selections use the read-only
evidence API and never substitute another bundle when evidence is missing.
Verification calls the full API schema/input/model/score/digest/signature checks.
Failure/unknown is not PASS, and stale verification responses cannot overwrite
a newly selected bundle. The dashboard contains no signer/wallet keys.

Removed the seeded "live" feed, default freeze/verified counts, obsolete
duplicated contract ABIs, unsubstantiated gas savings, fake GitHub repository
link and simulated execution view. Historical deployment provenance is visibly
pending. The integration sketch is labeled first-party, not external adoption.

## Executed Checks

- `pnpm build`: passed; main bundle reduced from about 587 to 525 kB. The
  existing 500 kB warning remains and is not a build failure.
- `pnpm test`: 80 Node + 89 TypeScript tests pass, zero skips.
- Offline Forge/scoped gas: 117 pass, six explicit offline fork skips.
- `pnpm check:addresses`: passed.
- `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/verimesh-playwright-browsers pnpm check:dashboard`:
  passed with pinned Playwright 1.62.1 and temporary local services.
- Browser checks: recorded selection, full API verification, feature tamper,
  malformed JSON, restore, API offline; **mocked** RPC acceptance/action
  correlation, exact selected live bundle, empty range and disconnection;
  1440px desktop/390px mobile, no horizontal page overflow or browser runtime
  errors. Four screenshots generated in ignored `evidence/replay/screens/`
  were inspected. Mocked RPC tests are synthetic, not fresh Monad receipts.

Local development: dashboard `http://127.0.0.1:5173`, read-only API port 3001.
Vite proxies `/api` to that API. Static hosting needs `VITE_EVIDENCE_API_URL`
pointed to an HTTPS read-only service with an explicit CORS origin.

Fresh-deployment live acceptance, chain-derived feature observation and hosting
remain separate open tasks. The current historical manifest warning stays.
