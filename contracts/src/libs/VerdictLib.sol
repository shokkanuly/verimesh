// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Verdict} from "../interfaces/IHorkos.sol";

/// @title VerdictLib
/// @notice EIP-712 typing, domain separator, and struct hash computation for Horkos Verdicts
library VerdictLib {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 internal constant VERDICT_TYPEHASH = keccak256(
        "Verdict(uint256 agentId,bytes32 modelHash,bytes32 inputHash,bytes32 policyId,uint16 scoreBps,uint64 observedAt,uint64 expiry,uint64 nonce)"
    );

    bytes32 internal constant NAME_HASH = keccak256("Horkos");
    bytes32 internal constant VERSION_HASH = keccak256("1");

    function buildDomainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                chainId,
                verifyingContract
            )
        );
    }

    function hashVerdictStruct(Verdict memory v) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                v.agentId,
                v.modelHash,
                v.inputHash,
                v.policyId,
                v.scoreBps,
                v.observedAt,
                v.expiry,
                v.nonce
            )
        );
    }

    function hashVerdict(Verdict memory v, bytes32 domainSeparator) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
                hashVerdictStruct(v)
            )
        );
    }
}
