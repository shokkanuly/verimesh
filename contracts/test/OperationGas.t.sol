// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VectorFixture} from "./helpers/VectorFixture.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {Verdict} from "../src/libs/VerdictLib.sol";
import {P256} from "../src/libs/P256.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";

/// Scoped callee gas only: no deployment, JSON parsing, signing or assertion gas.
contract OperationGasTest is VectorFixture {
    VerdictRegistry internal registry;
    TripwireGuardianV2 internal guardian;
    MockIdentity internal identity;
    string internal group;

    function setUp() public {
        uint256 executionChainId = block.chainid;
        vectorsJson = vm.readFile("../test-vectors/verdict-vectors.json");
        vm.chainId(vm.parseJsonUint(vectorsJson, ".vectors[0].chainId"));
        vm.warp(1700000100);
        (bytes32 x, bytes32 y) = _publicKey();
        (bytes32 r, bytes32 s) = _signature(0);
        bytes32 digest = vm.parseJsonBytes32(vectorsJson, ".vectors[0].digest");
        bool native = address(0x100).code.length == 0 && P256.verify(digest, r, s, x, y);
        if (native) require(executionChainId == 10143, "Native gas benchmark requires Monad testnet EVM");
        group = native ? "MonadForkNative" : "EthereumLocalFallback";
        if (!native) {
            P256Fallback fallbackVerifier = new P256Fallback();
            vm.etch(address(0x100), address(fallbackVerifier).code);
        }
        identity = new MockIdentity();
        identity.setOwner(1, address(this));
        identity.setOwner(3, address(this));
        address domain = vm.parseJsonAddress(vectorsJson, ".vectors[0].verifyingContract");
        deployCodeTo("VerdictRegistry.sol", abi.encode(identity), domain);
        registry = VerdictRegistry(domain);
        registry.bindKey(1, x, y);
        Verdict memory verdict = _verdict(0);
        guardian = new TripwireGuardianV2(registry, verdict.policyId);
        guardian.setTrustedAgent(1, true);
        guardian.setTrustedModel(verdict.modelHash, true);
    }

    function _cold() internal {
        vm.cool(address(registry));
        vm.cool(address(guardian));
        vm.cool(address(identity));
        vm.cool(address(0x100));
    }

    function _submit() internal returns (bytes32) {
        (bytes32 r, bytes32 s) = _signature(0);
        return registry.submit(_verdict(0), r, s);
    }

    function testGas_BindKeyInitial() public {
        (bytes32 x, bytes32 y) = _publicKey();
        _cold();
        registry.bindKey(3, x, y);
        uint256 gasUsed = vm.snapshotGasLastFrame(group, "bindKey_initial");
        assertGt(gasUsed, 0);
    }

    function testGas_BindKeyRotate() public {
        (bytes32 x, bytes32 y) = _publicKey();
        _cold();
        registry.bindKey(1, x, y);
        uint256 gasUsed = vm.snapshotGasLastFrame(group, "bindKey_rotate");
        assertGt(gasUsed, 0);
    }

    function testGas_Submit() public {
        (bytes32 r, bytes32 s) = _signature(0);
        Verdict memory verdict = _verdict(0);
        _cold();
        bytes32 id = registry.submit(verdict, r, s);
        uint256 gasUsed = vm.snapshotGasLastFrame(group, "submit");
        assertEq(id, vm.parseJsonBytes32(vectorsJson, ".vectors[0].digest"));
        assertGt(gasUsed, 0);
    }

    function testGas_IsValidAccepted() public {
        bytes32 id = _submit();
        Verdict memory verdict = _verdict(0);
        _cold();
        bool valid = registry.isValid(id, 1, verdict.policyId, 8000, 300);
        uint256 gasUsed = vm.snapshotGasLastFrame(group, "isValid_accepted");
        assertTrue(valid);
        assertGt(gasUsed, 0);
    }

    function testGas_ApplyVerdictDelay() public {
        bytes32 id = _submit();
        _cold();
        guardian.applyVerdict(id, 1);
        uint256 gasUsed = vm.snapshotGasLastFrame(group, "applyVerdict_delay");
        assertEq(uint256(guardian.currentTier()), uint256(TripwireGuardianV2.Tier.DELAY));
        assertGt(gasUsed, 0);
    }
}
