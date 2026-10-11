// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {VerdictRegistry} from "../src/VerdictRegistry.sol";
import {TripwireGuardianV2} from "../src/examples/TripwireGuardianV2.sol";
import {MockBridge} from "../src/examples/MockBridge.sol";
import {DeploymentManifest} from "./DeploymentManifest.sol";
import {DeploymentScript} from "./Deploy.s.sol";
import {SimpleGate} from "../src/examples/SimpleGate.sol";

interface IAgentRegistration {
    function register() external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}

contract SeedScript is DeploymentScript {
    struct Targets {
        bytes32 keyX;
        bytes32 keyY;
        bytes32 modelHash;
        address bridge;
        uint256 cap;
        bool hasBridge;
    }

    function run() external {
        DeploymentManifest.requireRootEnvironment(vm);
        _run(vm.envUint("DEPLOYER_PRIVATE_KEY"), vm.envUint("AGENT_OWNER_PRIVATE_KEY"), vm.envUint("SENTINEL_AGENT_ID"),
            DeploymentManifest.read(vm));
    }

    function registerAgent() external returns (uint256 agentId) {
        DeploymentManifest.requireRootEnvironment(vm);
        return _registerAgent(vm.envUint("AGENT_OWNER_PRIVATE_KEY"), DeploymentManifest.read(vm));
    }

    function _registerAgent(uint256 ownerKey, string memory manifest) internal returns (uint256 agentId) {
        require(block.chainid == vm.parseJsonUint(manifest, ".chainId"), "Registration chain differs from manifest");
        address identity = DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity");
        require(identity.code.length > 0, "Identity registry has no code");
        require(!vm.keyExistsJson(manifest, ".agent"), "Agent registration is already recorded");
        vm.startBroadcast(ownerKey);
        agentId = IAgentRegistration(identity).register();
        vm.stopBroadcast();
        require(IAgentRegistration(identity).ownerOf(agentId) == vm.addr(ownerKey), "Registration owner mismatch");
        console2.log("Registration simulation finished; record only a confirmed registration receipt.");
    }

    function bootstrap() external returns (uint256 agentId) {
        require(vm.isContext(VmSafe.ForgeContext.ScriptDryRun), "Bootstrap is dry-run only; confirm registration before deployment");
        DeploymentManifest.requireRootEnvironment(vm);
        (agentId,,,) = _bootstrap(vm.envUint("DEPLOYER_PRIVATE_KEY"), DeploymentManifest.read(vm));
    }

    function _bootstrap(uint256 deployerKey, string memory manifest)
        internal returns (uint256 agentId, VerdictRegistry registry, TripwireGuardianV2 tripwire, SimpleGate gate)
    {
        require(!vm.keyExistsJson(manifest, ".contracts.VerdictRegistry"), "Bootstrap requires an undeployed registry");
        require(vm.envBytes32("SENTINEL_KEY_X") != bytes32(0) && vm.envBytes32("SENTINEL_KEY_Y") != bytes32(0)
            && vm.envBytes32("SCORER_MODEL_HASH") != bytes32(0), "Seed public configuration is empty");
        agentId = _registerAgent(deployerKey, manifest);
        (registry, tripwire, gate) = _deploy(deployerKey, agentId, manifest);
        string memory seeded = string.concat('{"chainId":10143,"contracts":{"ERC8004Identity":"',
            vm.toString(DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity")), '","VerdictRegistry":"',
            vm.toString(address(registry)), '","TripwireGuardianV2":"', vm.toString(address(tripwire)), '"}}');
        _run(deployerKey, deployerKey, agentId, seeded);
        require(gate.trustedAgentId() == agentId, "Gate agent differs from registration");
    }

    function _run(uint256 deployerPrivateKey, uint256 agentOwnerPrivateKey, uint256 agentId, string memory manifest) internal {
        require(block.chainid == vm.parseJsonUint(manifest, ".chainId"), "Seed chain differs from manifest");
        VerdictRegistry registry = VerdictRegistry(DeploymentManifest.addressOf(vm, manifest, "VerdictRegistry"));
        TripwireGuardianV2 tripwire = TripwireGuardianV2(DeploymentManifest.addressOf(vm, manifest, "TripwireGuardianV2"));
        require(address(registry.identityRegistry()) == DeploymentManifest.addressOf(vm, manifest, "ERC8004Identity"), "Registry identity mismatch");
        require(registry.identityRegistry().ownerOf(agentId) == vm.addr(agentOwnerPrivateKey), "Agent owner credential mismatch");
        require(tripwire.owner() == vm.addr(deployerPrivateKey), "Guardian owner credential mismatch");
        require(tripwire.pendingOwner() == address(0), "Pending guardian ownership transfer");
        require(address(tripwire.horkos()) == address(registry), "Guardian registry mismatch");
        require(tripwire.policyId() == keccak256("TRIPWIRE_CIRCUIT_BREAKER_POLICY"), "Guardian policy mismatch");

        Targets memory targets = _targets(manifest, agentId, vm.addr(deployerPrivateKey), vm.addr(agentOwnerPrivateKey));
        bool needsBinding = _needsBinding(registry, agentId, targets, manifest);
        require(targets.hasBridge || tripwire.bridge() == address(0), "Unrecorded bridge is already configured");

        if (needsBinding) {
            vm.startBroadcast(agentOwnerPrivateKey);
            registry.bindKey(agentId, targets.keyX, targets.keyY);
            vm.stopBroadcast();
        }
        vm.startBroadcast(deployerPrivateKey);
        if (!tripwire.trustedAgents(agentId)) tripwire.setTrustedAgent(agentId, true);
        if (!tripwire.trustedModels(targets.modelHash)) tripwire.setTrustedModel(targets.modelHash, true);
        if (targets.hasBridge && (tripwire.bridge() != targets.bridge || tripwire.outflowCap() != targets.cap)) {
            tripwire.configureBridge(targets.bridge, targets.cap);
        }
        vm.stopBroadcast();

        console2.log("Seed simulation finished; receipt/state verification is still required.");
        if (!targets.hasBridge) console2.log("MockBridge pending F-20; this is not full demo readiness.");
    }

    function _targets(string memory manifest, uint256 agentId, address deployer, address agentOwner)
        private view returns (Targets memory targets)
    {
        bool recorded = vm.keyExistsJson(manifest, ".agent");
        if (recorded) {
            require(vm.parseUint(vm.parseJsonString(manifest, ".agent.agentId")) == agentId, "Agent ID differs from manifest");
            targets.keyX = vm.parseJsonBytes32(manifest, ".agent.keyX");
            targets.keyY = vm.parseJsonBytes32(manifest, ".agent.keyY");
            bytes32[] memory models = vm.parseJsonBytes32Array(manifest, ".allowlists.models");
            string[] memory agents = vm.parseJsonStringArray(manifest, ".allowlists.agents");
            require(models.length == 1 && agents.length == 1 && vm.parseUint(agents[0]) == agentId, "Seed expects one intended agent/model");
            targets.modelHash = models[0];
            require(vm.parseJsonAddress(manifest, ".owners.agent") == agentOwner, "Manifest agent owner mismatch");
            require(vm.parseJsonAddress(manifest, ".owners.guardian") == deployer, "Manifest guardian owner mismatch");
        } else {
            targets.keyX = vm.envBytes32("SENTINEL_KEY_X");
            targets.keyY = vm.envBytes32("SENTINEL_KEY_Y");
            targets.modelHash = vm.envBytes32("SCORER_MODEL_HASH");
        }
        require(targets.keyX != bytes32(0) && targets.keyY != bytes32(0) && targets.modelHash != bytes32(0), "Seed public configuration is empty");

        // Validate every target before the first transaction; absent F-20 is explicit.
        targets.hasBridge = vm.keyExistsJson(manifest, ".contracts.MockBridge");
        if (targets.hasBridge) {
            targets.bridge = DeploymentManifest.addressOf(vm, manifest, "MockBridge");
            targets.cap = vm.parseUint(vm.parseJsonString(manifest, ".guardian.outflowCap"));
            require(targets.bridge.code.length > 0 && targets.cap > 0, "Bridge must have code and a positive cap");
            MockBridge bridge = MockBridge(payable(targets.bridge));
            require(address(bridge.guardian()) == DeploymentManifest.addressOf(vm, manifest, "TripwireGuardianV2"), "Bridge guardian mismatch");
            require(bridge.owner() == deployer, "Bridge owner credential mismatch");
            require(bridge.pendingOwner() == address(0), "Pending bridge ownership transfer");
            if (recorded) require(vm.parseJsonAddress(manifest, ".owners.demo") == deployer, "Manifest demo owner mismatch");
        }
    }

    function _needsBinding(VerdictRegistry registry, uint256 agentId, Targets memory targets, string memory manifest)
        private view returns (bool)
    {
        (bytes32 x, bytes32 y, uint32 epoch, bool active) = registry.currentKey(agentId);
        require(epoch == 0 || (active && x == targets.keyX && y == targets.keyY), "Seed refuses key rotation or revoked-key reactivation");
        if (vm.keyExistsJson(manifest, ".agent")) {
            require(vm.parseJsonUint(manifest, ".agent.epoch") == (epoch == 0 ? 1 : epoch), "Manifest epoch mismatch");
        }
        return epoch == 0;
    }
}
