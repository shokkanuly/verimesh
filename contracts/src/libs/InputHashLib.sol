// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The seven-field normalized-event commitment used by the TypeScript SDK.
library InputHashLib {
    struct NormalizedEvent {
        bytes32 routeId;
        uint256 amount;
        uint256 sourceChainId;
        uint256 targetChainId;
        address recipient;
        uint64 timestamp;
        uint64 nonce;
    }

    function hashInput(NormalizedEvent memory input) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            input.routeId, input.amount, input.sourceChainId, input.targetChainId,
            input.recipient, input.timestamp, input.nonce
        ));
    }
}
