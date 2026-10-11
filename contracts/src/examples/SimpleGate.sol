// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HorkosConsumer} from "../HorkosConsumer.sol";
import {IHorkos} from "../interfaces/IHorkos.sol";

/// @title SimpleGate
/// @notice Minimal example showing 10-line integration of Horkos
contract SimpleGate is HorkosConsumer {
    uint256 public immutable trustedAgentId;
    bytes32 public immutable trustedPolicyId;
    uint16  public immutable minScoreBps;
    uint64  public immutable maxAge;

    event ActionGated(bytes32 indexed verdictId, address indexed caller);

    constructor(
        IHorkos registry,
        uint256 agentId,
        bytes32 policyId,
        uint16 minScore,
        uint64 allowedAge
    ) HorkosConsumer(registry) {
        trustedAgentId = agentId;
        trustedPolicyId = policyId;
        minScoreBps = minScore;
        maxAge = allowedAge;
    }

    /// @notice Releases or executes an action only if the machine verdict is valid
    function execute(bytes32 verdictId) external {
        _consume(verdictId, trustedAgentId, trustedPolicyId, minScoreBps, maxAge);
        emit ActionGated(verdictId, msg.sender);
    }
}
