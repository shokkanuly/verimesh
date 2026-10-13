# Vercel Hosting Runbook

October 13, 2026: **public testnet demo deployed and tested**. All six CI jobs
pass in the [clean public repository](https://github.com/shokkanuly/verimesh/actions/runs/38258872422).
The human explicitly authorized publication of the clean repository and Horkos
website. [Public demo](https://horkos-murex.vercel.app),
[LIVE reader](https://horkos-murex.vercel.app/dashboard?mode=live).
The primary production domain is anonymously accessible. Standard Protection
remains enabled for previews and generated deployment URLs; no keys were imported.

## Import Settings

Deploy only the clean release after its secrets and CI gates pass. It is now
public with human approval. Never import the private scan-failing legacy history.
Keep preview/generated-URL protection; public access is through the promoted
primary domain, not an authentication bypass link.

| Setting | Value |
|---|---|
| Root Directory | Repository root, not `apps/dashboard` |
| Repository / Branch | `shokkanuly/verimesh` / `codex/release` (default) |
| Target | Human-approved public testnet demo on the primary production domain; previews remain protected |
| Framework | Vite |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Output | `apps/dashboard/dist` |
| Node | 22.x (actual hosted build) |
| Frontend API | Default same-origin `/api`; do not set `VITE_EVIDENCE_API_URL` |

Committed [vercel.json](../vercel.json) serves static assets and rewrites
`/dashboard` to the SPA. `/api/*` routes to the read-only
[Node adapter](../api/evidence.mjs), which reuses the existing evidence server.
It preloads five RECORDED fixtures and five LIVE accepted-verdict bundles.
The function includes the original scorer/config files for exact model hashing.
No signing, wallet, private RPC or ingestion credential is needed.

Vercel provides `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL`; these exact
HTTPS origins are allowed. For a custom domain, set `CORS_ORIGINS` to that exact
HTTPS origin (comma-separated for multiple known domains, no wildcard).
No secret environment variables should be imported. `.vercelignore` excludes
operator `.env` files, PEM/key files, broadcast artifacts and pending journals.

This configuration uses documented [Node handlers](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration),
[function includeFiles and rewrites](https://vercel.com/docs/project-configuration/vercel-json).
The actual Vercel build, deployment and HTTPS/API checks pass. Keep
preview/generated-URL Vercel Authentication enabled and do not
import operator secrets. Review provider costs before any paid upgrade.

## Verified Deployment

- Project: `aibekshokan-6139/horkos`, ID `prj_c8TNwZCH56ONyTmgIAtzvv1cRtL9`.
- Public deployment: `dpl_Df2L3DLHHUs63LJAQXxcW4g9ioRp`, target production,
  reviewed application commit `0270e45d3ba4f18d8143ff34344b4029e7eb21fb`.
  Later commits update documentation only; they do not change the tested application.
- Vercel Authentication uses Standard Protection. Automatic production-domain
  assignment is disabled. The owner explicitly promoted the ready deployment;
  the primary public domain now returns 200 without authentication.
- Hosted API: read-only, ten bundles, zero rejected files; upload 405,
  unknown origin 403, valid oversized JSON 413, signature/scorer verification 200.
- Actual browser RPC: five accepted verdicts, three guardian actions, exact
  Registry and Guardian receipt links, PASS then altered-feature MISMATCH then restored PASS.
- Desktop 1440 x 900 and mobile 390 x 844: nonblank moving canvas, assets loaded,
  no horizontal overflow or uncaught browser errors; dashboard deep-link refresh works.
  All three approved public-testnet-demo status labels, visible scroll reveals,
  FAQ toggles and mobile navigation/Escape also pass.
  Anonymous public acceptance completed October 13 at 13:36 GMT+5, with zero broadcasts.

Use the verified public primary domain above. Generated branch aliases are not
the tested application origin. Do not share authentication tokens or bypass links.
The first Git API request was classified as production, but remained protected
and unpromoted. The API `staging` attempt rejected development test authentication.
An explicit CLI `--target preview` deployment resolved the environment mismatch.
The approved production source later built successfully through the owner CLI
and was explicitly promoted. Earlier Git-triggered attempts remained BLOCKED;
no blocked build was promoted and no paid feature was enabled.

## Acceptance Before Sharing

1. Record the actual public deployment URL in `SUBMISSION.md`. Test home,
   `/dashboard`, refresh/deep links, images and the moving 3D scene.
2. `/api/health` must report read-only, ten bundles and zero rejected files.
   `/api/bundles` must contain the five LIVE IDs in `evidence/live/replay.json`.
3. `/dashboard` says RECORDED. `/dashboard?mode=live` must query Monad RPC and
   show five accepted verdicts, three actions and their real explorer links.
   Inputs remain SYNTHETIC. Disconnecting RPC must not substitute fixtures.
4. Select LIVE evidence, Verify: PASS / OFFLINE. Alter a feature: MISMATCH.
   Restore: PASS. This proves signature/scorer consistency, not feature truth.
5. `POST /api/bundle` returns 405. `/api/verify` verifies without storing.
   Unknown origins return 403. Check mobile, console, cold starts and API errors.
6. Test the public primary link in a signed-out browser/device. It must show
   the product without Vercel login; preview/generated URLs remain protected.

The function has no disk writes or durable ingestion. Its existing request and
body limits apply per warm instance/direct socket IP, not globally across
serverless instances. No production availability or global rate-limit claim.

## Optional Alternative

The earlier keys-free `render.yaml` remains as a two-service alternative, not a
deployment. If used, set API `CORS_ORIGINS` and frontend `VITE_EVIDENCE_API_URL`
to their actual origins. Vercel is the selected route for this handoff.
