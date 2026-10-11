import { getConfiguredDeploymentAddresses, type EvidenceBundle } from '@horkos/sdk';
import { defineChain } from 'viem';
import deployment from '../../../deployments/monad-testnet.json';
import benign from '../../../evidence/recorded/bundle-benign.json';
import nearMiss from '../../../evidence/recorded/bundle-near-miss.json';
import throttle from '../../../evidence/recorded/bundle-throttle.json';
import delay from '../../../evidence/recorded/bundle-delay.json';
import freeze from '../../../evidence/recorded/bundle-freeze.json';
import demoBlocks from '../../../evidence/live/dashboard-blocks.json';

export const CONTRACT_ADDRESSES = getConfiguredDeploymentAddresses(deployment);
export const EXPLORER = deployment.explorerUrl;
export const HAS_DEPLOYMENT_RECEIPTS = Object.values(deployment.contracts).some((record: unknown) =>
  typeof record === 'object' && record !== null && 'txHash' in record);
export const EVIDENCE_API = (import.meta.env.VITE_EVIDENCE_API_URL || '/api').replace(/\/$/, '');
export const monadTestnet = defineChain({
  id: deployment.chainId, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [deployment.rpcUrl] } },
  blockExplorers: { default: { name: 'Monadscan', url: EXPLORER } },
});
export const RECORDED = [benign, nearMiss, throttle, delay, freeze] as EvidenceBundle[];
export const LIVE_DEMO_BLOCKS = demoBlocks.chainId === deployment.chainId && demoBlocks.deploymentCommit === deployment.commit
  ? demoBlocks.blocks.map(BigInt) : [];
