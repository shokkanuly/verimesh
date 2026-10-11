// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeployScript} from "../script/Deploy.s.sol";
import {DeploymentManifest} from "../script/DeploymentManifest.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DeploymentSafetyTest is Test {
    TripwireGuardianV2 private guardian;

    event TrustedAgentSet(uint256 indexed agentId, bool trusted);
    event TrustedModelSet(bytes32 indexed modelHash, bool trusted);

    function setUp() public {
        VerdictRegistry registry = new VerdictRegistry(new MockIdentity());
        guardian = new TripwireGuardianV2(registry, keccak256("deployment-safety"));
    }

    function test_TrustAgentHistoryIncludesRemoval() public {
        vm.expectEmit(true, false, false, true, address(guardian));
        emit TrustedAgentSet(7, true);
        guardian.setTrustedAgent(7, true);
        vm.expectEmit(true, false, false, true, address(guardian));
        emit TrustedAgentSet(7, false);
        guardian.setTrustedAgent(7, false);
        assertFalse(guardian.trustedAgents(7));
    }

    function test_TrustModelHistoryIncludesRemoval() public {
        bytes32 model = keccak256("model");
        vm.expectEmit(true, false, false, true, address(guardian));
        emit TrustedModelSet(model, true);
        guardian.setTrustedModel(model, true);
        vm.expectEmit(true, false, false, true, address(guardian));
        emit TrustedModelSet(model, false);
        guardian.setTrustedModel(model, false);
        assertFalse(guardian.trustedModels(model));
    }

    function test_NonownerCannotEmitTrustChanges() public {
        address other = address(0x1234);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        guardian.setTrustedAgent(7, true);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        guardian.setTrustedModel(keccak256("model"), true);
    }

    function test_DeploymentSimulationDoesNotWriteManifest() public {
        string memory before = vm.readFile("../deployments/monad-testnet.json");
        vm.chainId(vm.parseJsonUint(before, ".chainId"));
        address identity = DeploymentManifest.addressOf(vm, before, "ERC8004Identity");
        vm.etch(identity, address(new MockIdentity()).code);
        string memory fixturePath = "../deployments/.pending/deployment-safety-test.json";
        string memory fixture = string.concat('{"chainId":', vm.toString(block.chainid),
            ',"contracts":{"ERC8004Identity":"', vm.toString(identity), '"}}');
        vm.createDir("../deployments/.pending", true);
        vm.writeFile(fixturePath, fixture);
        vm.setEnv("DEPLOYMENT_MANIFEST", fixturePath);
        uint256 ephemeralKey = (vm.randomUint() >> 1) + 1;
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(ephemeralKey));
        vm.setEnv("SENTINEL_AGENT_ID", "7");
        vm.setEnv("HORKOS_ROOT_ENV_LOADED", "true");
        DeployScript script = new DeployScript();
        (VerdictRegistry registry, TripwireGuardianV2 tripwire,) = script.run();
        assertGt(address(registry).code.length, 0);
        assertGt(address(tripwire).code.length, 0);
        assertEq(keccak256(bytes(vm.readFile(fixturePath))), keccak256(bytes(fixture)));
        assertEq(keccak256(bytes(vm.readFile("../deployments/monad-testnet.json"))), keccak256(bytes(before)));
        vm.removeFile(fixturePath);
        vm.setEnv("DEPLOYMENT_MANIFEST", "../deployments/monad-testnet.json");
    }

    function test_ManifestReaderSupportsBothShapes() public view {
        address expected = address(0x1234);
        string memory legacy = string.concat('{"contracts":{"VerdictRegistry":"', vm.toString(expected), '"}}');
        string memory recorded = string.concat('{"contracts":{"VerdictRegistry":{"address":"', vm.toString(expected), '"}}}');
        assertEq(DeploymentManifest.addressOf(vm, legacy, "VerdictRegistry"), expected);
        assertEq(DeploymentManifest.addressOf(vm, recorded, "VerdictRegistry"), expected);
    }
}
