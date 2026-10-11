# F-21 Five-Incident Replay

Date: October 8, 2026. All incidents are synthetic, not observed bridge attacks
or adopter activity. No testnet transaction was broadcast.

The active `tripwire-rules@2.0.0` model uses bounded integer contributions and
clamps their sum at 10,000. It is a reference rule set, not a calibrated fraud
probability. The source and configuration are hashed together. The unchanged
v1 source/config and verifier remain available for historical evidence; replay
and fresh deployment checks explicitly use the active v2 model.

| Incident | Computed Score | Guardian Action |
|---|---:|---|
| benign | 550 | None |
| near-miss | 6200 | None |
| throttle | 7300 | Throttle |
| delay | 8900 | Delay |
| freeze | 9900 | Freeze |

These scores are computed from fixture features, not supplied as score
overrides. Contract boundary regressions separately cover 6499/6500,
8499/8500 and 9499/9500. Below-threshold replay submissions require a matching
acceptance receipt but deliberately do not invoke `applyVerdict`.

## Executed Checks

- `pnpm build`: passed, existing dashboard chunk-size warning only.
- `pnpm test`: 78 Node and 66 TypeScript tests passed, zero skips.
- `cd contracts && MONAD_RPC_URL= forge test --gas-snapshot-check true`:
  117 passed, zero failed, six explicit offline fork skips.
- `pnpm replay`: produced and verified five bundles.
- Repeated replay produced byte-identical files for all five incidents.
- `pnpm verify-bundle evidence/replay/bundle-<incident>.json`: exit 0 for each
  of benign, near-miss, throttle, delay and freeze.

New tests cover model-version separation, deterministic output, monotonic
integer scoring/clamping, invalid basis points, unsupported models, feature
tampering and receipt-confirmed below-threshold submissions without actions.
Existing v1 scorer and CLI tests still pass.

Live replay still requires fresh credentials, active bound keys and explicit
allowlisting of the **v2** model hash. Do not silently replace the model
allowlist of a historical deployment. F-22's bridge releases, resets and three
consecutive live runs are not claimed by this offline evidence.
