import { parseAbi, parseEventLogs, type Hex, type PublicClient, type WalletClient, type Account, type Address } from 'viem';
import type { Verdict, P256Signature, StoredVerdict } from './types.js';

export const VERDICT_REGISTRY_ABI = [
  ...parseAbi([
    'function currentKey(uint256 agentId) view returns (bytes32 x, bytes32 y, uint32 epoch, bool active)',
    'event AgentKeyBound(uint256 indexed agentId, uint32 indexed epoch, bytes32 x, bytes32 y)',
    'event AgentKeyRevoked(uint256 indexed agentId, uint32 indexed epoch)',
    'event VerdictAccepted(bytes32 indexed verdictId, uint256 indexed agentId, bytes32 indexed policyId, uint16 scoreBps, bytes32 modelHash, bytes32 inputHash, uint64 observedAt)',
  ]),
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
  {
    type: 'function',
    name: 'getVerdict',
    inputs: [{ name: 'verdictId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'agentId', type: 'uint256' },
          { name: 'modelHash', type: 'bytes32' },
          { name: 'policyId', type: 'bytes32' },
          { name: 'scoreBps', type: 'uint16' },
          { name: 'observedAt', type: 'uint64' },
          { name: 'submittedAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'keyEpoch', type: 'uint32' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

export async function submitVerdict(
  walletClient: WalletClient,
  publicClient: PublicClient,
  registryAddress: Address,
  verdict: Verdict,
  signature: P256Signature,
  account: Account
): Promise<{ verdictId: Hex; txHash: Hex }> {
  const hash = await walletClient.writeContract({
    address: registryAddress,
    abi: VERDICT_REGISTRY_ABI,
    functionName: 'submit',
    args: [
      {
        agentId: verdict.agentId,
        modelHash: verdict.modelHash,
        inputHash: verdict.inputHash,
        policyId: verdict.policyId,
        scoreBps: verdict.scoreBps,
        observedAt: verdict.observedAt,
        expiry: verdict.expiry,
        nonce: verdict.nonce,
      },
      signature.r,
      signature.s,
    ],
    account,
    chain: walletClient.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Verdict submission reverted: ${hash}`);
  const logs = parseEventLogs({
    abi: VERDICT_REGISTRY_ABI,
    eventName: 'VerdictAccepted',
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === registryAddress.toLowerCase()),
  });
  const accepted = logs.find(({ args }) =>
    args.agentId === verdict.agentId && args.policyId.toLowerCase() === verdict.policyId.toLowerCase()
    && args.modelHash.toLowerCase() === verdict.modelHash.toLowerCase()
    && args.inputHash.toLowerCase() === verdict.inputHash.toLowerCase()
    && args.scoreBps === verdict.scoreBps && args.observedAt === verdict.observedAt
  );
  if (!accepted) throw new Error(`Submission receipt has no matching VerdictAccepted event: ${hash}`);
  return { verdictId: accepted.args.verdictId, txHash: hash };
}

export async function isValidVerdict(
  publicClient: PublicClient,
  registryAddress: Address,
  verdictId: Hex,
  agentId: bigint,
  policyId: Hex,
  minScoreBps: number,
  maxAgeSeconds: bigint
): Promise<boolean> {
  return publicClient.readContract({
    address: registryAddress,
    abi: VERDICT_REGISTRY_ABI,
    functionName: 'isValid',
    args: [verdictId, agentId, policyId, minScoreBps, maxAgeSeconds],
  });
}
