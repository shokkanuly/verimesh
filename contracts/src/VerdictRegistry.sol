// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHorkos, Verdict, StoredVerdict} from "./interfaces/IHorkos.sol";
import {IERC8004Identity} from "./interfaces/IERC8004Identity.sol";
import {VerdictLib} from "./libs/VerdictLib.sol";
import {P256} from "./libs/P256.sol";

/// @title VerdictRegistry
/// @notice Registry for machine decision keys, verdict submissions, and validity checks
contract VerdictRegistry is IHorkos {
    IERC8004Identity public immutable identityRegistry;
    bytes32 public immutable DOMAIN_SEPARATOR;

    struct AgentKey {
        bytes32 x;
        bytes32 y;
        uint32 epoch;
        bool active;
    }

    mapping(uint256 agentId => AgentKey) private _keys;
    mapping(bytes32 verdictId => StoredVerdict) private _verdicts;

    constructor(IERC8004Identity _identityRegistry) {
        identityRegistry = _identityRegistry;
        DOMAIN_SEPARATOR = VerdictLib.buildDomainSeparator(block.chainid, address(this));
    }

    /// @inheritdoc IHorkos
    function bindKey(uint256 agentId, bytes32 x, bytes32 y) external override {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        if (x == bytes32(0) || y == bytes32(0)) revert InvalidKey();

        AgentKey storage k = _keys[agentId];
        uint32 nextEpoch = k.epoch + 1;
        k.x = x;
        k.y = y;
        k.epoch = nextEpoch;
        k.active = true;

        emit AgentKeyBound(agentId, nextEpoch, x, y);
    }

    /// @inheritdoc IHorkos
    function revokeKey(uint256 agentId) external override {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        AgentKey storage k = _keys[agentId];
        if (!k.active) revert KeyNotActive();

        k.active = false;
        emit AgentKeyRevoked(agentId, k.epoch);
    }

    /// @inheritdoc IHorkos
    function submit(Verdict calldata v, bytes32 r, bytes32 s) external override returns (bytes32 verdictId) {
        if (block.timestamp > v.expiry) revert Expired();

        AgentKey storage k = _keys[v.agentId];
        if (!k.active) revert KeyNotActive();

        verdictId = VerdictLib.hashVerdict(v, DOMAIN_SEPARATOR);
        if (_verdicts[verdictId].submittedAt != 0) revert AlreadyAccepted();

        if (!P256.verify(verdictId, r, s, k.x, k.y)) revert BadSignature();

        _verdicts[verdictId] = StoredVerdict({
            agentId: v.agentId,
            modelHash: v.modelHash,
            policyId: v.policyId,
            scoreBps: v.scoreBps,
            observedAt: v.observedAt,
            submittedAt: uint64(block.timestamp),
            expiry: v.expiry,
            keyEpoch: k.epoch
        });

        emit VerdictAccepted(
            verdictId,
            v.agentId,
            v.policyId,
            v.scoreBps,
            v.modelHash,
            v.inputHash,
            v.observedAt
        );
    }

    /// @inheritdoc IHorkos
    function hashVerdict(Verdict calldata v) external view override returns (bytes32) {
        return VerdictLib.hashVerdict(v, DOMAIN_SEPARATOR);
    }

    /// @inheritdoc IHorkos
    function getVerdict(bytes32 verdictId) external view override returns (StoredVerdict memory) {
        StoredVerdict memory sv = _verdicts[verdictId];
        if (sv.submittedAt == 0) revert UnknownVerdict();
        return sv;
    }

    /// @inheritdoc IHorkos
    function isValid(
        bytes32 verdictId,
        uint256 agentId,
        bytes32 policyId,
        uint16 minScoreBps,
        uint64 maxAgeSeconds
    ) external view override returns (bool) {
        StoredVerdict storage sv = _verdicts[verdictId];
        if (sv.submittedAt == 0) return false;
        if (sv.agentId != agentId || sv.policyId != policyId) return false;
        if (sv.scoreBps < minScoreBps) return false;
        if (block.timestamp > sv.expiry) return false;
        if (block.timestamp < sv.observedAt) return false;
        if (maxAgeSeconds != 0 && (block.timestamp - sv.observedAt > maxAgeSeconds)) return false;

        AgentKey storage k = _keys[agentId];
        if (!k.active || k.epoch != sv.keyEpoch) return false;

        return true;
    }

    /// @inheritdoc IHorkos
    function currentKey(uint256 agentId) external view override returns (bytes32 x, bytes32 y, uint32 epoch, bool active) {
        AgentKey storage k = _keys[agentId];
        return (k.x, k.y, k.epoch, k.active);
    }
}
