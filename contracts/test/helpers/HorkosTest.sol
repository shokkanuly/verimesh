// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerdictRegistry} from "../../src/VerdictRegistry.sol";
import {Verdict} from "../../src/libs/VerdictLib.sol";
import {MockIdentity} from "../mocks/MockIdentity.sol";
import {P256Fallback} from "../mocks/P256Fallback.sol";

/// @notice Local-only test fixture. Keys are ephemeral and never written to disk.
abstract contract HorkosTest is Test {
    VerdictRegistry internal registry;
    MockIdentity internal identity;
    uint256 internal signerKey;
    uint256 internal constant AGENT_ID = 7;
    bytes32 internal constant POLICY_ID = keccak256("TRIPWIRE_V2_POLICY");
    bytes32 internal constant MODEL_HASH = keccak256("horkos-test-model");

    function setUpHorkos() internal {
        vm.warp(1700001000);
        vm.etch(address(0x100), address(new P256Fallback()).code);
        identity = new MockIdentity();
        identity.setOwner(AGENT_ID, address(this));
        registry = new VerdictRegistry(identity);
        signerKey = (vm.randomUint() >> 1) + 1;
        (uint256 x, uint256 y) = vm.publicKeyP256(signerKey);
        registry.bindKey(AGENT_ID, bytes32(x), bytes32(y));
    }

    function submitVerdict(uint16 score, uint64 nonce) internal returns (bytes32) {
        Verdict memory verdict = Verdict({
            agentId: AGENT_ID,
            modelHash: MODEL_HASH,
            inputHash: keccak256(abi.encode("local-test-event", nonce)),
            policyId: POLICY_ID,
            scoreBps: score,
            observedAt: uint64(block.timestamp),
            expiry: uint64(block.timestamp + 600),
            nonce: nonce
        });
        (bytes32 r, bytes32 s) = vm.signP256(signerKey, registry.hashVerdict(verdict));
        return registry.submit(verdict, r, s);
    }
}
