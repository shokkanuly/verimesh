// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InputHashLib} from "../src/libs/InputHashLib.sol";

contract InputVectorsTest is Test {
    string internal json;

    function setUp() public {
        json = vm.readFile("../test-vectors/input-vectors.json");
    }

    function _read(uint256 index) internal view returns (InputHashLib.NormalizedEvent memory input) {
        string memory path = string.concat(".vectors[", vm.toString(index), "].event");
        uint256 timestamp = vm.parseJsonUint(json, string.concat(path, ".timestamp"));
        uint256 nonce = vm.parseJsonUint(json, string.concat(path, ".nonce"));
        require(timestamp <= type(uint64).max && nonce <= type(uint64).max, "Invalid fixture width");
        input = InputHashLib.NormalizedEvent({
            routeId: vm.parseJsonBytes32(json, string.concat(path, ".routeId")),
            amount: vm.parseJsonUint(json, string.concat(path, ".amount")),
            sourceChainId: vm.parseJsonUint(json, string.concat(path, ".sourceChainId")),
            targetChainId: vm.parseJsonUint(json, string.concat(path, ".targetChainId")),
            recipient: vm.parseJsonAddress(json, string.concat(path, ".recipient")),
            timestamp: uint64(timestamp), nonce: uint64(nonce)
        });
    }

    function test_AllSharedInputVectors() public view {
        assertEq(vm.parseJsonUint(json, ".vectorCount"), 12);
        bytes32 base = InputHashLib.hashInput(_read(0));
        for (uint256 i; i < 12; ++i) {
            string memory path = string.concat(".vectors[", vm.toString(i), "]");
            InputHashLib.NormalizedEvent memory input = _read(i);
            bytes memory encoded = abi.encode(input.routeId, input.amount, input.sourceChainId,
                input.targetChainId, input.recipient, input.timestamp, input.nonce);
            assertEq(encoded.length, 224);
            assertEq(encoded, vm.parseJsonBytes(json, string.concat(path, ".encoded")));
            assertEq(InputHashLib.hashInput(input), vm.parseJsonBytes32(json, string.concat(path, ".inputHash")));
            if (i != 0) assertNotEq(InputHashLib.hashInput(input), base);
        }
    }

    function test_InputEncodingIsNotPacked() public view {
        InputHashLib.NormalizedEvent memory input = _read(0);
        bytes32 packed = keccak256(abi.encodePacked(input.routeId, input.amount, input.sourceChainId,
            input.targetChainId, input.recipient, input.timestamp, input.nonce));
        assertNotEq(InputHashLib.hashInput(input), packed);
    }

    function testFuzz_InputTupleEncoding(InputHashLib.NormalizedEvent memory input) public pure {
        assertEq(InputHashLib.hashInput(input), keccak256(abi.encode(input)));
    }
}
