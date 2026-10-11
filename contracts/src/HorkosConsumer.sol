// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHorkos} from "./interfaces/IHorkos.sol";

/// @title HorkosConsumer
/// @notice Base contract for consumers that verify and consume machine decision verdicts
abstract contract HorkosConsumer {
    IHorkos public immutable horkos;
    mapping(bytes32 verdictId => bool) public consumed;

    error VerdictInvalid();
    error VerdictConsumed();

    event VerdictConsumedEvent(bytes32 indexed verdictId, address indexed consumer);

    constructor(IHorkos v) {
        horkos = v;
    }

    /// @dev Internal helper that enforces single-use consumption and validity
    function _consume(
        bytes32 id,
        uint256 agentId,
        bytes32 policyId,
        uint16 minScoreBps,
        uint64 maxAge
    ) internal {
        if (consumed[id]) revert VerdictConsumed();
        if (!horkos.isValid(id, agentId, policyId, minScoreBps, maxAge)) revert VerdictInvalid();
        consumed[id] = true;
        emit VerdictConsumedEvent(id, address(this));
    }
}
