# F-31 Verified Evidence API

Date: October 8, 2026. Local implementation; not a hosted deployment.

The API rejects uploads unless the closed public schema, normalized input,
EIP-712 digest, low-s P256 signature, supported source/config model hash and
recomputed integer score all verify. Unknown fields are rejected rather than
persisted. This is **offline evidence verification**: it does not prove identity
ownership, key binding, current validity, the truth of synthetic features, or
testnet acceptance. Historical/expired evidence can still verify offline.

`POST /bundle` stores verified evidence; `POST /verify` verifies without storage.
Tampered evidence returns HTTP 422 with a bounded public mismatch report.
The standalone server defaults to read-only storage, listens on loopback, and
does not load a signing key or dotenv file. Explicit `EVIDENCE_READ_ONLY=false`
enables writes for a controlled local ingest process, not authenticated hosting.

Disk storage verifies again on restart, skips invalid/oversized/nonregular or
symlinked files, uses strict digest filenames and atomic no-overwrite linking,
and returns copies to prevent caller mutation. Capacity is bounded at 512
bundles by default. `GET /health` reports mode, verified bundle count, rejected
file count and the offline verification scope. Default body size is 64 KiB,
request rate 120/minute per socket address, and CORS allows only explicit
origins. Forwarding headers are not trusted for rate limiting. Public hosting
should additionally use proxy-level limits and a dedicated persistent volume.

## Executed Checks

- `pnpm build`: passed, existing dashboard chunk warning remains.
- `pnpm test`: 78 Node + 86 TypeScript tests passed; no test skips.
- `cd contracts && MONAD_RPC_URL= forge test --gas-snapshot-check true`:
  117 passed, zero failed, six explicit offline fork skips.
- Twenty new API tests cover all signature/domain/model/input/score/key tamper
  paths, unknown schema fields, read-only verification, disk restart, normal
  and chunked body limits, content type/JSON/path validation, CORS, forwarding
  header spoofing, bad/symlinked/oversized disk files, verified preload,
  bounded storage, defensive copies and exact retry persistence.

Hosted API, production traffic and remote persistence have not been tested.
