// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8004Identity} from "../../src/interfaces/IERC8004Identity.sol";

/// @title MockIdentity
/// @notice Mock implementation of ERC-8004 identity for unit tests
contract MockIdentity is IERC8004Identity {
    mapping(uint256 agentId => address) private _owners;

    function setOwner(uint256 agentId, address owner) external {
        _owners[agentId] = owner;
    }

    function ownerOf(uint256 agentId) external view override returns (address) {
        return _owners[agentId];
    }
}
