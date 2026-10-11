// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {IHorkos, Verdict, StoredVerdict} from "../src/interfaces/IHorkos.sol";
import {HorkosConsumer} from "../src/HorkosConsumer.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";

/// @title RegistryInvariantTest
/// @notice Property-based and invariant tests covering I1-I8 (1000 fuzz runs each)
contract RegistryInvariantTest is Test {
    VerdictRegistry public registry;
    MockIdentity public identity;
    P256Fallback public p256Fallback;
    SimpleGate public gate;

    address internal constant OWNER = address(0x1111);
    uint256 internal constant AGENT_ID = 1;
    bytes32 internal constant POLICY_ID = bytes32(uint256(0x3333));
    uint16 internal constant MIN_SCORE = 5000;
    uint64 internal constant MAX_AGE = 300;

    uint256 internal constant SENTINEL_PRIVKEY = 0x0101010101010101010101010101010101010101010101010101010101010101;
    bytes32 internal constant SENTINEL_PUB_X = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
    bytes32 internal constant SENTINEL_PUB_Y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

    bytes32 internal constant KEY2_X = bytes32(uint256(0xaaaa));
    bytes32 internal constant KEY2_Y = bytes32(uint256(0xbbbb));

    function setUp() public {
        vm.warp(1700001000);
        identity = new MockIdentity();
        p256Fallback = new P256Fallback();
        vm.etch(address(0x100), address(p256Fallback).code);
        registry = new VerdictRegistry(identity);

        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        gate = new SimpleGate(registry, AGENT_ID, POLICY_ID, MIN_SCORE, MAX_AGE);
    }

    function _sign(Verdict memory v) internal view returns (bytes32 r, bytes32 s) {
        bytes32 digest = registry.hashVerdict(v);
        (r, s) = vm.signP256(SENTINEL_PRIVKEY, digest);
    }

    /// @notice I1: A verdictId is accepted at most once
    function testFuzz_I1_VerdictAcceptedAtMostOnce(uint64 nonceFuzz, uint16 scoreFuzz) public {
        vm.assume(scoreFuzz <= 10000);
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: scoreFuzz,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: nonceFuzz
        });

        (bytes32 r, bytes32 s) = _sign(v);
        bytes32 verdictId = registry.submit(v, r, s);
        assertTrue(verdictId != bytes32(0));

        // Second submission of the same verdict MUST revert
        vm.expectRevert(IHorkos.AlreadyAccepted.selector);
        registry.submit(v, r, s);
    }

    /// @notice I2: An accepted verdict was signed by the key active at acceptance (epoch recorded)
    function testFuzz_I2_AcceptedVerdictRecordsActiveEpoch(uint8 rotationsFuzz) public {
        vm.assume(rotationsFuzz < 10);
        for (uint8 i = 0; i < rotationsFuzz; i++) {
            vm.prank(OWNER);
            registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);
        }

        (,, uint32 expectedEpoch,) = registry.currentKey(AGENT_ID);

        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: uint64(rotationsFuzz) + 1
        });

        (bytes32 r, bytes32 s) = _sign(v);
        bytes32 id = registry.submit(v, r, s);

        StoredVerdict memory sv = registry.getVerdict(id);
        assertEq(sv.keyEpoch, expectedEpoch, "Stored epoch must match active epoch at submission");
    }

    /// @notice I3: After revokeKey or rotation, isValid is false for verdicts of the old epoch
    function testFuzz_I3_RevokeOrRotateInvalidatesOldEpochVerdicts(bool revokeOrRotate) public {
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: 101
        });

        (bytes32 r, bytes32 s) = _sign(v);
        bytes32 id = registry.submit(v, r, s);

        assertTrue(registry.isValid(id, AGENT_ID, POLICY_ID, 5000, 300), "Initially must be valid");

        if (revokeOrRotate) {
            // Revoke key
            vm.prank(OWNER);
            registry.revokeKey(AGENT_ID);
        } else {
            // Rotate key
            vm.prank(OWNER);
            registry.bindKey(AGENT_ID, KEY2_X, KEY2_Y);
        }

        assertFalse(registry.isValid(id, AGENT_ID, POLICY_ID, 5000, 300), "Old epoch verdict must be invalid");
    }

    /// @notice I4: isValid is false after expiry and when older than maxAge
    function testFuzz_I4_ExpiryAndMaxAge(uint32 warpSecondsFuzz) public {
        vm.assume(warpSecondsFuzz > 0 && warpSecondsFuzz < 100000);

        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: 202
        });

        (bytes32 r, bytes32 s) = _sign(v);
        bytes32 id = registry.submit(v, r, s);

        vm.warp(block.timestamp + warpSecondsFuzz);

        bool valid = registry.isValid(id, AGENT_ID, POLICY_ID, 5000, 300);

        bool expectedValid = (block.timestamp <= v.expiry) && (block.timestamp - v.observedAt <= 300);
        assertEq(valid, expectedValid, "isValid expiry/maxAge check mismatch");
    }

    /// @notice I5: A consumer consumes a verdict at most once
    function testFuzz_I5_ConsumerConsumesAtMostOnce(uint64 nonceFuzz) public {
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: nonceFuzz
        });

        (bytes32 r, bytes32 s) = _sign(v);
        bytes32 id = registry.submit(v, r, s);

        gate.execute(id);
        assertTrue(gate.consumed(id));

        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        gate.execute(id);
    }

    /// @notice I6: Only the ERC-8004 owner of an agentId can bind or revoke its key
    function testFuzz_I6_OnlyOwnerCanBindOrRevoke(address callerFuzz) public {
        vm.assume(callerFuzz != OWNER);

        vm.prank(callerFuzz);
        vm.expectRevert(IHorkos.NotAgentOwner.selector);
        registry.bindKey(AGENT_ID, KEY2_X, KEY2_Y);

        vm.prank(callerFuzz);
        vm.expectRevert(IHorkos.NotAgentOwner.selector);
        registry.revokeKey(AGENT_ID);
    }

    /// @notice I7: submit writes only the verdict record, the event, and nothing else
    function testFuzz_I7_SubmitDoesNotMutateOtherStorage(uint64 nonceFuzz) public {
        // Record state of agent key before submit
        (bytes32 beforeX, bytes32 beforeY, uint32 beforeEpoch, bool beforeActive) = registry.currentKey(AGENT_ID);

        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: nonceFuzz
        });

        (bytes32 r, bytes32 s) = _sign(v);
        registry.submit(v, r, s);

        // Verify key storage was NOT touched
        (bytes32 afterX, bytes32 afterY, uint32 afterEpoch, bool afterActive) = registry.currentKey(AGENT_ID);
        assertEq(afterX, beforeX);
        assertEq(afterY, beforeY);
        assertEq(afterEpoch, beforeEpoch);
        assertEq(afterActive, beforeActive);
    }

    /// @notice I8: Changing any single field of a Verdict changes the digest (and fails verification)
    function testFuzz_I8_SingleFieldChangeAltersDigest(uint8 fieldSelectorFuzz, uint256 deltaFuzz) public view {
        vm.assume(deltaFuzz > 0);
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: 100
        });

        bytes32 originalDigest = registry.hashVerdict(v);

        Verdict memory tampered = Verdict({
            agentId: v.agentId,
            modelHash: v.modelHash,
            inputHash: v.inputHash,
            policyId: v.policyId,
            scoreBps: v.scoreBps,
            observedAt: v.observedAt,
            expiry: v.expiry,
            nonce: v.nonce
        });

        uint256 nonZeroDelta = deltaFuzz == 0 ? 1 : deltaFuzz;
        uint64 d64 = uint64(nonZeroDelta) == 0 ? 1 : uint64(nonZeroDelta);
        uint8 field = fieldSelectorFuzz % 8;

        if (field == 0) {
            tampered.agentId = v.agentId ^ nonZeroDelta;
            if (tampered.agentId == v.agentId) tampered.agentId = v.agentId + 1;
        } else if (field == 1) {
            tampered.modelHash = bytes32(uint256(v.modelHash) ^ nonZeroDelta);
        } else if (field == 2) {
            tampered.inputHash = bytes32(uint256(v.inputHash) ^ nonZeroDelta);
        } else if (field == 3) {
            tampered.policyId = bytes32(uint256(v.policyId) ^ nonZeroDelta);
        } else if (field == 4) {
            uint16 diff = uint16(nonZeroDelta % 10000) + 1;
            tampered.scoreBps = uint16((uint256(v.scoreBps) + diff) % 10001);
            if (tampered.scoreBps == v.scoreBps) tampered.scoreBps = (v.scoreBps == 0 ? 1 : 0);
        } else if (field == 5) {
            tampered.observedAt = v.observedAt ^ d64;
        } else if (field == 6) {
            tampered.expiry = v.expiry ^ d64;
        } else if (field == 7) {
            tampered.nonce = v.nonce ^ d64;
        }

        bytes32 tamperedDigest = registry.hashVerdict(tampered);
        assertTrue(tamperedDigest != originalDigest, "Tampering single field must change digest");
    }
}
