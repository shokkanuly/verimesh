import { parseEventLogs, type Hex, type Address, type Account, type PublicClient, type WalletClient } from 'viem';
import { TRIPWIRE_GUARDIAN_ABI } from '@horkos/sdk';

export interface ExecutorOptions {
  publicClient: PublicClient;
  walletClient: WalletClient;
  guardianAddress: Address;
  account: Account;
}

export async function executeGuardianAction(verdictId: Hex, agentId: bigint, options: ExecutorOptions) {
  const { publicClient, walletClient, guardianAddress, account } = options;
  const { request } = await publicClient.simulateContract({
    address: guardianAddress,
    abi: TRIPWIRE_GUARDIAN_ABI,
    functionName: 'applyVerdict',
    args: [verdictId, agentId],
    account,
  });
  const txHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') throw new Error(`Guardian action reverted: ${txHash}`);
  const actions = parseEventLogs({
    abi: TRIPWIRE_GUARDIAN_ABI,
    eventName: 'ActionApplied',
    logs: receipt.logs.filter((log) => log.address.toLowerCase() === guardianAddress.toLowerCase()),
  });
  const action = actions.find(({ args }) => args.verdictId.toLowerCase() === verdictId.toLowerCase());
  if (!action) throw new Error(`Guardian receipt has no matching ActionApplied event: ${txHash}`);
  return { verdictId, agentId, executed: true as const, txHash, tier: action.args.tier };
}
