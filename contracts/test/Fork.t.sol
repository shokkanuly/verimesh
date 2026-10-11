// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {P256} from "../src/libs/P256.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {IERC8004Identity} from "../src/interfaces/IERC8004Identity.sol";
import {Verdict} from "../src/libs/VerdictLib.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";
import {DeploymentManifest} from "../script/DeploymentManifest.sol";

/// @title ForkTest
/// @notice Snapshot integration tests against Monad state. RPC must be requested explicitly.
/// Foundry must select the Monad EVM via --rpc-url; no precompile is mocked here.
contract ForkTest is Test {
    address private LIVE_ERC8004;
    address constant VECTOR_CONTRACT = 0x000000000000000000000000000000000000bEEF;

    bytes32 private DIGEST;
    bytes32 private SIG_R;
    bytes32 private SIG_S;
    bytes32 constant PUB_X = 0x6ff03b949241ce1dadd43519e6960e0a85b41a69a05c328103aa2bce1594ca16;
    bytes32 constant PUB_Y = 0x3c4f753a55bf01dc53f6c0b0c7eee78b40c6ff7d25a96e2282b989cef71c144a;

    bool private _isForked;

    function setUp() public {
        string memory vectors = vm.readFile("../test-vectors/verdict-vectors.json");
        DIGEST = vm.parseJsonBytes32(vectors, ".vectors[0].digest");
        SIG_R = vm.parseJsonBytes32(vectors, ".vectors[0].signature.r");
        SIG_S = vm.parseJsonBytes32(vectors, ".vectors[0].signature.s");
        string memory manifest = vm.readFile("../deployments/monad-testnet.json");
        LIVE_ERC8004 = DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity");
        string memory rpc = vm.envOr("MONAD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log_string("Fork suite disabled: set MONAD_RPC_URL to run all six tests (no network requested).");
            return;
        }
        // An explicitly requested fork must fail on RPC errors, never turn green by skipping.
        uint256 forkBlock = vm.envOr("MONAD_FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, forkBlock);
        require(block.chainid == vm.parseJsonUint(manifest, ".chainId"), "Fork RPC chain ID differs from manifest");
        require(LIVE_ERC8004.code.length > 0, "Fork identity address has no code at selected block");
        emit log_named_uint("Monad fork block", block.number);
        _isForked = true;
    }

    modifier onlyFork() {
        if (!_isForked) {
            vm.skip(true);
            return;
        }
        _;
    }

    function test_Fork_P256Precompile_AcceptsVectorSignature() public onlyFork {
        bool ok = P256.verify(DIGEST, SIG_R, SIG_S, PUB_X, PUB_Y);
        assertTrue(ok, "Live Monad precompile at 0x100 must verify canonical vector signature");
    }

    function test_Fork_P256Precompile_RejectsTamperedDigest() public onlyFork {
        bytes32 tamperedDigest = bytes32(uint256(DIGEST) ^ 1);
        bool ok = P256.verify(tamperedDigest, SIG_R, SIG_S, PUB_X, PUB_Y);
        assertFalse(ok, "Live precompile must reject tampered digest");
    }

    function test_Fork_P256Precompile_RejectsTamperedSignature() public onlyFork {
        bytes32 tamperedS = bytes32(uint256(SIG_S) ^ 1);
        bool ok = P256.verify(DIGEST, SIG_R, tamperedS, PUB_X, PUB_Y);
        assertFalse(ok, "Live precompile must reject tampered signature");
    }

    function test_Fork_P256Precompile_RejectsTamperedPublicKey() public onlyFork {
        bytes32 tamperedX = bytes32(uint256(PUB_X) ^ 1);
        bool ok = P256.verify(DIGEST, SIG_R, SIG_S, tamperedX, PUB_Y);
        assertFalse(ok, "Live precompile must reject tampered public key");
    }

    function test_Fork_LiveERC8004_QueryOwner() public onlyFork {
        address agent1Owner = IERC8004Identity(LIVE_ERC8004).ownerOf(1);
        assertTrue(agent1Owner != address(0), "Live ERC-8004 agent 1 must have an owner");
    }

    function test_Fork_FullVerdictFlow_WithLivePrecompileAndERC8004() public onlyFork {
        vm.chainId(10143);

        // Deploy VerdictRegistry directly at VECTOR_CONTRACT (0x...bEEF) so DOMAIN_SEPARATOR matches vector 0
        deployCodeTo("VerdictRegistry.sol", abi.encode(LIVE_ERC8004), VECTOR_CONTRACT);
        VerdictRegistry registry = VerdictRegistry(VECTOR_CONTRACT);

        // Fetch live owner of Agent 1 from Monad testnet ERC-8004
        address agent1Owner = IERC8004Identity(LIVE_ERC8004).ownerOf(1);

        // Bind P256 public key as agent 1 owner
        vm.prank(agent1Owner);
        registry.bindKey(1, PUB_X, PUB_Y);

        (bytes32 keyX, bytes32 keyY, uint32 epoch, bool active) = registry.currentKey(1);
        assertEq(keyX, PUB_X);
        assertEq(keyY, PUB_Y);
        assertEq(epoch, 1);
        assertTrue(active);

        // Vector 0 verdict parameters
        Verdict memory v = Verdict({
            agentId: 1,
            modelHash: 0x1111111111111111111111111111111111111111111111111111111111111111,
            inputHash: 0x2222222222222222222222222222222222222222222222222222222222222222,
            policyId: 0x3333333333333333333333333333333333333333333333333333333333333333,
            scoreBps: 8500,
            observedAt: 1700000000,
            expiry: 1700003600,
            nonce: 42
        });

        // Set time within validity window: observedAt <= block.timestamp <= expiry
        vm.warp(1700000100);

        bytes32 expectedDigest = registry.hashVerdict(v);
        assertEq(expectedDigest, DIGEST, "EIP-712 digest must match vector 0");

        // Submit verdict using real Monad precompile at 0x100
        bytes32 verdictId = registry.submit(v, SIG_R, SIG_S);
        assertEq(verdictId, DIGEST, "Verdict ID must equal EIP-712 digest");

        // Query isValid
        bool valid = registry.isValid(verdictId, 1, v.policyId, 8000, 300);
        assertTrue(valid, "Verdict must be valid under policy threshold");

        // Test consumer gating: SimpleGate consumes verdict once
        SimpleGate gate = new SimpleGate(registry, 1, v.policyId, 8000, 300);
        gate.execute(verdictId);
        assertTrue(gate.consumed(verdictId), "Verdict must be marked consumed");

        // Attempting to consume again must revert
        vm.expectRevert();
        gate.execute(verdictId);
    }
}
