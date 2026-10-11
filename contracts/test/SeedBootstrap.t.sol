// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SeedScript} from "../script/Seed.s.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";

contract BootstrapIdentity {
    uint256 public registrations;
    mapping(uint256 => address) public ownerOf;

    function register() external returns (uint256 agentId) {
        agentId = 41 + ++registrations;
        ownerOf[agentId] = msg.sender;
    }
}

contract BootstrapHarness is SeedScript {
    function bootstrapWithCredentials(uint256 key, string memory manifest)
        external returns (uint256, VerdictRegistry, TripwireGuardianV2, SimpleGate)
    {
        return _bootstrap(key, manifest);
    }
}

contract SeedBootstrapTest is Test {
    BootstrapIdentity private identity;
    BootstrapHarness private script;
    uint256 private ownerKey;
    bytes32 private constant KEY_X = keccak256("synthetic-public-x");
    bytes32 private constant KEY_Y = keccak256("synthetic-public-y");
    bytes32 private constant MODEL = keccak256("synthetic-model");

    function setUp() public {
        vm.chainId(10143);
        ownerKey = (vm.randomUint() >> 1) + 1;
        identity = new BootstrapIdentity();
        script = new BootstrapHarness();
        vm.setEnv("SENTINEL_KEY_X", vm.toString(KEY_X));
        vm.setEnv("SENTINEL_KEY_Y", vm.toString(KEY_Y));
        vm.setEnv("SCORER_MODEL_HASH", vm.toString(MODEL));
    }

    function _manifest() private view returns (string memory) {
        return string.concat('{"chainId":10143,"contracts":{"ERC8004Identity":"', vm.toString(address(identity)), '"}}');
    }

    function test_RegistrationReturnedIdIsUsedForDeploymentAndSeed() public {
        (uint256 id, VerdictRegistry registry, TripwireGuardianV2 guardian, SimpleGate gate) = script.bootstrapWithCredentials(ownerKey, _manifest());
        assertEq(id, 42);
        assertEq(identity.registrations(), 1);
        assertEq(identity.ownerOf(id), vm.addr(ownerKey));
        assertEq(gate.trustedAgentId(), id);
        assertTrue(guardian.trustedAgents(id));
        assertFalse(guardian.trustedAgents(1));
        assertTrue(guardian.trustedModels(MODEL));
        (bytes32 x, bytes32 y, uint32 epoch, bool active) = registry.currentKey(id);
        assertEq(x, KEY_X);
        assertEq(y, KEY_Y);
        assertEq(epoch, 1);
        assertTrue(active);
    }

    function test_RecordedRegistrationStopsBeforeAnotherMint() public {
        string memory manifest = string.concat('{"chainId":10143,"agent":{"agentId":"42"},"contracts":{"ERC8004Identity":"',
            vm.toString(address(identity)), '"}}');
        vm.expectRevert("Agent registration is already recorded");
        script.bootstrapWithCredentials(ownerKey, manifest);
        assertEq(identity.registrations(), 0);
    }

    function test_ExistingDeploymentStopsBeforeRegistration() public {
        string memory manifest = string.concat('{"chainId":10143,"contracts":{"VerdictRegistry":"', vm.toString(address(this)),
            '","ERC8004Identity":"', vm.toString(address(identity)), '"}}');
        vm.expectRevert("Bootstrap requires an undeployed registry");
        script.bootstrapWithCredentials(ownerKey, manifest);
        assertEq(identity.registrations(), 0);
    }

    function test_CombinedBootstrapRequiresDryRunContext() public {
        vm.expectRevert("Bootstrap is dry-run only; confirm registration before deployment");
        script.bootstrap();
        assertEq(identity.registrations(), 0);
    }
}
