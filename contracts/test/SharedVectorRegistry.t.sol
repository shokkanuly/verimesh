// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VectorFixture} from "./helpers/VectorFixture.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {Verdict, VerdictLib} from "../src/libs/VerdictLib.sol";
import {P256} from "../src/libs/P256.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";
import {IHorkos} from "../src/interfaces/IHorkos.sol";

contract SharedVectorRegistryTest is VectorFixture {
    VerdictRegistry internal registry;

    function setUp() public {
        vectorsJson = vm.readFile("../test-vectors/verdict-vectors.json");
        vm.chainId(vm.parseJsonUint(vectorsJson, ".vectors[0].chainId"));
        vm.warp(1700000100);
        (bytes32 x, bytes32 y) = _publicKey();
        (bytes32 r, bytes32 s) = _signature(0);
        bytes32 digest = vm.parseJsonBytes32(vectorsJson, ".vectors[0].digest");
        if (!P256.verify(digest, r, s, x, y)) {
            // Offline Ethereum EVM only; native Monad precompiles are never overwritten.
            P256Fallback fallbackVerifier = new P256Fallback();
            vm.etch(address(0x100), address(fallbackVerifier).code);
        }
        assertTrue(P256.verify(digest, r, s, x, y), "Canonical signature must verify");
        MockIdentity identity = new MockIdentity();
        identity.setOwner(1, address(this));
        identity.setOwner(2, address(this));
        address domain = vm.parseJsonAddress(vectorsJson, ".vectors[0].verifyingContract");
        deployCodeTo("VerdictRegistry.sol", abi.encode(identity), domain);
        registry = VerdictRegistry(domain);
        registry.bindKey(1, x, y);
        // Prevent inactive-agent rejection from masking the agentId signature mutation.
        registry.bindKey(2, x, y);
    }

    function test_AllSharedHashesAndSignatureExpectations() public view {
        (bytes32 x, bytes32 y) = _publicKey();
        assertEq(vm.parseJsonUint(vectorsJson, ".version"), 2);
        for (uint256 i; i < 14; i++) {
            string memory path = _path(i);
            Verdict memory verdict = _verdict(i);
            bytes32 domain = VerdictLib.buildDomainSeparator(
                vm.parseJsonUint(vectorsJson, string.concat(path, ".chainId")),
                vm.parseJsonAddress(vectorsJson, string.concat(path, ".verifyingContract"))
            );
            assertEq(domain, vm.parseJsonBytes32(vectorsJson, string.concat(path, ".domainSeparator")), "Domain parity");
            assertEq(VerdictLib.hashVerdictStruct(verdict), vm.parseJsonBytes32(vectorsJson, string.concat(path, ".structHash")), "Struct parity");
            bytes32 digest = VerdictLib.hashVerdict(verdict, domain);
            assertEq(digest, vm.parseJsonBytes32(vectorsJson, string.concat(path, ".digest")), "Digest parity");
            (bytes32 r, bytes32 s) = _signature(i);
            assertEq(P256.verify(digest, r, s, x, y), vm.parseJsonBool(vectorsJson, string.concat(path, ".signatureValid")), "Signature parity");
        }
    }

    function _submit(uint256 index) internal returns (bytes32) {
        (bytes32 r, bytes32 s) = _signature(index);
        return registry.submit(_verdict(index), r, s);
    }

    function _rejectSignature(uint256 index) internal {
        (bytes32 r, bytes32 s) = _signature(index);
        Verdict memory verdict = _verdict(index);
        vm.expectRevert(IHorkos.BadSignature.selector);
        registry.submit(verdict, r, s);
    }

    function test_Shared_Valid() public { assertEq(_submit(0), vm.parseJsonBytes32(vectorsJson, ".vectors[0].digest")); }
    function test_Shared_ResignedScore() public { _submit(1); }
    function test_Shared_ResignedModel() public { _submit(2); }
    function test_Shared_WrongChain() public { _rejectSignature(3); }
    function test_Shared_Expired() public {
        (bytes32 r, bytes32 s) = _signature(4);
        Verdict memory verdict = _verdict(4);
        vm.expectRevert(IHorkos.Expired.selector);
        registry.submit(verdict, r, s);
    }
    function test_Shared_TamperedAgent() public { _rejectSignature(5); }
    function test_Shared_TamperedModel() public { _rejectSignature(6); }
    function test_Shared_TamperedInput() public { _rejectSignature(7); }
    function test_Shared_TamperedPolicy() public { _rejectSignature(8); }
    function test_Shared_TamperedScore() public { _rejectSignature(9); }
    function test_Shared_TamperedObservedAt() public { _rejectSignature(10); }
    function test_Shared_TamperedExpiry() public { _rejectSignature(11); }
    function test_Shared_TamperedNonce() public { _rejectSignature(12); }
    function test_Shared_WrongRegistry() public { _rejectSignature(13); }
}
