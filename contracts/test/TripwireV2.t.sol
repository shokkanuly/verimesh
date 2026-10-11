// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {Verdict} from "../src/libs/VerdictLib.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";
import {HorkosConsumer} from "../src/HorkosConsumer.sol";

/// @title TripwireV2Test
/// @notice End-to-end tests for Tripwire circuit breaker consumer model (T-41, T-42)
contract TripwireV2Test is Test {
    TripwireGuardianV2 public guardian;
    VerdictRegistry public registry;
    MockIdentity public identity;
    P256Fallback public p256Fallback;

    uint256 constant AGENT_ID = 1;
    address constant AGENT_OWNER = address(0xAA11);
    bytes32 constant POLICY_ID = keccak256("TRIPWIRE_V2_POLICY");
    bytes32 constant MODEL_HASH = 0x1111111111111111111111111111111111111111111111111111111111111111;

    bytes32 constant PUB_X = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
    bytes32 constant PUB_Y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

    uint256 constant SENTINEL_PRIVKEY = 0x0101010101010101010101010101010101010101010101010101010101010101;

    event ActionApplied(bytes32 indexed verdictId, uint16 scoreBps, TripwireGuardianV2.Tier tier);

    function setUp() public {
        vm.warp(1700001000);

        // Etch P256 fallback at 0x100 for local execution
        p256Fallback = new P256Fallback();
        vm.etch(address(0x100), address(p256Fallback).code);

        identity = new MockIdentity();
        identity.setOwner(AGENT_ID, AGENT_OWNER);

        registry = new VerdictRegistry(identity);
        guardian = new TripwireGuardianV2(registry, POLICY_ID);

        // Bind sentinel P256 key
        vm.prank(AGENT_OWNER);
        registry.bindKey(AGENT_ID, PUB_X, PUB_Y);

        // Configure Tripwire guardian trust
        guardian.setTrustedAgent(AGENT_ID, true);
        guardian.setTrustedModel(MODEL_HASH, true);
    }

    function _createAndSubmitVerdict(uint16 scoreBps, uint64 nonce) internal returns (bytes32 verdictId) {
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: MODEL_HASH,
            inputHash: keccak256(abi.encode("sample_bridge_event", nonce)),
            policyId: POLICY_ID,
            scoreBps: scoreBps,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: nonce
        });

        bytes32 digest = registry.hashVerdict(v);
        (bytes32 r, bytes32 s) = vm.signP256(SENTINEL_PRIVKEY, digest);

        return registry.submit(v, r, s);
    }

    function test_InitialState() public view {
        assertTrue(uint256(guardian.currentTier()) == uint256(TripwireGuardianV2.Tier.NONE));
    }

    function test_NormalTransfer_LowScore_DoesNotTriggerCircuitBreaker() public {
        // Safe transfer scored at 2000 bps (< 6500 THROTTLE threshold)
        bytes32 verdictId = _createAndSubmitVerdict(2000, 101);

        // Attempting to apply as a circuit breaker trigger reverts VerdictInvalid
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        guardian.applyVerdict(verdictId, AGENT_ID);

        // Tier remains NONE (bridge stays fully open)
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.NONE));
    }

    function test_ThrottleTier_Triggered() public {
        // Score 6500 (size ratio surge)
        bytes32 verdictId = _createAndSubmitVerdict(6500, 102);

        vm.expectEmit(true, false, false, true);
        emit ActionApplied(verdictId, 6500, TripwireGuardianV2.Tier.THROTTLE);

        guardian.applyVerdict(verdictId, AGENT_ID);

        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.THROTTLE));
        assertTrue(guardian.consumed(verdictId));
    }

    function test_DelayTier_Triggered() public {
        // Score 8500 (velocity surge or flagged counterparty)
        bytes32 verdictId = _createAndSubmitVerdict(8500, 103);

        vm.expectEmit(true, false, false, true);
        emit ActionApplied(verdictId, 8500, TripwireGuardianV2.Tier.DELAY);

        guardian.applyVerdict(verdictId, AGENT_ID);

        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.DELAY));
        assertTrue(guardian.consumed(verdictId));
    }

    function test_SyntheticBridgeDrain_TriggersFreeze() public {
        // Score 9500 (synthetic bridge drain / proof mismatch)
        bytes32 verdictId = _createAndSubmitVerdict(9500, 104);

        vm.expectEmit(true, false, false, true);
        emit ActionApplied(verdictId, 9500, TripwireGuardianV2.Tier.FREEZE);

        guardian.applyVerdict(verdictId, AGENT_ID);

        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.FREEZE));
        assertTrue(guardian.consumed(verdictId));
    }

    function test_CannotReconsumeVerdict() public {
        bytes32 verdictId = _createAndSubmitVerdict(9500, 105);

        guardian.applyVerdict(verdictId, AGENT_ID);
        assertTrue(guardian.consumed(verdictId));

        // Re-applying same verdict reverts VerdictConsumed
        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        guardian.applyVerdict(verdictId, AGENT_ID);
    }

    function test_UntrustedAgent_Reverts() public {
        bytes32 verdictId = _createAndSubmitVerdict(9500, 106);

        // Agent 99 is not trusted
        vm.expectRevert("Untrusted agent");
        guardian.applyVerdict(verdictId, 99);
    }

    function test_UntrustedModel_Reverts() public {
        // Create verdict with untrusted model hash
        bytes32 untrustedModel = bytes32(uint256(0x9999));
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: untrustedModel,
            inputHash: keccak256("input"),
            policyId: POLICY_ID,
            scoreBps: 9500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: 107
        });

        bytes32 digest = registry.hashVerdict(v);
        (bytes32 r, bytes32 s) = vm.signP256(SENTINEL_PRIVKEY, digest);
        bytes32 verdictId = registry.submit(v, r, s);

        vm.expectRevert("Untrusted model");
        guardian.applyVerdict(verdictId, AGENT_ID);
    }

    function test_OnlyOwnerCanConfigureTrustAndBridge() public {
        vm.startPrank(address(0xBAD));
        vm.expectRevert();
        guardian.setTrustedAgent(99, true);
        vm.expectRevert();
        guardian.setTrustedModel(bytes32(uint256(99)), true);
        vm.expectRevert();
        guardian.configureBridge(address(0xBEEF), 100 ether);
        vm.expectRevert();
        guardian.resetCircuit();
        vm.stopPrank();
        assertFalse(guardian.trustedAgents(99));
    }

    function test_ThrottleEnforcesCumulativeOutflowCap() public {
        address bridge = address(0xBEEF);
        guardian.configureBridge(bridge, 100 ether);
        guardian.applyVerdict(_createAndSubmitVerdict(6500, 201), AGENT_ID);
        vm.startPrank(bridge);
        guardian.recordOutflow(60 ether);
        guardian.recordOutflow(40 ether);
        vm.expectRevert(TripwireGuardianV2.OutflowCapExceeded.selector);
        guardian.recordOutflow(1);
        vm.stopPrank();
        assertEq(guardian.windowOutflow(), 100 ether);
    }

    function test_OnlyConfiguredBridgeCanRecordOutflow() public {
        guardian.configureBridge(address(0xBEEF), 100 ether);
        vm.expectRevert(TripwireGuardianV2.NotBridge.selector);
        guardian.recordOutflow(1 ether);
    }

    function test_DelayBlocksUntilDeadline() public {
        address bridge = address(0xBEEF);
        guardian.configureBridge(bridge, 100 ether);
        guardian.applyVerdict(_createAndSubmitVerdict(8500, 202), AGENT_ID);
        uint64 until = guardian.tierUntil();
        assertEq(until, block.timestamp + guardian.DELAY_SECONDS());
        vm.prank(bridge);
        vm.expectRevert(abi.encodeWithSelector(
            TripwireGuardianV2.OutflowBlocked.selector, TripwireGuardianV2.Tier.DELAY, until
        ));
        guardian.recordOutflow(1 ether);
        vm.warp(until);
        vm.prank(bridge);
        guardian.recordOutflow(1 ether);
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.NONE));
    }

    function test_FreezeIsCappedAndCannotBeRenewedOrDowngraded() public {
        guardian.applyVerdict(_createAndSubmitVerdict(9500, 203), AGENT_ID);
        uint64 until = guardian.tierUntil();
        vm.warp(block.timestamp + 60);
        guardian.applyVerdict(_createAndSubmitVerdict(9500, 204), AGENT_ID);
        bytes32 lowerTierVerdict = _createAndSubmitVerdict(6500, 205);
        vm.expectEmit(true, false, false, true);
        emit ActionApplied(lowerTierVerdict, 6500, TripwireGuardianV2.Tier.FREEZE);
        guardian.applyVerdict(lowerTierVerdict, AGENT_ID);
        assertEq(guardian.tierUntil(), until);
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.FREEZE));
        vm.warp(until);
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.NONE));
    }

    function test_OwnerCanLiftFreezeEarly() public {
        address bridge = address(0xBEEF);
        guardian.configureBridge(bridge, 100 ether);
        guardian.applyVerdict(_createAndSubmitVerdict(9500, 206), AGENT_ID);
        uint64 until = guardian.tierUntil();
        vm.prank(bridge);
        vm.expectRevert(abi.encodeWithSelector(
            TripwireGuardianV2.OutflowBlocked.selector, TripwireGuardianV2.Tier.FREEZE, until
        ));
        guardian.recordOutflow(1 ether);
        guardian.resetCircuit();
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.NONE));
        vm.prank(bridge);
        guardian.recordOutflow(1 ether);
    }

    function test_RevokedKeyCannotApplyVerdict() public {
        bytes32 verdictId = _createAndSubmitVerdict(9500, 207);
        vm.prank(AGENT_OWNER);
        registry.revokeKey(AGENT_ID);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        guardian.applyVerdict(verdictId, AGENT_ID);
        assertFalse(guardian.consumed(verdictId));
    }
}
