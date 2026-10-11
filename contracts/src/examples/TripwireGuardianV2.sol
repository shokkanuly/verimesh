// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HorkosConsumer} from "../HorkosConsumer.sol";
import {IHorkos, StoredVerdict} from "../interfaces/IHorkos.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TripwireGuardianV2
/// @notice Circuit breaker reference consumer integrating Horkos
contract TripwireGuardianV2 is HorkosConsumer, Ownable2Step {
    uint16 public constant THROTTLE_BPS = 6500;
    uint16 public constant DELAY_BPS = 8500;
    uint16 public constant FREEZE_BPS = 9500;

    mapping(uint256 agentId => bool) public trustedAgents;
    mapping(bytes32 modelHash => bool) public trustedModels;
    bytes32 public immutable policyId;
    uint64 public constant MAX_AGE = 300;
    uint64 public constant THROTTLE_WINDOW = 1 hours;
    uint64 public constant DELAY_SECONDS = 1800;
    uint64 public constant MAX_FREEZE = 1 days;

    address public bridge;
    uint256 public outflowCap = 100 ether;
    uint256 public windowOutflow;
    uint64 public windowStartedAt;
    uint64 public lastTriggeredAt;
    uint64 public tierUntil;

    enum Tier { NONE, THROTTLE, DELAY, FREEZE }
    Tier private _tier;

    error NotBridge();
    error InvalidBridgeConfiguration();
    error OutflowBlocked(Tier tier, uint64 until);
    error OutflowCapExceeded();

    event ActionApplied(bytes32 indexed verdictId, uint16 scoreBps, Tier tier);
    event BridgeConfigured(address indexed bridge, uint256 outflowCap);
    event CircuitReset(address indexed guardian);
    event OutflowRecorded(uint256 amount, uint256 windowOutflow);
    event TrustedAgentSet(uint256 indexed agentId, bool trusted);
    event TrustedModelSet(bytes32 indexed modelHash, bool trusted);

    constructor(IHorkos registry, bytes32 _policyId) HorkosConsumer(registry) Ownable(msg.sender) {
        policyId = _policyId;
    }

    /// @notice Allow or revoke a sentinel identity; only human governance can change trust.
    function setTrustedAgent(uint256 agentId, bool trusted) external onlyOwner {
        trustedAgents[agentId] = trusted;
        emit TrustedAgentSet(agentId, trusted);
    }

    /// @notice Allow or revoke a scorer model.
    function setTrustedModel(bytes32 modelHash, bool trusted) external onlyOwner {
        trustedModels[modelHash] = trusted;
        emit TrustedModelSet(modelHash, trusted);
    }

    /// @notice Configure the bridge adapter and its throttle cap in the token's smallest unit.
    function configureBridge(address adapter, uint256 cap) external onlyOwner {
        if (adapter == address(0) || cap == 0) revert InvalidBridgeConfiguration();
        bridge = adapter;
        outflowCap = cap;
        emit BridgeConfigured(adapter, cap);
    }

    /// @notice Return the effective tier, including automatic expiry of bounded restrictions.
    function currentTier() public view returns (Tier) {
        return block.timestamp < tierUntil ? _tier : Tier.NONE;
    }

    /// @notice Human governance can lift a restriction before its cap expires.
    function resetCircuit() external onlyOwner {
        _tier = Tier.NONE;
        tierUntil = 0;
        emit CircuitReset(msg.sender);
    }

    /// @notice The bridge calls this atomically before releasing funds.
    function recordOutflow(uint256 amount) external {
        if (msg.sender != bridge) revert NotBridge();
        Tier tier = currentTier();
        if (tier == Tier.DELAY || tier == Tier.FREEZE) revert OutflowBlocked(tier, tierUntil);

        if (block.timestamp >= uint256(windowStartedAt) + THROTTLE_WINDOW) {
            windowStartedAt = uint64(block.timestamp);
            windowOutflow = 0;
        }
        if (tier == Tier.THROTTLE && (windowOutflow > outflowCap || amount > outflowCap - windowOutflow)) {
            revert OutflowCapExceeded();
        }
        windowOutflow += amount;
        emit OutflowRecorded(amount, windowOutflow);
    }

    /// @notice Anyone may relay a trusted, fresh, single-use verdict.
    function applyVerdict(bytes32 verdictId, uint256 agentId) external {
        require(trustedAgents[agentId], "Untrusted agent");
        StoredVerdict memory sv = horkos.getVerdict(verdictId);
        require(trustedModels[sv.modelHash], "Untrusted model");

        _consume(verdictId, agentId, policyId, THROTTLE_BPS, MAX_AGE);

        Tier appliedTier;
        if (sv.scoreBps >= FREEZE_BPS) {
            appliedTier = Tier.FREEZE;
        } else if (sv.scoreBps >= DELAY_BPS) {
            appliedTier = Tier.DELAY;
        } else {
            appliedTier = Tier.THROTTLE;
        }

        // A sentinel can escalate, but cannot lower or indefinitely renew an active restriction.
        if (appliedTier > currentTier()) {
            _tier = appliedTier;
            uint64 duration = appliedTier == Tier.FREEZE ? MAX_FREEZE
                : appliedTier == Tier.DELAY ? DELAY_SECONDS : THROTTLE_WINDOW;
            tierUntil = uint64(block.timestamp) + duration;
        }
        lastTriggeredAt = uint64(block.timestamp);
        emit ActionApplied(verdictId, sv.scoreBps, currentTier());
    }
}
