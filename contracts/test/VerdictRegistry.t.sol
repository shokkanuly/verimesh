// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {IHorkos, Verdict, StoredVerdict} from "../src/interfaces/IHorkos.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";

contract VerdictRegistryTest is Test {
    VerdictRegistry public registry;
    MockIdentity public identity;
    P256Fallback public p256Fallback;

    function setUp() public {
        vm.warp(1700001000);
        identity = new MockIdentity();
        p256Fallback = new P256Fallback();
        vm.etch(address(0x100), address(p256Fallback).code);
        registry = new VerdictRegistry(identity);
    }

    function test_Deployment() public view {
        assertTrue(address(registry.identityRegistry()) == address(identity));
    }

    function test_P256Fallback_KnownSignatureVerifies() public view {
        string memory vectors = vm.readFile("../test-vectors/verdict-vectors.json");
        bytes32 h = vm.parseJsonBytes32(vectors, ".vectors[0].digest");
        bytes32 r = vm.parseJsonBytes32(vectors, ".vectors[0].signature.r");
        bytes32 s = vm.parseJsonBytes32(vectors, ".vectors[0].signature.s");
        bytes32 x = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
        bytes32 y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

        // 1. Direct call to P256 precompile wrapper
        (bool ok, bytes memory ret) = address(0x100).staticcall(abi.encode(h, r, s, x, y));
        assertTrue(ok, "Precompile staticcall failed");
        assertEq(ret.length, 32, "Return length not 32 bytes");
        assertEq(abi.decode(ret, (uint256)), 1, "Known signature did not verify");

        // 2. Tampered digest must return false
        bytes32 tamperedH = bytes32(uint256(h) ^ 1);
        (bool okBad, bytes memory retBad) = address(0x100).staticcall(abi.encode(tamperedH, r, s, x, y));
        assertTrue(okBad, "Staticcall on bad signature failed");
        assertEq(abi.decode(retBad, (uint256)), 0, "Tampered signature unexpectedly verified");
    }

    // ==========================================
    // T-11: bindKey, revokeKey, currentKey tests
    // ==========================================

    event AgentKeyBound(uint256 indexed agentId, uint32 indexed epoch, bytes32 x, bytes32 y);
    event AgentKeyRevoked(uint256 indexed agentId, uint32 indexed epoch);

    address internal constant OWNER = address(0xAA11);
    address internal constant STRANGER = address(0xBB22);
    uint256 internal constant AGENT_ID = 1;
    bytes32 internal constant KEY_X = bytes32(uint256(0x1234));
    bytes32 internal constant KEY_Y = bytes32(uint256(0x5678));
    bytes32 internal constant KEY_X2 = bytes32(uint256(0x9abc));
    bytes32 internal constant KEY_Y2 = bytes32(uint256(0xdef0));

    function test_BindKey_ByOwner_Success() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.expectEmit(true, true, false, true);
        emit AgentKeyBound(AGENT_ID, 1, KEY_X, KEY_Y);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);

        (bytes32 x, bytes32 y, uint32 epoch, bool active) = registry.currentKey(AGENT_ID);
        assertEq(x, KEY_X, "Key X mismatch");
        assertEq(y, KEY_Y, "Key Y mismatch");
        assertEq(epoch, 1, "Epoch mismatch");
        assertTrue(active, "Key should be active");
    }

    function test_BindKey_ByStranger_RevertsNotAgentOwner() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(STRANGER);
        vm.expectRevert(IHorkos.NotAgentOwner.selector);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);
    }

    function test_BindKey_ZeroX_RevertsInvalidKey() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        vm.expectRevert(IHorkos.InvalidKey.selector);
        registry.bindKey(AGENT_ID, bytes32(0), KEY_Y);
    }

    function test_BindKey_ZeroY_RevertsInvalidKey() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        vm.expectRevert(IHorkos.InvalidKey.selector);
        registry.bindKey(AGENT_ID, KEY_X, bytes32(0));
    }

    function test_BindKey_RotateBumpsEpoch() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);

        (,, uint32 epoch1,) = registry.currentKey(AGENT_ID);
        assertEq(epoch1, 1, "Initial epoch must be 1");

        vm.expectEmit(true, true, false, true);
        emit AgentKeyBound(AGENT_ID, 2, KEY_X2, KEY_Y2);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X2, KEY_Y2);

        (bytes32 x2, bytes32 y2, uint32 epoch2, bool active2) = registry.currentKey(AGENT_ID);
        assertEq(x2, KEY_X2, "Rotated Key X mismatch");
        assertEq(y2, KEY_Y2, "Rotated Key Y mismatch");
        assertEq(epoch2, 2, "Epoch must increment to 2");
        assertTrue(active2, "Rotated key should be active");
    }

    function test_RevokeKey_ByOwner_Success() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);

        vm.expectEmit(true, true, false, true);
        emit AgentKeyRevoked(AGENT_ID, 1);

        vm.prank(OWNER);
        registry.revokeKey(AGENT_ID);

        (bytes32 x, bytes32 y, uint32 epoch, bool active) = registry.currentKey(AGENT_ID);
        assertEq(x, KEY_X);
        assertEq(y, KEY_Y);
        assertEq(epoch, 1);
        assertFalse(active, "Key must be inactive after revoke");
    }

    function test_RevokeKey_ByStranger_RevertsNotAgentOwner() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);

        vm.prank(STRANGER);
        vm.expectRevert(IHorkos.NotAgentOwner.selector);
        registry.revokeKey(AGENT_ID);
    }

    function test_RevokeKey_WhenNotActive_RevertsKeyNotActive() public {
        identity.setOwner(AGENT_ID, OWNER);

        // Never bound: active is false
        vm.prank(OWNER);
        vm.expectRevert(IHorkos.KeyNotActive.selector);
        registry.revokeKey(AGENT_ID);
    }

    function test_RevokeKey_Twice_RevertsKeyNotActive() public {
        identity.setOwner(AGENT_ID, OWNER);

        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X, KEY_Y);

        vm.prank(OWNER);
        registry.revokeKey(AGENT_ID);

        vm.prank(OWNER);
        vm.expectRevert(IHorkos.KeyNotActive.selector);
        registry.revokeKey(AGENT_ID);
    }

    // ==========================================
    // T-12: submit tests (valid & all revert paths)
    // ==========================================

    event VerdictAccepted(
        bytes32 indexed verdictId,
        uint256 indexed agentId,
        bytes32 indexed policyId,
        uint16 scoreBps,
        bytes32 modelHash,
        bytes32 inputHash,
        uint64 observedAt
    );

    uint256 internal constant SENTINEL_PRIVKEY = 0x0101010101010101010101010101010101010101010101010101010101010101;
    bytes32 internal constant SENTINEL_PUB_X = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
    bytes32 internal constant SENTINEL_PUB_Y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

    uint256 internal constant OTHER_PRIVKEY = 0x0202020202020202020202020202020202020202020202020202020202020202;

    function _validVerdict() internal view returns (Verdict memory) {
        return Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: bytes32(uint256(0x3333)),
            scoreBps: 8500,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: 100
        });
    }

    function _sign(Verdict memory v, uint256 privKey) internal view returns (bytes32 r, bytes32 s) {
        bytes32 digest = registry.hashVerdict(v);
        (r, s) = vm.signP256(privKey, digest);
    }

    function test_Submit_Valid_Success() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 expectedVerdictId = registry.hashVerdict(v);

        vm.expectEmit(true, true, true, true);
        emit VerdictAccepted(
            expectedVerdictId,
            v.agentId,
            v.policyId,
            v.scoreBps,
            v.modelHash,
            v.inputHash,
            v.observedAt
        );

        bytes32 returnedId = registry.submit(v, r, s);
        assertEq(returnedId, expectedVerdictId, "Returned verdictId mismatch");

        StoredVerdict memory sv = registry.getVerdict(expectedVerdictId);
        assertEq(sv.agentId, v.agentId);
        assertEq(sv.modelHash, v.modelHash);
        assertEq(sv.policyId, v.policyId);
        assertEq(sv.scoreBps, v.scoreBps);
        assertEq(sv.observedAt, v.observedAt);
        assertEq(sv.submittedAt, uint64(block.timestamp));
        assertEq(sv.expiry, v.expiry);
        assertEq(sv.keyEpoch, 1);
    }

    function test_Submit_Twice_RevertsAlreadyAccepted() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        registry.submit(v, r, s);

        vm.expectRevert(IHorkos.AlreadyAccepted.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_AfterExpiry_RevertsExpired() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        v.expiry = uint64(block.timestamp - 1);
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        vm.expectRevert(IHorkos.Expired.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_WithNoKeyBound_RevertsKeyNotActive() public {
        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        vm.expectRevert(IHorkos.KeyNotActive.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_AfterRevoke_RevertsKeyNotActive() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        vm.prank(OWNER);
        registry.revokeKey(AGENT_ID);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        vm.expectRevert(IHorkos.KeyNotActive.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedAgentId_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        identity.setOwner(2, OWNER);
        vm.startPrank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);
        registry.bindKey(2, SENTINEL_PUB_X, SENTINEL_PUB_Y);
        vm.stopPrank();

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.agentId = 2; // Tampered agentId
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedModelHash_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.modelHash = bytes32(uint256(v.modelHash) ^ 1);
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedInputHash_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.inputHash = bytes32(uint256(v.inputHash) ^ 1);
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedPolicyId_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.policyId = bytes32(uint256(v.policyId) ^ 1);
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedScoreBps_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.scoreBps = 9500;
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedObservedAt_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.observedAt = v.observedAt - 1;
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedExpiry_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.expiry = v.expiry + 100;
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_TamperedNonce_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        v.nonce = v.nonce + 1;
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_SignatureFromDifferentKey_RevertsBadSignature() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, OTHER_PRIVKEY);

        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(v, r, s);
    }

    function test_Submit_RelayerOtherThanSentinel_Success() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);

        // Stranger/relayer submits the tx
        vm.prank(STRANGER);
        bytes32 verdictId = registry.submit(v, r, s);
        assertTrue(verdictId != bytes32(0));
    }

    // ==========================================
    // T-13: isValid and getVerdict tests
    // ==========================================

    function test_GetVerdict_UnknownVerdict_Reverts() public {
        bytes32 unknownId = bytes32(uint256(0x9999));
        vm.expectRevert(IHorkos.UnknownVerdict.selector);
        registry.getVerdict(unknownId);
    }

    function test_IsValid_HappyPath_ReturnsTrue() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // isValid(id, agentId, policyId, minScoreBps, maxAgeSeconds)
        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 300);
        assertTrue(valid, "Verdict should be valid");
    }

    function test_IsValid_UnknownVerdict_ReturnsFalse() public view {
        bytes32 unknownId = bytes32(uint256(0x9999));
        bool valid = registry.isValid(unknownId, AGENT_ID, bytes32(uint256(0x3333)), 8000, 300);
        assertFalse(valid, "Unknown verdict must not be valid");
    }

    function test_IsValid_WrongAgent_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        bool valid = registry.isValid(verdictId, 999, v.policyId, 8000, 300);
        assertFalse(valid, "Wrong agent must be invalid");
    }

    function test_IsValid_WrongPolicy_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        bool valid = registry.isValid(verdictId, v.agentId, bytes32(uint256(0xdead)), 8000, 300);
        assertFalse(valid, "Wrong policy must be invalid");
    }

    function test_IsValid_BelowMinScore_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        v.scoreBps = 7000;
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // Required 8000, score is 7000
        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 300);
        assertFalse(valid, "Score below minScoreBps must be invalid");
    }

    function test_IsValid_Expired_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // Warp past expiry
        vm.warp(v.expiry + 1);
        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 0);
        assertFalse(valid, "Verdict past expiry must be invalid");
    }

    function test_IsValid_TooOld_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // Max age 100 seconds; warp 105 seconds past observedAt
        vm.warp(v.observedAt + 105);
        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 100);
        assertFalse(valid, "Verdict older than maxAge must be invalid");
    }

    function test_IsValid_KeyRevoked_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // Revoke key
        vm.prank(OWNER);
        registry.revokeKey(AGENT_ID);

        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 300);
        assertFalse(valid, "Verdicts signed by revoked key must be invalid");
    }

    function test_IsValid_KeyRotated_ReturnsFalse() public {
        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        Verdict memory v = _validVerdict();
        (bytes32 r, bytes32 s) = _sign(v, SENTINEL_PRIVKEY);
        bytes32 verdictId = registry.submit(v, r, s);

        // Rotate key (epoch becomes 2)
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, KEY_X2, KEY_Y2);

        bool valid = registry.isValid(verdictId, v.agentId, v.policyId, 8000, 300);
        assertFalse(valid, "Verdicts from previous epoch must be invalid after key rotation");
    }
}
