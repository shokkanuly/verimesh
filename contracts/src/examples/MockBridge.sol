// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TripwireGuardianV2} from "./TripwireGuardianV2.sol";

/// @notice Native-currency reference adapter, not a production cross-chain bridge.
contract MockBridge is Ownable2Step, ReentrancyGuard {
    TripwireGuardianV2 public immutable guardian;

    error InvalidGuardian();
    error InvalidRelease();
    error TransferFailed();

    event Released(address indexed recipient, uint256 amount);

    constructor(TripwireGuardianV2 guardian_) Ownable(msg.sender) {
        if (address(guardian_).code.length == 0) revert InvalidGuardian();
        guardian = guardian_;
    }

    receive() external payable {}

    function release(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || amount == 0) revert InvalidRelease();
        guardian.recordOutflow(amount);
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Released(recipient, amount);
    }
}
