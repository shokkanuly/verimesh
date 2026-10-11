# Security and Trust Assumptions

Horkos v1 trusts **one P256 signer per agent**. It is an auditable signed
attestation registry, not trustless AI, zkML, a proof of correct inference or a
WebAuthn implementation. Production use has not been established.

## Current Release Blockers

- Previously exposed wallet credentials remain in Git history. Removing a
  default or ignoring `.env` does not undo an exposure. Rotate credentials and
  transfer agent ownership or register a fresh identity before new live work.
- The configured sentinel was a public signing fixture, not a secret signer.
  The operator has created a new local P256 PEM file, but fresh live binding,
  credential configuration and funding have not been proven.
- The manifest describes historical contracts, not this hardened source.
  `pnpm verify:deployment` and `pnpm run doctor` reject that incomplete provenance.
- The dashboard has explicit synthetic RECORDED and chain-event LIVE modes;
  neither browser mocks nor historical events establish fresh live readiness.
  The evidence API now verifies a closed public schema before insertion, with
  body/capacity/rate/CORS limits and read-only default. Public hosting is pending;
  proxy limits, availability and feature truth remain separate concerns.
- No approved history cleanup or fresh public snapshot has been performed.
  Do not make the existing history public. See the
  [classified exposure audit](evidence/phase0-security.md) and
  [current phase gates](docs/06-project-status.md).

## What Verification Establishes

`submit` checks a signature against the currently active agent key, stores its
key epoch and emits the verdict. `isValid` checks the stored verdict's agent,
policy, score, expiry, observation age and current active key epoch. A consumer
uses `_consume` to prevent reuse **in that consumer**. Reuse across independent
consumers is not globally forbidden.

The signer commits to input and model hashes. Those commitments do not prove
that the supplied inputs were true or that an AI model executed. The current
Tripwire CLI re-executes the local integer scorer over supplied evidence. It
does not yet independently derive those inputs from bridge logs.

The current path is `submit`, then consumer action, normally two transactions.
`verifyVerdict` and `_consumeSigned` are planned, not implemented. The eight-field
v1 verdict does not sign an epoch. A future stateless path must not claim
signed-epoch invalidation merely because it reads the current epoch: revoking
and later reusing the same key can make an old unexpired signature valid again.
Resolve this explicitly before shipping that path without changing the v1
digest silently. This caveat also applies to previously unsubmitted signatures
in the stateful path after same-key rebinding; accepted stored verdicts do retain
their old epoch and become invalid. Transferring the identity NFT does not
automatically revoke a bound key; coordinate explicit rotation/revocation.

## Keys

- Use a fresh testnet-only EVM wallet for deployment/relaying. Agent-owner and
  guardian authority use EVM keys. The owner can revoke a compromised signer.
- Generate a separate P256/secp256r1 key using a cryptographic random generator.
  Do not derive it from a wallet seed. The current policy is **one random key
  per agent**; no multi-agent HKDF scheme is implemented.
- Keep private values only in ignored local secret files or an OS keystore.
  The local environment uses raw hex scalar `SENTINEL_P256_PRIVATE_KEY`; a PEM
  key file is not automatically imported into that value.
- Use mode `600` for local key/environment files. Never put secrets in chat,
  screenshots, command arguments, logs, evidence, Git or browser/dashboard code.
- `.env`, `.env.*` except `.env.example`, `*.key`, keystores and Foundry
  broadcast artifacts are ignored. Example private-key fields stay blank.
- Use testnet funds only. Secret scanners and a clean approved history are
  mandatory before publication; scanner regression tests are not a clean-history
  certificate.

## Planned Extensions, Not Current Guarantees

Quorum verification, challenges/bonds and cryptographic scorer proofs are future
designs. Distinct agent identities alone do not prove independent operators.
Schema extensions require a new EIP-712 domain version and new parity vectors.
WebAuthn human-guardian authorization is undecided and gated after Phases 1 and
2; raw P256 signing is not a passkey assertion.

Tripwire is a first-party reference consumer, not external adoption. The tested
MockBridge is an owner-operated native-value demonstration adapter, not a real
bridge integration. Its atomic hook and rollback tests do not establish
cross-chain proof validity or production custody safety. Synthetic
traffic and replay incidents must never count as organic traction.

The generic GuardedAction integration pins agent/policy/model/caller and binds
the complete accepted verdict preimage to its action. SimpleGate is only a
minimal teaching example. Tripwire's high risk score must not be treated as
generic permission to spend. See [the guide](integrations/GUIDE.md).
