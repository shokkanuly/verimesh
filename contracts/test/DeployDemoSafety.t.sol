// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployDemoScript} from "../script/DeployDemo.s.sol";
import {DeploymentManifest} from "../script/DeploymentManifest.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {MockBridge} from "../src/examples/MockBridge.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

contract DeployDemoHarness is DeployDemoScript {
    function runWithCredentials(uint256 key, string memory manifest)
        external
        returns (VerdictRegistry registry, TripwireGuardianV2 guardian, SimpleGate gate, MockBridge bridge)
    {
        return _run(key, 7, manifest);
    }
}

contract DeployDemoSafetyTest is Test {
    function test_DemoSimulationCreatesFourLinkedCandidatesWithoutPublishingOrSeeding() public {
        string memory before = vm.readFile("../deployments/monad-testnet.json");
        vm.chainId(vm.parseJsonUint(before, ".chainId"));
        vm.etch(DeploymentManifest.addressOf(vm, before, "ERC8004Identity"), address(new MockIdentity()).code);
        uint256 key = (vm.randomUint() >> 1) + 1;
        address deployer = vm.addr(key);
        uint64 nonce = vm.getNonce(deployer);
        DeployDemoHarness script = new DeployDemoHarness();
        (VerdictRegistry registry, TripwireGuardianV2 guardian, SimpleGate gate, MockBridge bridge) =
            script.runWithCredentials(key, before);
        assertEq(vm.getNonce(deployer), nonce + 4);
        assertGt(address(registry).code.length, 0);
        assertGt(address(guardian).code.length, 0);
        assertGt(address(gate).code.length, 0);
        assertGt(address(bridge).code.length, 0);
        assertEq(address(guardian.horkos()), address(registry));
        assertEq(address(bridge.guardian()), address(guardian));
        assertEq(guardian.owner(), deployer);
        assertEq(bridge.owner(), deployer);
        assertEq(guardian.bridge(), address(0));
        assertFalse(guardian.trustedAgents(7));
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
        assertEq(keccak256(bytes(vm.readFile("../deployments/monad-testnet.json"))), keccak256(bytes(before)));
    }

    function test_WrongChainFailsBeforeAnyCreation() public {
        vm.chainId(1);
        uint256 key = (vm.randomUint() >> 1) + 1;
        DeployDemoHarness script = new DeployDemoHarness();
        uint64 nonce = vm.getNonce(vm.addr(key));
        vm.expectRevert("Deployment chain differs from manifest");
        script.runWithCredentials(key, '{"chainId":10143}');
        assertEq(vm.getNonce(vm.addr(key)), nonce);
    }

    function test_MissingIdentityCodeFailsBeforeAnyCreation() public {
        vm.chainId(10143);
        uint256 key = (vm.randomUint() >> 1) + 1;
        DeployDemoHarness script = new DeployDemoHarness();
        uint64 nonce = vm.getNonce(vm.addr(key));
        string memory manifest =
            string.concat('{"chainId":10143,"contracts":{"ERC8004Identity":"', vm.toString(address(0x1234)), '"}}');
        vm.expectRevert("Identity registry has no code");
        script.runWithCredentials(key, manifest);
        assertEq(vm.getNonce(vm.addr(key)), nonce);
    }
}
