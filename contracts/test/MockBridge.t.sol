// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HorkosTest} from "./helpers/HorkosTest.sol";
import {MockBridge} from "../src/examples/MockBridge.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {HorkosConsumer} from "../src/HorkosConsumer.sol";

contract RejectingRecipient {
    receive() external payable { revert("rejected"); }
}

contract ReenteringOwner {
    MockBridge internal bridge;
    bool public reentered;

    function accept(MockBridge bridge_) external {
        bridge = bridge_;
        bridge.acceptOwnership();
    }

    function release() external { bridge.release(payable(address(this)), 1 ether); }

    receive() external payable {
        try bridge.release(payable(address(this)), 1 ether) { reentered = true; } catch {}
    }
}

contract MockBridgeTest is HorkosTest {
    MockBridge internal bridge;
    TripwireGuardianV2 internal guardian;
    address payable internal recipient = payable(address(0xCAFE));

    function setUp() public {
        setUpHorkos();
        guardian = new TripwireGuardianV2(registry, POLICY_ID);
        guardian.setTrustedAgent(AGENT_ID, true);
        guardian.setTrustedModel(MODEL_HASH, true);
        bridge = new MockBridge(guardian);
        guardian.configureBridge(address(bridge), 100 ether);
        vm.deal(address(bridge), 1000 ether);
    }

    function trigger(uint16 score, uint64 nonce) internal {
        guardian.applyVerdict(submitVerdict(score, nonce), AGENT_ID);
    }

    function assertBlocked(uint16 score) internal {
        trigger(score, score);
        uint256 beforeBalance = address(bridge).balance;
        uint256 beforeOutflow = guardian.windowOutflow();
        vm.expectRevert(abi.encodeWithSelector(
            TripwireGuardianV2.OutflowBlocked.selector, guardian.currentTier(), guardian.tierUntil()
        ));
        bridge.release(recipient, 1 ether);
        assertEq(address(bridge).balance, beforeBalance);
        assertEq(guardian.windowOutflow(), beforeOutflow);
        assertEq(recipient.balance, 0);
    }

    function test_NormalReleaseRecordsOutflow() public {
        bridge.release(recipient, 10 ether);
        assertEq(recipient.balance, 10 ether);
        assertEq(guardian.windowOutflow(), 10 ether);
        assertEq(address(bridge).balance, 990 ether);
    }

    function test_ThrottleCountsCumulativeReleases() public {
        trigger(7300, 1);
        bridge.release(recipient, 60 ether);
        bridge.release(recipient, 40 ether);
        vm.expectRevert(TripwireGuardianV2.OutflowCapExceeded.selector);
        bridge.release(recipient, 1);
        assertEq(recipient.balance, 100 ether);
        assertEq(guardian.windowOutflow(), 100 ether);
    }

    function test_PreviousOutflowCountsWhenThrottleStarts() public {
        bridge.release(recipient, 99 ether);
        trigger(7300, 2);
        vm.expectRevert(TripwireGuardianV2.OutflowCapExceeded.selector);
        bridge.release(recipient, 2 ether);
        assertEq(recipient.balance, 99 ether);
    }

    function test_DelayBlocksActualTransfer() public { assertBlocked(8900); }
    function test_FreezeBlocksActualTransfer() public { assertBlocked(9800); }

    function test_DelayExpiresAtDeadline() public {
        trigger(8900, 3);
        vm.warp(guardian.tierUntil());
        bridge.release(recipient, 1 ether);
        assertEq(recipient.balance, 1 ether);
    }

    function test_FreezeExpiresAtBoundedDeadline() public {
        trigger(9800, 4);
        uint64 deadline = guardian.tierUntil();
        assertEq(deadline, block.timestamp + guardian.MAX_FREEZE());
        vm.warp(deadline);
        bridge.release(recipient, 1 ether);
        assertEq(recipient.balance, 1 ether);
    }

    function test_OwnerResetRestoresRelease() public {
        trigger(9800, 5);
        vm.prank(address(0xBAD));
        vm.expectRevert();
        guardian.resetCircuit();
        guardian.resetCircuit();
        bridge.release(recipient, 1 ether);
        assertEq(recipient.balance, 1 ether);
    }

    function test_LowerAndRepeatedTiersCannotLiftOrExtendFreeze() public {
        trigger(9800, 6);
        uint64 deadline = guardian.tierUntil();
        vm.warp(block.timestamp + 60);
        trigger(7300, 7);
        trigger(9800, 8);
        assertEq(guardian.tierUntil(), deadline);
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.FREEZE));
        vm.expectRevert();
        bridge.release(recipient, 1 ether);
        assertEq(recipient.balance, 0);
    }

    function test_OnlyOwnerCanRelease() public {
        vm.prank(address(0xBAD));
        vm.expectRevert();
        bridge.release(recipient, 1 ether);
        assertEq(guardian.windowOutflow(), 0);
    }

    function test_FailedTransferRollsBackOutflow() public {
        uint64 start = guardian.windowStartedAt();
        RejectingRecipient rejecting = new RejectingRecipient();
        vm.expectRevert(MockBridge.TransferFailed.selector);
        bridge.release(payable(address(rejecting)), 1 ether);
        assertEq(guardian.windowOutflow(), 0);
        assertEq(guardian.windowStartedAt(), start);
        assertEq(address(bridge).balance, 1000 ether);
    }

    function test_InsufficientFundsRollsBackOutflow() public {
        vm.expectRevert(MockBridge.TransferFailed.selector);
        bridge.release(recipient, 1001 ether);
        assertEq(guardian.windowOutflow(), 0);
    }

    function test_OwnerReceiverCannotReenter() public {
        ReenteringOwner receiver = new ReenteringOwner();
        bridge.transferOwnership(address(receiver));
        receiver.accept(bridge);
        receiver.release();
        assertFalse(receiver.reentered());
        assertEq(address(receiver).balance, 1 ether);
        assertEq(guardian.windowOutflow(), 1 ether);
    }

    function test_InvalidParametersRejected() public {
        vm.expectRevert(MockBridge.InvalidGuardian.selector);
        new MockBridge(TripwireGuardianV2(address(0)));
        vm.expectRevert(MockBridge.InvalidRelease.selector);
        bridge.release(payable(address(0)), 1 ether);
        vm.expectRevert(MockBridge.InvalidRelease.selector);
        bridge.release(recipient, 0);
    }

    function test_ThresholdBoundaries() public {
        uint16[6] memory scores = [uint16(6499), 6500, 8499, 8500, 9499, 9500];
        uint256[6] memory tiers = [uint256(0), 1, 1, 2, 2, 3];
        for (uint64 i; i < scores.length; ++i) {
            guardian.resetCircuit();
            bytes32 id = submitVerdict(scores[i], 100 + i);
            if (scores[i] < 6500) vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
            guardian.applyVerdict(id, AGENT_ID);
            assertEq(uint256(guardian.currentTier()), tiers[i]);
        }
    }

    function testFuzz_CumulativeCapIsAtomic(uint96 first, uint96 second) public {
        first = uint96(bound(first, 1, 100 ether));
        second = uint96(bound(second, 1, 100 ether));
        trigger(7300, 200);
        bridge.release(recipient, first);
        if (uint256(first) + second > 100 ether) {
            vm.expectRevert(TripwireGuardianV2.OutflowCapExceeded.selector);
            bridge.release(recipient, second);
            assertEq(recipient.balance, first);
            assertEq(guardian.windowOutflow(), first);
        } else {
            bridge.release(recipient, second);
            assertEq(recipient.balance, uint256(first) + second);
            assertEq(guardian.windowOutflow(), uint256(first) + second);
        }
    }
}
