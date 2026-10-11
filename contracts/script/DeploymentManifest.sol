// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

library DeploymentManifest {
    function requireRootEnvironment(Vm vm) internal view {
        require(vm.envOr("HORKOS_ROOT_ENV_LOADED", false), "Use the root environment script runner");
    }

    function read(Vm vm) internal view returns (string memory) {
        return vm.readFile(vm.envOr("DEPLOYMENT_MANIFEST", string("../deployments/monad-testnet.json")));
    }

    function addressOf(Vm vm, string memory json, string memory name) internal view returns (address value) {
        string memory path = string.concat(".contracts.", name);
        string memory recordPath = string.concat(path, ".address");
        value = vm.parseJsonAddress(json, vm.keyExistsJson(json, recordPath) ? recordPath : path);
        require(value != address(0), "Manifest contract address is zero");
    }
}
