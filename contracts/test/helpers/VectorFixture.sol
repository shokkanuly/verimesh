// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Verdict} from "../../src/interfaces/IHorkos.sol";

abstract contract VectorFixture is Test {
    string internal vectorsJson;

    function _path(uint256 index) internal pure returns (string memory) {
        return string.concat(".vectors[", vm.toString(index), "]");
    }

    function _verdict(uint256 index) internal view returns (Verdict memory) {
        string memory path = string.concat(_path(index), ".verdict");
        return Verdict({
            agentId: vm.parseJsonUint(vectorsJson, string.concat(path, ".agentId")),
            modelHash: vm.parseJsonBytes32(vectorsJson, string.concat(path, ".modelHash")),
            inputHash: vm.parseJsonBytes32(vectorsJson, string.concat(path, ".inputHash")),
            policyId: vm.parseJsonBytes32(vectorsJson, string.concat(path, ".policyId")),
            scoreBps: uint16(vm.parseJsonUint(vectorsJson, string.concat(path, ".scoreBps"))),
            observedAt: uint64(vm.parseJsonUint(vectorsJson, string.concat(path, ".observedAt"))),
            expiry: uint64(vm.parseJsonUint(vectorsJson, string.concat(path, ".expiry"))),
            nonce: uint64(vm.parseJsonUint(vectorsJson, string.concat(path, ".nonce")))
        });
    }

    function _signature(uint256 index) internal view returns (bytes32 r, bytes32 s) {
        r = vm.parseJsonBytes32(vectorsJson, string.concat(_path(index), ".signature.r"));
        s = vm.parseJsonBytes32(vectorsJson, string.concat(_path(index), ".signature.s"));
    }

    function _publicKey() internal view returns (bytes32 x, bytes32 y) {
        x = vm.parseJsonBytes32(vectorsJson, ".vectors[0].signer.publicKey.x");
        y = vm.parseJsonBytes32(vectorsJson, ".vectors[0].signer.publicKey.y");
    }
}
