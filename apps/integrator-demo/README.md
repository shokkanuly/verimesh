# First-Party Integration Demo

Run `node apps/integrator-demo/demo.mjs` from the repository root after installing
Foundry. This runs the complete signed local action-gating acceptance suite.
The contract lives in [the Foundry source tree](../../contracts/src/examples/GuardedAction.sol)
so the normal build and CI compile it without widening compiler file permissions.
See [the complete guide](../../integrations/GUIDE.md) for dependencies and limits.
