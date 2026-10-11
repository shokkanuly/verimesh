// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {DeploymentManifest} from "./DeploymentManifest.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {IERC8004Identity} from "../src/interfaces/IERC8004Identity.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";

abstract contract DeploymentScript is Script {
    function _deploy(uint256 deployerPrivateKey, uint256 agentId, string memory manifest)
        internal returns (VerdictRegistry registry, TripwireGuardianV2 tripwire, SimpleGate gate)
    {
        require(block.chainid == vm.parseJsonUint(manifest, ".chainId"), "Deployment chain differs from manifest");
        require(!vm.keyExistsJson(manifest, ".contracts.VerdictRegistry"), "Manifest already contains a deployment; rerun refused");
        address erc8004Address = DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity");
        require(erc8004Address.code.length > 0, "Identity registry has no code");

        vm.startBroadcast(deployerPrivateKey);

        registry = new VerdictRegistry(IERC8004Identity(erc8004Address));
        bytes32 tripwirePolicy = keccak256("TRIPWIRE_CIRCUIT_BREAKER_POLICY");
        tripwire = new TripwireGuardianV2(registry, tripwirePolicy);

        bytes32 gatePolicy = keccak256("SIMPLE_GATE_POLICY");
        gate = new SimpleGate(registry, agentId, gatePolicy, 8000, 300);

        vm.stopBroadcast();

        // Foundry runs this during simulation too. Publish only after receipt verification.
        console2.log("=== Deployment candidates (manifest unchanged) ===");
        console2.log("VerdictRegistry:", address(registry));
        console2.log("TripwireGuardianV2:", address(tripwire));
        console2.log("SimpleGate:", address(gate));
    }
}

contract DeployScript is DeploymentScript {
    function run() external returns (VerdictRegistry registry, TripwireGuardianV2 tripwire, SimpleGate gate) {
        DeploymentManifest.requireRootEnvironment(vm);
        return _deploy(vm.envUint("DEPLOYER_PRIVATE_KEY"), vm.envUint("SENTINEL_AGENT_ID"), DeploymentManifest.read(vm));
    }
}
