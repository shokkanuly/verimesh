// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SeedScript} from "../script/Seed.s.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {MockBridge} from "../src/examples/MockBridge.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

// Keep ephemeral secrets in memory: Foundry's process-global dotenv can race across suites.
contract SeedScriptHarness is SeedScript {
    function runWithCredentials(uint256 deployerKey, uint256 agentOwnerKey, string memory manifest) external {
        _run(deployerKey, agentOwnerKey, 7, manifest);
    }
}

contract SeedSafetyTest is Test {
    MockIdentity private identity;
    VerdictRegistry private registry;
    TripwireGuardianV2 private guardian;
    SeedScriptHarness private script;
    uint256 private deployerKey;
    uint256 private agentOwnerKey;
    bytes32 private constant KEY_X = keccak256("synthetic-public-x");
    bytes32 private constant KEY_Y = keccak256("synthetic-public-y");
    bytes32 private constant MODEL = keccak256("synthetic-model");
    bool private recorded;
    MockBridge private bridge;
    address private demoOwner;

    function setUp() public {
        vm.chainId(10143);
        deployerKey = (vm.randomUint() >> 1) + 1;
        agentOwnerKey = (vm.randomUint() >> 1) + 1;
        demoOwner = vm.addr(deployerKey);
        identity = new MockIdentity();
        identity.setOwner(7, vm.addr(agentOwnerKey));
        registry = new VerdictRegistry(identity);
        vm.prank(vm.addr(deployerKey));
        guardian = new TripwireGuardianV2(registry, keccak256("TRIPWIRE_CIRCUIT_BREAKER_POLICY"));
        script = new SeedScriptHarness();
        vm.setEnv("SENTINEL_KEY_X", vm.toString(KEY_X));
        vm.setEnv("SENTINEL_KEY_Y", vm.toString(KEY_Y));
        vm.setEnv("SCORER_MODEL_HASH", vm.toString(MODEL));
    }

    function _seed() private {
        script.runWithCredentials(deployerKey, agentOwnerKey, _manifest());
    }

    function _manifest() private view returns (string memory) {
        string memory contractsJson = string.concat(
            '{"ERC8004Identity":"', vm.toString(address(identity)), '","VerdictRegistry":',
            recorded ? '{"address":"' : '"', vm.toString(address(registry)), recorded ? '"}' : '"',
            ',"TripwireGuardianV2":', recorded ? '{"address":"' : '"', vm.toString(address(guardian)), recorded ? '"}' : '"'
        );
        if (address(bridge) != address(0)) {
            contractsJson = string.concat(contractsJson, ',"MockBridge":', recorded ? '{"address":"' : '"',
                vm.toString(address(bridge)), recorded ? '"}' : '"');
        }
        contractsJson = string.concat(contractsJson, '}');
        string memory metadata = "";
        if (recorded) {
            string memory agent = string.concat(',"agent":{"agentId":"7","epoch":1,"keyX":"', vm.toString(KEY_X), '","keyY":"', vm.toString(KEY_Y), '"}');
            string memory owners = string.concat(',"owners":{"agent":"', vm.toString(vm.addr(agentOwnerKey)), '","guardian":"',
                vm.toString(vm.addr(deployerKey)), '","demo":"', vm.toString(demoOwner), '"}');
            metadata = string.concat(agent, owners, ',"allowlists":{"agents":["7"],"models":["', vm.toString(MODEL), '"]}');
        }
        if (address(bridge) != address(0)) metadata = string.concat(metadata, ',"guardian":{"outflowCap":"1000"}');
        return string.concat('{"chainId":10143,"contracts":', contractsJson, metadata, '}');
    }

    function test_SeedTwiceDoesNotRebindOrEmitNewTrustChanges() public {
        _seed();
        vm.recordLogs();
        _seed();
        assertEq(vm.getRecordedLogs().length, 0);
        (bytes32 x, bytes32 y, uint32 epoch, bool active) = registry.currentKey(7);
        assertEq(x, KEY_X);
        assertEq(y, KEY_Y);
        assertEq(epoch, 1);
        assertTrue(active);
        assertTrue(guardian.trustedAgents(7));
        assertTrue(guardian.trustedModels(MODEL));
        assertEq(guardian.bridge(), address(0));
    }

    function test_RecordedManifestSeedsAndRerunsWithoutChangingEpoch() public {
        recorded = true;
        _seed();
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 1);
    }

    function test_BridgeSeedsAndRerunsWithoutNewTransactions() public {
        recorded = true;
        vm.prank(vm.addr(deployerKey));
        bridge = new MockBridge(guardian);
        _seed();
        assertEq(guardian.bridge(), address(bridge));
        assertEq(guardian.outflowCap(), 1000);
        vm.recordLogs();
        _seed();
        assertEq(vm.getRecordedLogs().length, 0);
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 1);
    }

    function test_WrongBridgeGuardianFailsBeforeBinding() public {
        TripwireGuardianV2 other = new TripwireGuardianV2(registry, keccak256("other-policy"));
        vm.prank(vm.addr(deployerKey));
        bridge = new MockBridge(other);
        vm.expectRevert("Bridge guardian mismatch");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
        assertFalse(guardian.trustedAgents(7));
    }

    function test_WrongBridgeOwnerFailsBeforeBinding() public {
        bridge = new MockBridge(guardian);
        vm.expectRevert("Bridge owner credential mismatch");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_PendingBridgeOwnerFailsBeforeBinding() public {
        vm.prank(vm.addr(deployerKey));
        bridge = new MockBridge(guardian);
        vm.prank(vm.addr(deployerKey));
        bridge.transferOwnership(address(0x1234));
        vm.expectRevert("Pending bridge ownership transfer");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_WrongManifestDemoOwnerFailsBeforeBinding() public {
        recorded = true;
        vm.prank(vm.addr(deployerKey));
        bridge = new MockBridge(guardian);
        demoOwner = address(0x1234);
        vm.expectRevert("Manifest demo owner mismatch");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_DifferentBoundKeyIsNotRotated() public {
        vm.prank(vm.addr(agentOwnerKey));
        registry.bindKey(7, keccak256("other-x"), KEY_Y);
        vm.expectRevert("Seed refuses key rotation or revoked-key reactivation");
        _seed();
        assertFalse(guardian.trustedAgents(7));
    }

    function test_RevokedKeyIsNotReactivated() public {
        _seed();
        vm.prank(vm.addr(agentOwnerKey));
        registry.revokeKey(7);
        vm.expectRevert("Seed refuses key rotation or revoked-key reactivation");
        _seed();
    }

    function test_WrongAgentOwnerFailsBeforeBinding() public {
        identity.setOwner(7, address(0x1234));
        vm.expectRevert("Agent owner credential mismatch");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_WrongGuardianOwnerFailsBeforeBinding() public {
        deployerKey = (vm.randomUint() >> 1) + 1;
        vm.expectRevert("Guardian owner credential mismatch");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_UnrecordedBridgeFailsBeforeBinding() public {
        vm.prank(vm.addr(deployerKey));
        guardian.configureBridge(address(0x1234), 100);
        vm.expectRevert("Unrecorded bridge is already configured");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }

    function test_WrongChainFailsBeforeBinding() public {
        vm.chainId(1);
        vm.expectRevert("Seed chain differs from manifest");
        _seed();
        (,, uint32 epoch,) = registry.currentKey(7);
        assertEq(epoch, 0);
    }
}
