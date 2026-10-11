// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004Identity
/// @notice Minimal slice of the ERC-8004 identity registry used by Horkos
interface IERC8004Identity {
    function ownerOf(uint256 agentId) external view returns (address);
}
