import { describe, it, expect } from 'vitest';
import { getAddress } from 'viem';
import { deploymentAddress, getDeploymentAddresses, getConfiguredDeploymentAddresses } from '../src/deployment.js';

const address = (byte: string) => getAddress(`0x${byte.repeat(20)}`);
const contracts = {
  ERC8004Identity: address('11'), VerdictRegistry: address('22'),
  TripwireGuardianV2: address('33'), SimpleGate: address('44'),
};

describe('deployment address compatibility', () => {
  it('returns no live addresses only for an explicit dependency-only undeployed state', () => {
    const manifest = { stage: 'undeployed', contracts: { ERC8004Identity: contracts.ERC8004Identity } };
    expect(getConfiguredDeploymentAddresses(manifest)).toBeNull();
    expect(() => getDeploymentAddresses(manifest)).toThrow('Deployment VerdictRegistry address is missing or invalid');
    expect(getConfiguredDeploymentAddresses({ contracts })).toEqual(contracts);
    expect(() => getConfiguredDeploymentAddresses({ contracts: manifest.contracts })).toThrow();
  });
  it('refuses partial, malformed and hidden deployments marked undeployed', () => {
    for (const records of [{}, { ERC8004Identity: 'sensitive-input' }, { ...contracts },
      { ERC8004Identity: contracts.ERC8004Identity, MockBridge: address('55') }]) {
      expect(() => getConfiguredDeploymentAddresses({ stage: 'undeployed', contracts: records })).toThrow();
    }
  });
  it('reads legacy strings and confirmed records without mutating either', () => {
    const records = Object.fromEntries(Object.entries(contracts).map(([name, value]) => [name, { address: value, txHash: 'public-metadata' }]));
    const before = JSON.stringify(records);
    expect(getDeploymentAddresses({ contracts })).toEqual(contracts);
    expect(getDeploymentAddresses({ contracts: records })).toEqual(contracts);
    expect(JSON.stringify(records)).toBe(before);
    expect(deploymentAddress({ contracts: records }, 'VerdictRegistry')).toBe(contracts.VerdictRegistry);
  });
  it('includes the optional bridge only when present', () => {
    expect(Object.keys(getDeploymentAddresses({ contracts }))).toHaveLength(4);
    expect(getDeploymentAddresses({ contracts: { ...contracts, MockBridge: { address: address('55') } } }).MockBridge).toBe(address('55'));
  });
  it('rejects missing, zero and malformed addresses without echoing input', () => {
    for (const value of [undefined, { address: 'sensitive-input' }, `0x${'0'.repeat(40)}`]) {
      expect(() => deploymentAddress({ contracts: { VerdictRegistry: value } }, 'VerdictRegistry')).toThrow('Deployment VerdictRegistry address is missing or invalid');
    }
  });
});
