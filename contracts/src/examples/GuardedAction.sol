// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HorkosConsumer} from "../HorkosConsumer.sol";
import {IHorkos, Verdict} from "../interfaces/IHorkos.sol";

/// @notice First-party integration fixture; emits an action, never holds funds.
contract GuardedAction is HorkosConsumer {
    uint256 public immutable trustedAgentId;
    bytes32 public immutable trustedPolicyId;
    bytes32 public immutable trustedModelHash;
    address public immutable authorizedCaller;
    uint256 public actions;

    error Unauthorized();
    error WrongCommitment();
    error InvalidConfiguration();
    event Executed(bytes32 indexed verdictId, bytes32 indexed payload);

    constructor(IHorkos registry, uint256 agent, bytes32 policy, bytes32 model, address caller)
        HorkosConsumer(registry)
    {
        if (address(registry).code.length == 0 || caller == address(0) || policy == bytes32(0) || model == bytes32(0)) {
            revert InvalidConfiguration();
        }
        trustedAgentId = agent;
        trustedPolicyId = policy;
        trustedModelHash = model;
        authorizedCaller = caller;
    }

    function actionHash(bytes32 payload) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, authorizedCaller, payload));
    }

    function execute(Verdict calldata verdict, bytes32 payload) external {
        if (msg.sender != authorizedCaller) revert Unauthorized();
        bytes32 id = horkos.hashVerdict(verdict);
        _consume(id, trustedAgentId, trustedPolicyId, 8000, 300);
        if (verdict.modelHash != trustedModelHash || verdict.inputHash != actionHash(payload)) revert WrongCommitment();
        actions++;
        emit Executed(id, payload);
    }
}
