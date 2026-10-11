# F-60 Documentation Reconciliation

October 8, 2026. Current docs were reconciled against source and the individual
task evidence. Original roadmap history remains in Git and the dated status
sections; current docs no longer present proposed APIs as completed features.

| Changed document | Correction |
|---|---|
| README | Tested no-wallet quickstart, actual UI/API modes, runnable integration, canonical historical manifest, scoped gas and explicit release gaps |
| 01-architecture | Current source boundaries; 6500/8500/9500 tiers, rolling accounting, bounded escalation/reset, evidence limitations |
| 02-core-spec | Exact unchanged v1 encoding, actual stored fields, inputHash/nonce omission, current registry checks and unsigned-epoch caveat |
| 03-coding-map | Implemented modules/test ownership rather than NEW/REUSE plans; remaining engineering listed explicitly |
| 04-threat-model | API verification/limits, explicit recorded/live data, unresolved history exposure, mock bridge limits, action semantics, same-key rebind/NFT transfer risks |
| SECURITY | Removed stale seeded-UI/unhardened-API/future-bridge statements; preserved release blockers and design caveats |
| 06-project-status | All seven phases remain partial/in progress where mandatory external/live/security gates are unmet; current test counts separated from historical tranches |
| 07-rubric-hardening-plan | Marked original work-order table historical and linked current implementation board |

No clean-history, external-adoption, hosted-product, stateless, chain-derived
features or completed-live-release claim is made. The API/scorer passing tests
do not establish feature truth or a professional security audit.

The final committed-checkout results and actual remaining deliverables are
reported separately in `FINAL-REPORT.md`; no CI URL or transaction was invented.
