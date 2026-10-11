# STALE: Retired-Domain Evidence

These raw bundles, replay summaries, local rehearsal receipts and read-only
testnet proof were recorded before RB-3. They are preserved byte-for-byte for
audit, not used by the dashboard, evidence API, current replay or acceptance
checks. Their signatures/digests are not Horkos-domain evidence.

The legacy `bundle-latest.json` additionally contains the approved placeholder
model-hash exception. Its new active replacement is regenerated with the real
v1 scorer hash and a mock registry domain. Neither record proves live acceptance.

The old testnet proof includes historical deployment code hashes. It cannot be
relabelled as proof of a new deployment, which has not happened. Fresh native
P256 verification is recorded separately by the fork runner.

See `../../rebrand/RB-3-archive.json` for source/destination paths and verified
SHA-256 checksums. The 66 ignored old replay, store, sandbox and rehearsal bundles
remain in ignored `evidence/archive-local/pre-horkos-replay/`, together with their
original associated records. Do not expose this archive through the evidence API.
