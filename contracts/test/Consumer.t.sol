// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {HorkosConsumer} from "../src/HorkosConsumer.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {IHorkos, Verdict} from "../src/interfaces/IHorkos.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {P256Fallback} from "./mocks/P256Fallback.sol";

contract ConsumerTest is Test {
    VerdictRegistry public registry;
    MockIdentity public identity;
    P256Fallback public p256Fallback;
    SimpleGate public gate1;
    SimpleGate public gate2;

    address internal constant OWNER = address(0xAA11);
    uint256 internal constant AGENT_ID = 1;
    bytes32 internal constant POLICY_ID = bytes32(uint256(0x3333));
    uint16 internal constant MIN_SCORE = 8000;
    uint64 internal constant MAX_AGE = 300;

    uint256 internal constant SENTINEL_PRIVKEY = 0x0101010101010101010101010101010101010101010101010101010101010101;
    bytes32 internal constant SENTINEL_PUB_X = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
    bytes32 internal constant SENTINEL_PUB_Y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

    function setUp() public {
        vm.warp(1700001000);
        identity = new MockIdentity();
        p256Fallback = new P256Fallback();
        vm.etch(address(0x100), address(p256Fallback).code);
        registry = new VerdictRegistry(identity);

        identity.setOwner(AGENT_ID, OWNER);
        vm.prank(OWNER);
        registry.bindKey(AGENT_ID, SENTINEL_PUB_X, SENTINEL_PUB_Y);

        gate1 = new SimpleGate(registry, AGENT_ID, POLICY_ID, MIN_SCORE, MAX_AGE);
        gate2 = new SimpleGate(registry, AGENT_ID, POLICY_ID, MIN_SCORE, MAX_AGE);
    }

    function _submitValidVerdict(uint16 score) internal returns (bytes32 verdictId) {
        Verdict memory v = Verdict({
            agentId: AGENT_ID,
            modelHash: bytes32(uint256(0x1111)),
            inputHash: bytes32(uint256(0x2222)),
            policyId: POLICY_ID,
            scoreBps: score,
            observedAt: uint64(block.timestamp - 10),
            expiry: uint64(block.timestamp + 600),
            nonce: uint64(block.timestamp)
        });

        bytes32 digest = registry.hashVerdict(v);
        (bytes32 r, bytes32 s) = vm.signP256(SENTINEL_PRIVKEY, digest);
        return registry.submit(v, r, s);
    }

    function test_Consume_Once_Success() public {
        bytes32 id = _submitValidVerdict(8500);

        assertFalse(gate1.consumed(id));
        gate1.execute(id);
        assertTrue(gate1.consumed(id), "Verdict must be marked consumed");
    }

    function test_Consume_Twice_RevertsVerdictConsumed() public {
        bytes32 id = _submitValidVerdict(8500);

        gate1.execute(id);

        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        gate1.execute(id);
    }

    function test_Consume_InvalidVerdict_RevertsVerdictInvalid() public {
        bytes32 id = _submitValidVerdict(7000); // Below MIN_SCORE 8000

        vm.expectRevert(HorkosConsumer.VerdictInvalid.selector);
        gate1.execute(id);
    }

    function test_Consume_MultipleConsumers_Independent() public {
        bytes32 id = _submitValidVerdict(9000);

        // gate1 consumes
        gate1.execute(id);
        assertTrue(gate1.consumed(id));
        assertFalse(gate2.consumed(id));

        // gate2 consumes
        gate2.execute(id);
        assertTrue(gate2.consumed(id));

        // Both cannot consume again
        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        gate1.execute(id);

        vm.expectRevert(HorkosConsumer.VerdictConsumed.selector);
        gate2.execute(id);
    }
}
