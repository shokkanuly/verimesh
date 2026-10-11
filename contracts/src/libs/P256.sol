// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title P256
/// @notice Wrapper for the EIP-7951 / RIP-7212 P256 verification precompile at 0x100
library P256 {
    address internal constant PRECOMPILE = address(0x100);

    /// @notice Returns true only if the precompile succeeds and returns uint256(1)
    function verify(bytes32 h, bytes32 r, bytes32 s, bytes32 x, bytes32 y)
        internal view returns (bool)
    {
        (bool ok, bytes memory ret) = PRECOMPILE.staticcall(abi.encode(h, r, s, x, y)); // 160 bytes
        if (!ok || ret.length != 32) return false;
        return abi.decode(ret, (uint256)) == 1;
    }
}
