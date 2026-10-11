import { getAddress, type Address } from 'viem';

export type DeploymentContract = 'ERC8004Identity' | 'VerdictRegistry' | 'TripwireGuardianV2' | 'SimpleGate' | 'MockBridge';
export interface DeploymentAddresses {
  ERC8004Identity: Address;
  VerdictRegistry: Address;
  TripwireGuardianV2: Address;
  SimpleGate: Address;
  MockBridge?: Address;
}

export function deploymentAddress(manifest: { contracts: Record<string, unknown> }, name: DeploymentContract): Address {
  const record = manifest.contracts[name];
  const value = typeof record === 'string' ? record : (record as { address?: unknown } | undefined)?.address;
  try {
    if (typeof value !== 'string') throw new Error();
    const address = getAddress(value);
    if (BigInt(address) === 0n) throw new Error();
    return address;
  } catch {
    throw new Error(`Deployment ${name} address is missing or invalid`);
  }
}

/** Reads addresses only. Receipt/source verification remains a separate gate. */
export function getDeploymentAddresses(manifest: { contracts: Record<string, unknown> }): DeploymentAddresses {
  const addresses: DeploymentAddresses = {
    ERC8004Identity: deploymentAddress(manifest, 'ERC8004Identity'),
    VerdictRegistry: deploymentAddress(manifest, 'VerdictRegistry'),
    TripwireGuardianV2: deploymentAddress(manifest, 'TripwireGuardianV2'),
    SimpleGate: deploymentAddress(manifest, 'SimpleGate'),
  };
  if (Object.hasOwn(manifest.contracts, 'MockBridge')) addresses.MockBridge = deploymentAddress(manifest, 'MockBridge');
  return addresses;
}

/** An explicit undeployed configuration has only the external identity dependency. */
export function getConfiguredDeploymentAddresses(manifest: {
  stage?: string; contracts: Record<string, unknown>;
}): DeploymentAddresses | null {
  if (manifest.stage !== 'undeployed') return getDeploymentAddresses(manifest);
  if (Object.keys(manifest.contracts).length !== 1 || !Object.hasOwn(manifest.contracts, 'ERC8004Identity')) {
    throw new Error('Undeployed manifest must not contain project contract addresses');
  }
  deploymentAddress(manifest, 'ERC8004Identity');
  return null;
}
