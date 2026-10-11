// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {IERC8004Identity} from "../src/interfaces/IERC8004Identity.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {MockBridge} from "../src/examples/MockBridge.sol";
import {DeploymentManifest} from "./DeploymentManifest.sol";

contract DeployDemoScript is Script {
    function run()
        external
        returns (VerdictRegistry registry, TripwireGuardianV2 tripwire, SimpleGate gate, MockBridge bridge)
    {
        DeploymentManifest.requireRootEnvironment(vm);
        return _run(
            vm.envUint("DEPLOYER_PRIVATE_KEY"),
            vm.envUint("SENTINEL_AGENT_ID"),
            DeploymentManifest.read(vm)
        );
    }

    function _run(uint256 deployerPrivateKey, uint256 agentId, string memory manifest)
        internal
        returns (VerdictRegistry registry, TripwireGuardianV2 tripwire, SimpleGate gate, MockBridge bridge)
    {
        require(block.chainid == vm.parseJsonUint(manifest, ".chainId"), "Deployment chain differs from manifest");
        address identity = DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity");
        require(identity.code.length > 0, "Identity registry has no code");

        vm.startBroadcast(deployerPrivateKey);
        registry = new VerdictRegistry(IERC8004Identity(identity));
        tripwire = new TripwireGuardianV2(registry, keccak256("TRIPWIRE_CIRCUIT_BREAKER_POLICY"));
        gate = new SimpleGate(registry, agentId, keccak256("SIMPLE_GATE_POLICY"), 8000, 300);
        bridge = new MockBridge(tripwire);
        vm.stopBroadcast();

        console2.log("=== Demo deployment candidates (manifest unchanged, seed pending) ===");
        console2.log("VerdictRegistry:", address(registry));
        console2.log("TripwireGuardianV2:", address(tripwire));
        console2.log("SimpleGate:", address(gate));
        console2.log("MockBridge:", address(bridge));
    }
}
