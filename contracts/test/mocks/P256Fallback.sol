// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FCL_ecdsa} from "./fcl/FCL_ecdsa.sol";

/// @title P256Fallback
/// @notice Solidity P-256 verifier etched at 0x100 for local Foundry tests
contract P256Fallback {
    /// @dev Expected input is 160 bytes: hash (32), r (32), s (32), x (32), y (32)
    /// Returns 32 bytes: uint256(1) on valid signature, uint256(0) on failure
    fallback(bytes calldata input) external returns (bytes memory) {
        if (input.length != 160) {
            return abi.encode(uint256(0));
        }
        (bytes32 h, bytes32 r, bytes32 s, bytes32 x, bytes32 y) = abi.decode(
            input,
            (bytes32, bytes32, bytes32, bytes32, bytes32)
        );
        bool valid = verifySignature(h, r, s, x, y);
        return abi.encode(valid ? uint256(1) : uint256(0));
    }

    function verifySignature(
        bytes32 h,
        bytes32 r,
        bytes32 s,
        bytes32 x,
        bytes32 y
    ) public view virtual returns (bool) {
        if (x == bytes32(0) || y == bytes32(0) || r == bytes32(0) || s == bytes32(0)) {
            return false;
        }
        return FCL_ecdsa.ecdsa_verify(h, uint256(r), uint256(s), uint256(x), uint256(y));
    }
}
