# Integrator Guide

This guide runs locally without a wallet, account, remote RPC or secret file.
It is not an external-adoption claim or a measured ten-minute promise.
Prerequisites: Node 22+, pnpm 9+, Foundry 1.8.4, and this reviewed checkout with
vendored Solidity dependencies. No separately published npm package is claimed.

## Execute the Reference Integration

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
node apps/integrator-demo/demo.mjs
node examples/ts-sentinel/demo.mjs
```

The first script compiles [GuardedAction](../contracts/src/examples/GuardedAction.sol)
and runs [the guide tests](../contracts/test/IntegrationGuide.t.sol) with an
ephemeral local identity, P256 key and fallback verifier. It submits a real
signed verdict into the local registry, gates an action, and rejects reuse,
wrong agent/policy/model/payload/caller, stale/expired/revoked evidence and
cross-contract replay. The second script verifies a real signed synthetic
Tripwire bundle using the TypeScript test kit. These are different input schemas.

## Solidity Integration Contract

The checked-in reference contract is the complete executable example. Pin the
registry, agent, policy, model and authorized caller in construction. Its action
input commitment is:

```solidity
keccak256(abi.encode(address(this), block.chainid, authorizedCaller, payload))
```

`execute(verdict, payload)` first checks the caller, derives the accepted ID from
the complete verdict using the registry's domain, then calls `_consume` with fixed
agent/policy, minimum score 8000 and maximum observation age 300 seconds. It
checks the hash-bound model/input commitment before performing the action. The
registry does not store inputHash/nonce; supplying the full preimage and matching
its already-accepted digest is essential. A later
revert rolls back consumption atomically. The reference action increments a
counter and emits an event; it is not a vault or asset transfer implementation.

`SimpleGate.sol` remains a minimal teaching consumer. It fixes agent/policy but
does not bind a caller, model or action payload. Do not copy it as asset custody
authorization without those application-specific checks.

## TypeScript Fixtures

```ts
import { createMockSentinel } from '@horkos/testing';
const sentinel = createMockSentinel();
const { bundle } = await sentinel.verdictFor({ incident: 'freeze', nonce: 42n });
```

Use the runnable [TypeScript-package example](../examples/ts-sentinel/demo.mjs)
as the source of truth for the actual return shape and verification API. The
test kit never reads an operator key or accesses the network. Its random public
key is not an identity binding. Synthetic fixtures are never traction.

## Ten-Line Solidity Teaching Consumer

This excerpt mirrors the deployed SimpleGate pattern. It is a generic
minimum-score teaching example, not Tripwire risk authorization or asset custody.
For action/model/caller binding, use the full GuardedAction reference above.

```solidity
import {HorkosConsumer} from "../HorkosConsumer.sol";
import {IHorkos} from "../interfaces/IHorkos.sol";
contract MachineGate is HorkosConsumer {
    uint256 public immutable agent;
    bytes32 public immutable policy;
    constructor(IHorkos registry, uint256 a, bytes32 p) HorkosConsumer(registry) { agent = a; policy = p; }
    function execute(bytes32 id) external {
        _consume(id, agent, policy, 8000, 300);
    }
}
```

## Ten-Line TypeScript Live Reader

Run `node integrations/read-live.mjs` after `pnpm build`. This checks chain ID
and reads the real bound public key; no wallet, secret or transaction is used.

```ts
import { readFileSync } from 'node:fs';
import { getDeploymentAddresses, VERDICT_REGISTRY_ABI } from '../packages/sdk/dist/index.js';
import { createPublicClient, http } from 'viem';
const deployment = JSON.parse(readFileSync(new URL('../deployments/monad-testnet.json', import.meta.url), 'utf8'));
const addresses = getDeploymentAddresses(deployment);
const rpc = createPublicClient({ transport: http(deployment.rpcUrl) });
if (await rpc.getChainId() !== deployment.chainId) throw new Error('Wrong chain');
const key = await rpc.readContract({ address: addresses.VerdictRegistry, abi: VERDICT_REGISTRY_ABI, functionName: 'currentKey', args: [BigInt(deployment.agent.agentId)] });
console.log({ agentId: deployment.agent.agentId, epoch: key[2], active: key[3] });
console.log(addresses);
```

## Deployed Testnet Addresses

Read addresses at runtime from
[`deployments/monad-testnet.json`](../deployments/monad-testnet.json) using the SDK
manifest reader; do not copy address literals into source. It now contains the
four source-verified deployments, agent 2185 and epoch 1. Address/explorer table:
[JUDGES.md](../JUDGES.md#live-contracts). Creation and configuration receipts are
in [deployment.json](../evidence/live/deployment.json); source verification is in
[source-verification.json](../evidence/live/source-verification.json).

Before integrating: run `pnpm verify:deployment` and `pnpm run doctor`, and confirm identity ownership,
active key epoch and application-selected trust rules independently. Submit via
the SDK receipt-confirmed path, then call your consumer separately. No stateless
one-transaction path is implemented.

The signer attests to commitments, not feature truth or correct AI inference.
Tripwire risk scores are not generic approval scores: higher risk restricts
transfers; the example's generic minimum-score policy must be replaced with your
own domain semantics. Never blindly turn a high risk verdict into permission.

## Acceptance Record

The guide's commands and negative cases were executed locally; see
[`evidence/phase5-integration.md`](../evidence/phase5-integration.md).
This was first-party acceptance, not an independent engineer study. HUMAN:
record the first external engineer's commit/PR or actual feedback before claiming
external integration or timing.
