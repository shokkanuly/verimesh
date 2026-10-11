// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerdictLib} from "../src/libs/VerdictLib.sol";
import {Verdict} from "../src/interfaces/IHorkos.sol";

/// @title VectorsTest
/// @notice Asserts that Solidity computes identical digests to test-vectors/verdict-vectors.json
contract VectorsTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile("../test-vectors/verdict-vectors.json");
    }

    function test_Vector_Valid() public view {
        uint256 chainId = vm.parseJsonUint(json, ".vectors[0].chainId");
        address contractAddr = vm.parseJsonAddress(json, ".vectors[0].verifyingContract");
        bytes32 expectedDomain = vm.parseJsonBytes32(json, ".vectors[0].domainSeparator");
        bytes32 expectedStructHash = vm.parseJsonBytes32(json, ".vectors[0].structHash");
        bytes32 expectedDigest = vm.parseJsonBytes32(json, ".vectors[0].digest");

        bytes32 calculatedDomain = VerdictLib.buildDomainSeparator(chainId, contractAddr);
        assertEq(calculatedDomain, expectedDomain, "Domain separator mismatch");

        Verdict memory v = Verdict({
            agentId: vm.parseJsonUint(json, ".vectors[0].verdict.agentId"),
            modelHash: vm.parseJsonBytes32(json, ".vectors[0].verdict.modelHash"),
            inputHash: vm.parseJsonBytes32(json, ".vectors[0].verdict.inputHash"),
            policyId: vm.parseJsonBytes32(json, ".vectors[0].verdict.policyId"),
            scoreBps: uint16(vm.parseJsonUint(json, ".vectors[0].verdict.scoreBps")),
            observedAt: uint64(vm.parseJsonUint(json, ".vectors[0].verdict.observedAt")),
            expiry: uint64(vm.parseJsonUint(json, ".vectors[0].verdict.expiry")),
            nonce: uint64(vm.parseJsonUint(json, ".vectors[0].verdict.nonce"))
        });

        bytes32 calculatedStructHash = VerdictLib.hashVerdictStruct(v);
        assertEq(calculatedStructHash, expectedStructHash, "StructHash mismatch");

        bytes32 calculatedDigest = VerdictLib.hashVerdict(v, calculatedDomain);
        assertEq(calculatedDigest, expectedDigest, "Digest mismatch");
    }

    function test_Vector_TweakedScore() public view {
        bytes32 expectedStructHash = vm.parseJsonBytes32(json, ".vectors[1].structHash");
        bytes32 expectedDigest = vm.parseJsonBytes32(json, ".vectors[1].digest");
        bytes32 domain = vm.parseJsonBytes32(json, ".vectors[1].domainSeparator");

        Verdict memory v = Verdict({
            agentId: vm.parseJsonUint(json, ".vectors[1].verdict.agentId"),
            modelHash: vm.parseJsonBytes32(json, ".vectors[1].verdict.modelHash"),
            inputHash: vm.parseJsonBytes32(json, ".vectors[1].verdict.inputHash"),
            policyId: vm.parseJsonBytes32(json, ".vectors[1].verdict.policyId"),
            scoreBps: uint16(vm.parseJsonUint(json, ".vectors[1].verdict.scoreBps")),
            observedAt: uint64(vm.parseJsonUint(json, ".vectors[1].verdict.observedAt")),
            expiry: uint64(vm.parseJsonUint(json, ".vectors[1].verdict.expiry")),
            nonce: uint64(vm.parseJsonUint(json, ".vectors[1].verdict.nonce"))
        });

        bytes32 structHash = VerdictLib.hashVerdictStruct(v);
        assertEq(structHash, expectedStructHash, "StructHash mismatch for tweaked score");

        bytes32 digest = VerdictLib.hashVerdict(v, domain);
        assertEq(digest, expectedDigest, "Digest mismatch for tweaked score");
    }

    function test_Vector_TweakedModel() public view {
        bytes32 expectedStructHash = vm.parseJsonBytes32(json, ".vectors[2].structHash");
        bytes32 expectedDigest = vm.parseJsonBytes32(json, ".vectors[2].digest");
        bytes32 domain = vm.parseJsonBytes32(json, ".vectors[2].domainSeparator");

        Verdict memory v = Verdict({
            agentId: vm.parseJsonUint(json, ".vectors[2].verdict.agentId"),
            modelHash: vm.parseJsonBytes32(json, ".vectors[2].verdict.modelHash"),
            inputHash: vm.parseJsonBytes32(json, ".vectors[2].verdict.inputHash"),
            policyId: vm.parseJsonBytes32(json, ".vectors[2].verdict.policyId"),
            scoreBps: uint16(vm.parseJsonUint(json, ".vectors[2].verdict.scoreBps")),
            observedAt: uint64(vm.parseJsonUint(json, ".vectors[2].verdict.observedAt")),
            expiry: uint64(vm.parseJsonUint(json, ".vectors[2].verdict.expiry")),
            nonce: uint64(vm.parseJsonUint(json, ".vectors[2].verdict.nonce"))
        });

        bytes32 structHash = VerdictLib.hashVerdictStruct(v);
        assertEq(structHash, expectedStructHash, "StructHash mismatch for tweaked model");

        bytes32 digest = VerdictLib.hashVerdict(v, domain);
        assertEq(digest, expectedDigest, "Digest mismatch for tweaked model");
    }

    function test_Vector_WrongChainId() public view {
        uint256 chainId = vm.parseJsonUint(json, ".vectors[3].chainId");
        address contractAddr = vm.parseJsonAddress(json, ".vectors[3].verifyingContract");
        bytes32 expectedDomain = vm.parseJsonBytes32(json, ".vectors[3].domainSeparator");
        bytes32 expectedStructHash = vm.parseJsonBytes32(json, ".vectors[3].structHash");
        bytes32 expectedDigest = vm.parseJsonBytes32(json, ".vectors[3].digest");

        bytes32 domain = VerdictLib.buildDomainSeparator(chainId, contractAddr);
        assertEq(domain, expectedDomain, "Domain separator mismatch for wrong chainId");

        Verdict memory v = Verdict({
            agentId: vm.parseJsonUint(json, ".vectors[3].verdict.agentId"),
            modelHash: vm.parseJsonBytes32(json, ".vectors[3].verdict.modelHash"),
            inputHash: vm.parseJsonBytes32(json, ".vectors[3].verdict.inputHash"),
            policyId: vm.parseJsonBytes32(json, ".vectors[3].verdict.policyId"),
            scoreBps: uint16(vm.parseJsonUint(json, ".vectors[3].verdict.scoreBps")),
            observedAt: uint64(vm.parseJsonUint(json, ".vectors[3].verdict.observedAt")),
            expiry: uint64(vm.parseJsonUint(json, ".vectors[3].verdict.expiry")),
            nonce: uint64(vm.parseJsonUint(json, ".vectors[3].verdict.nonce"))
        });

        bytes32 structHash = VerdictLib.hashVerdictStruct(v);
        assertEq(structHash, expectedStructHash, "StructHash mismatch for wrong chainId");

        bytes32 digest = VerdictLib.hashVerdict(v, domain);
        assertEq(digest, expectedDigest, "Digest mismatch for wrong chainId");
    }

    function test_Vector_Expired() public view {
        bytes32 expectedStructHash = vm.parseJsonBytes32(json, ".vectors[4].structHash");
        bytes32 expectedDigest = vm.parseJsonBytes32(json, ".vectors[4].digest");
        bytes32 domain = vm.parseJsonBytes32(json, ".vectors[4].domainSeparator");

        Verdict memory v = Verdict({
            agentId: vm.parseJsonUint(json, ".vectors[4].verdict.agentId"),
            modelHash: vm.parseJsonBytes32(json, ".vectors[4].verdict.modelHash"),
            inputHash: vm.parseJsonBytes32(json, ".vectors[4].verdict.inputHash"),
            policyId: vm.parseJsonBytes32(json, ".vectors[4].verdict.policyId"),
            scoreBps: uint16(vm.parseJsonUint(json, ".vectors[4].verdict.scoreBps")),
            observedAt: uint64(vm.parseJsonUint(json, ".vectors[4].verdict.observedAt")),
            expiry: uint64(vm.parseJsonUint(json, ".vectors[4].verdict.expiry")),
            nonce: uint64(vm.parseJsonUint(json, ".vectors[4].verdict.nonce"))
        });

        bytes32 structHash = VerdictLib.hashVerdictStruct(v);
        assertEq(structHash, expectedStructHash, "StructHash mismatch for expired vector");

        bytes32 digest = VerdictLib.hashVerdict(v, domain);
        assertEq(digest, expectedDigest, "Digest mismatch for expired vector");
    }
}
