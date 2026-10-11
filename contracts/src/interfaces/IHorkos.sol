// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct Verdict {
    uint256 agentId;      // ERC-8004 identity
    bytes32 modelHash;    // keccak256(scorer code + config)
    bytes32 inputHash;    // keccak256(abi.encode(normalizedEvent))
    bytes32 policyId;     // consumer policy version this score targets
    uint16  scoreBps;     // 0..10000
    uint64  observedAt;   // unix seconds
    uint64  expiry;       // unix seconds
    uint64  nonce;        // sentinel-chosen uniqueness value
}

struct StoredVerdict {
    uint256 agentId;
    bytes32 modelHash;
    bytes32 policyId;
    uint16  scoreBps;
    uint64  observedAt;
    uint64  submittedAt;
    uint64  expiry;
    uint32  keyEpoch;     // epoch of the key that signed it
}

/// @title IHorkos
/// @notice Core interface for the Horkos verdict registry
interface IHorkos {
    event AgentKeyBound(uint256 indexed agentId, uint32 indexed epoch, bytes32 x, bytes32 y);
    event AgentKeyRevoked(uint256 indexed agentId, uint32 indexed epoch);
    event VerdictAccepted(
        bytes32 indexed verdictId,
        uint256 indexed agentId,
        bytes32 indexed policyId,
        uint16 scoreBps,
        bytes32 modelHash,
        bytes32 inputHash,
        uint64 observedAt
    );

    error NotAgentOwner();
    error KeyNotActive();
    error Expired();
    error AlreadyAccepted();
    error BadSignature();
    error InvalidKey();
    error UnknownVerdict();

    function bindKey(uint256 agentId, bytes32 x, bytes32 y) external;
    function revokeKey(uint256 agentId) external;

    function submit(Verdict calldata v, bytes32 r, bytes32 s) external returns (bytes32 verdictId);

    function hashVerdict(Verdict calldata v) external view returns (bytes32);
    function getVerdict(bytes32 verdictId) external view returns (StoredVerdict memory);
    function isValid(
        bytes32 verdictId,
        uint256 agentId,
        bytes32 policyId,
        uint16  minScoreBps,
        uint64  maxAgeSeconds
    ) external view returns (bool);
    function currentKey(uint256 agentId) external view returns (bytes32 x, bytes32 y, uint32 epoch, bool active);
}
