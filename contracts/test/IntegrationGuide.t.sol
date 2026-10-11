// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HorkosTest} from "./helpers/HorkosTest.sol";
import {Verdict} from "../src/libs/VerdictLib.sol";
import {HorkosConsumer} from "../src/HorkosConsumer.sol";
import {IHorkos} from "../src/interfaces/IHorkos.sol";
import {GuardedAction} from "../src/examples/GuardedAction.sol";

contract IntegrationGuideTest is HorkosTest {
    GuardedAction internal gate;
    mapping(bytes32 => Verdict) internal submitted;
    bytes32 internal constant PAYLOAD = keccak256("reference-action");

    function setUp() public {
        setUpHorkos();
        gate = new GuardedAction(registry, AGENT_ID, POLICY_ID, MODEL_HASH, address(this));
    }

    function verdict() internal view returns (Verdict memory) {
        return Verdict(AGENT_ID, MODEL_HASH, gate.actionHash(PAYLOAD), POLICY_ID, 8000,
            uint64(block.timestamp), uint64(block.timestamp + 600), 1);
    }

    function submit(Verdict memory v) internal returns (bytes32) {
        (bytes32 r, bytes32 s) = vm.signP256(signerKey, registry.hashVerdict(v));
        bytes32 id = registry.submit(v, r, s);
        submitted[id] = v;
        return id;
    }

    function test_GuideActionAndSingleUse() public {
        bytes32 id = submit(verdict());
        gate.execute(submitted[id], PAYLOAD);
        assertEq(gate.actions(), 1);
        assertTrue(gate.consumed(id));
        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_WrongCallerCannotFrontRun() public {
        bytes32 id = submit(verdict());
        vm.prank(address(123));
        vm.expectRevert(GuardedAction.Unauthorized.selector);
        gate.execute(submitted[id], PAYLOAD);
        assertFalse(gate.consumed(id));
    }

    function test_UnacceptedVerdictRejected() public {
        Verdict memory v = verdict();
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(v, PAYLOAD);
    }

    function test_AlteredAcceptedPreimageRejected() public {
        Verdict memory v = verdict();
        submit(v);
        v.nonce++;
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(v, PAYLOAD);
    }

    function test_WrongPayloadRollsBackConsumption() public {
        bytes32 id = submit(verdict());
        vm.expectRevert(GuardedAction.WrongCommitment.selector);
        gate.execute(submitted[id], keccak256("different-action"));
        assertFalse(gate.consumed(id));
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_WrongModelRejected() public {
        Verdict memory v = verdict();
        v.modelHash = keccak256("untrusted-model");
        bytes32 id = submit(v);
        vm.expectRevert(GuardedAction.WrongCommitment.selector);
        gate.execute(submitted[id], PAYLOAD);
        assertFalse(gate.consumed(id));
    }

    function test_WrongPolicyRejected() public {
        Verdict memory v = verdict();
        v.policyId = keccak256("untrusted-policy");
        bytes32 id = submit(v);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_WrongAgentRejected() public {
        identity.setOwner(8, address(this));
        (uint256 x, uint256 y) = vm.publicKeyP256(signerKey);
        registry.bindKey(8, bytes32(x), bytes32(y));
        Verdict memory v = verdict();
        v.agentId = 8;
        bytes32 id = submit(v);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_ThresholdRejected() public {
        Verdict memory v = verdict();
        v.scoreBps = 7999;
        bytes32 id = submit(v);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_StaleRejected() public {
        bytes32 id = submit(verdict());
        vm.warp(block.timestamp + 301);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_ExpiryRejected() public {
        Verdict memory v = verdict();
        v.expiry = uint64(block.timestamp + 10);
        bytes32 id = submit(v);
        vm.warp(block.timestamp + 11);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_RevokedKeyRejected() public {
        bytes32 id = submit(verdict());
        registry.revokeKey(AGENT_ID);
        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate.execute(submitted[id], PAYLOAD);
    }

    function test_CrossContractReplayRejected() public {
        bytes32 id = submit(verdict());
        GuardedAction other = new GuardedAction(registry, AGENT_ID, POLICY_ID, MODEL_HASH, address(this));
        vm.expectRevert(GuardedAction.WrongCommitment.selector);
        other.execute(submitted[id], PAYLOAD);
        assertFalse(other.consumed(id));
    }

    function test_InvalidConfigurationRejected() public {
        vm.expectRevert(GuardedAction.InvalidConfiguration.selector);
        new GuardedAction(IHorkos(address(0)), AGENT_ID, POLICY_ID, MODEL_HASH, address(this));
        vm.expectRevert(GuardedAction.InvalidConfiguration.selector);
        new GuardedAction(registry, AGENT_ID, POLICY_ID, MODEL_HASH, address(0));
    }
}
