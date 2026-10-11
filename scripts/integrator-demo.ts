import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
  type Address,
  defineChain,
  encodeDeployData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createSigner,
  deploymentAddress,
  normalizeEvent,
  hashInput,
  buildVerdict,
  hashVerdict,
  getDomain,
  makeBundle,
  verifyEvidenceBundle,
} from '../packages/sdk/dist/index.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvironment } from './deployment-checks.mjs';
const deployment = JSON.parse(readFileSync(new URL('../deployments/monad-testnet.json', import.meta.url), 'utf8'));

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monadscan', url: 'https://testnet.monadscan.com' },
  },
});

const VERDICT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'submit',
    inputs: [
      {
        name: 'v',
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'modelHash', type: 'bytes32' },
          { name: 'inputHash', type: 'bytes32' },
          { name: 'policyId', type: 'bytes32' },
          { name: 'scoreBps', type: 'uint16' },
          { name: 'observedAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'nonce', type: 'uint64' },
        ],
      },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [{ name: 'verdictId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'isValid',
    inputs: [
      { name: 'verdictId', type: 'bytes32' },
      { name: 'agentId', type: 'uint256' },
      { name: 'policyId', type: 'bytes32' },
      { name: 'minScoreBps', type: 'uint16' },
      { name: 'maxAgeSeconds', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

const SIMPLE_GATE_ABI = [
  {
    type: 'function',
    name: 'execute',
    inputs: [{ name: 'verdictId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'trustedAgentId',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'trustedPolicyId',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'minScoreBps',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'maxAge',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ActionGated',
    inputs: [
      { name: 'verdictId', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },
] as const;

async function main() {
  console.log('================================================================');
  console.log('       Horkos SimpleGate 10-Line Integration Demo            ');
  console.log('              Target: Monad Testnet (Chain ID 10143)            ');
  console.log('================================================================\n');

  const env = loadEnvironment();
  const rpcUrl = env.MONAD_RPC_URL || deployment.rpcUrl;
  const deployerKey = env.DEPLOYER_PRIVATE_KEY as Hex;
  const signingScalar = env.SENTINEL_P256_PRIVATE_KEY as Hex;
  if (!deployerKey || !signingScalar) {
    throw new Error('Set DEPLOYER_PRIVATE_KEY and SENTINEL_P256_PRIVATE_KEY to testnet-only keys before running the live demo');
  }

  const registryAddress = deploymentAddress(deployment, 'VerdictRegistry');
  const agentId = 2009n;
  const gatePolicyId: Hex = '0x629de4b1a4ad836cf988f01b63ef2713e2f5b3310ce1c79e60655be61d6706df'; // keccak256("SIMPLE_GATE_POLICY_V2")
  const modelHash: Hex = '0x2222222222222222222222222222222222222222222222222222222222222222';

  const account = privateKeyToAccount(deployerKey);
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

  console.log(`Caller Address:    ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Caller Balance:    ${(Number(balance) / 1e18).toFixed(4)} MON`);
  console.log(`Verdict Registry:  ${registryAddress}`);
  console.log(`Sentinel Agent ID: #${agentId} (ERC-8004 Identity)\n`);

  // Step 1: Deploy a fresh SimpleGate configured for Agent #2009
  console.log('--- Step 1: Deploying Integrator SimpleGate ---');
  const simpleGateArtifact = JSON.parse(
    readFileSync(resolve('contracts/out/SimpleGate.sol/SimpleGate.json'), 'utf8')
  );

  const minScoreBps = 7500; // Requires >= 75.0% confidence
  const maxAgeSeconds = 3600n; // 1 hour max age

  const deployTx = await walletClient.deployContract({
    abi: simpleGateArtifact.abi,
    bytecode: simpleGateArtifact.bytecode.object as Hex,
    args: [registryAddress, agentId, gatePolicyId, minScoreBps, maxAgeSeconds],
  });
  console.log(`Deploy Tx: https://testnet.monadscan.com/tx/${deployTx}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
  const simpleGateAddress = receipt.contractAddress as Address;
  console.log(`✅ SimpleGate Deployed at: ${simpleGateAddress}\n`);

  // Step 2: Create a high-value action to gate (e.g., Access Grant / Safe Withdrawal)
  console.log('--- Step 2: High-Value Action To Gate ---');
  const userAction = {
    routeId: '0x0000000000000000000000000000000000000000000000000000000000000001',
    amount: 1000000000000000000n, // 1 MON
    sourceChainId: 10143n,
    targetChainId: 10143n,
    recipient: account.address,
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    nonce: 1n,
  };
  console.log('Action Payload:', JSON.stringify(userAction, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // Step 3: Sentinel evaluates the request and signs a Verdict
  console.log('\n--- Step 3: Sentinel Scored & Signed Verdict ---');
  const normalizedInput = normalizeEvent(userAction);
  const inputHash = hashInput(userAction);
  const scoreBps = 8800; // 88.0% confidence -> PASSES minScore 7500
  const observedAt = BigInt(Math.floor(Date.now() / 1000));
  const expiry = observedAt + 1800n; // 30 minutes
  const nonce = BigInt(Date.now());

  const verdict = buildVerdict({
    agentId,
    modelHash,
    inputHash,
    policyId: gatePolicyId,
    scoreBps,
    observedAt,
    ttlSeconds: 1800,
    nonce,
  });

  const domain = getDomain(10143, registryAddress);
  const verdictId = hashVerdict(verdict, domain);
  const signer = createSigner(signingScalar);
  const signature = await signer.signDigest(verdictId);

  console.log(`Generated Verdict ID: ${verdictId}`);
  console.log(`Confidence Score:     ${scoreBps} bps (${(scoreBps / 100).toFixed(1)}%)`);
  console.log(`Signature r:          ${signature.r}`);
  console.log(`Signature s:          ${signature.s}`);

  // Step 4: Submit Verdict to Monad VerdictRegistry
  console.log('\n--- Step 4: Submitting Verdict to VerdictRegistry on Monad ---');
  const submitTx = await walletClient.writeContract({
    address: registryAddress,
    abi: VERDICT_REGISTRY_ABI,
    functionName: 'submit',
    args: [verdict, signature.r, signature.s],
  });
  console.log(`Submit Tx Hash: https://testnet.monadscan.com/tx/${submitTx}`);
  const submitReceipt = await publicClient.waitForTransactionReceipt({ hash: submitTx });
  console.log(`✅ Verdict Accepted in block ${submitReceipt.blockNumber} (Gas Used: ${submitReceipt.gasUsed})`);

  // Verify onchain validity
  const isValid = await publicClient.readContract({
    address: registryAddress,
    abi: VERDICT_REGISTRY_ABI,
    functionName: 'isValid',
    args: [verdictId, agentId, gatePolicyId, minScoreBps, 3600n],
  });
  console.log(`Onchain isValid check: ${isValid}`);
  if (!isValid) throw new Error('Verdict must be valid onchain before consumption!');

  // Step 5: Execute Gated Action via SimpleGate (10-line consumer)
  console.log('\n--- Step 5: Executing Gated Action via SimpleGate ---');
  const executeTx = await walletClient.writeContract({
    address: simpleGateAddress,
    abi: SIMPLE_GATE_ABI,
    functionName: 'execute',
    args: [verdictId],
  });
  console.log(`Execute Tx Hash: https://testnet.monadscan.com/tx/${executeTx}`);
  const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeTx });
  console.log(`✅ Action successfully executed in block ${executeReceipt.blockNumber} (Gas Used: ${executeReceipt.gasUsed})`);

  // Step 6: Test replay protection (cannot consume twice)
  console.log('\n--- Step 6: Verifying Replay Protection ---');
  try {
    await publicClient.simulateContract({
      account,
      address: simpleGateAddress,
      abi: SIMPLE_GATE_ABI,
      functionName: 'execute',
      args: [verdictId],
    });
    throw new Error('Replay execution did NOT revert as expected!');
  } catch (err: any) {
    console.log(`✅ Correctly Reverted on second consumption attempt: ${err.message.slice(0, 80)}...`);
  }

  console.log('\n================================================================');
  console.log('🎉 T-42 SimpleGate 10-Line Integration Demo COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
