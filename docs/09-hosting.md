# Vercel Hosting Runbook

October 11, 2026: prepared and locally tested, **not deployed**. The human will
deploy to Vercel. No product deployment URL or hosted acceptance is claimed.

## Import Settings

Import only the clean private release snapshot after its secrets and CI gates
pass. Keep deployment protection enabled until the human explicitly approves
publication. Never import the old scan-failing history.

| Setting | Value |
|---|---|
| Root Directory | Repository root, not `apps/dashboard` |
| Framework | Vite |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Output | `apps/dashboard/dist` |
| Node | 22.x or 24.x |
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
The actual Vercel build, account limits, deployment and HTTPS checks remain
human-run. Review provider costs and protection settings before deploying.

## Acceptance Before Sharing

1. Record the actual protected deployment URL in `SUBMISSION.md`. Test home,
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
6. Test the protected link from another browser/device. Enable public access
   only after explicit human publication approval; no private key is a test login.

The function has no disk writes or durable ingestion. Its existing request and
body limits apply per warm instance/direct socket IP, not globally across
serverless instances. No production availability or global rate-limit claim.

## Optional Alternative

The earlier keys-free `render.yaml` remains as a two-service alternative, not a
deployment. If used, set API `CORS_ORIGINS` and frontend `VITE_EVIDENCE_API_URL`
to their actual origins. Vercel is the selected route for this handoff.
