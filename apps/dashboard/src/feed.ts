import { createPublicClient, http, type Hex } from 'viem';
import { VERDICT_REGISTRY_ABI, TRIPWIRE_GUARDIAN_ABI } from '@horkos/sdk';
import { CONTRACT_ADDRESSES, LIVE_DEMO_BLOCKS, monadTestnet } from './config';

export interface VerdictRow {
  verdictId: Hex;
  agentId: string;
  policyId: Hex;
  scoreBps: number;
  observedAt: number;
  txHash?: Hex;
  actionTxHash?: Hex;
  tier?: number;
  block?: bigint;
}

const client = createPublicClient({ chain: monadTestnet, transport: http(undefined, { timeout: 8000, retryCount: 0 }) });

export async function readLiveFeed() {
  if (!CONTRACT_ADDRESSES) throw new Error('Horkos is not deployed; live feed is unavailable');
  if (await client.getChainId() !== monadTestnet.id) throw new Error('RPC chain does not match the deployment manifest');
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const canonical = await client.getBlock({ blockNumber: head });
  const fromBlock = head > 2000n ? head - 2000n : 0n;
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = fromBlock; start <= head; start += 100n) {
    ranges.push({ fromBlock: start, toBlock: start + 99n < head ? start + 99n : head });
  }
  // These are search anchors only. Every displayed row still comes from fresh RPC logs.
  for (const block of LIVE_DEMO_BLOCKS) {
    if (block < fromBlock && block <= head) ranges.push({ fromBlock: block, toBlock: block });
  }
  const accepted = [];
  const actions = [];
  for (const range of ranges) {
    const [verdictLogs, actionLogs] = await Promise.all([
      client.getContractEvents({ address: CONTRACT_ADDRESSES.VerdictRegistry, abi: VERDICT_REGISTRY_ABI,
        eventName: 'VerdictAccepted', ...range, strict: true }),
      client.getContractEvents({ address: CONTRACT_ADDRESSES.TripwireGuardianV2, abi: TRIPWIRE_GUARDIAN_ABI,
        eventName: 'ActionApplied', ...range, strict: true }),
    ]);
    accepted.push(...verdictLogs);
    actions.push(...actionLogs);
  }
  const tier = await client.readContract({ address: CONTRACT_ADDRESSES.TripwireGuardianV2,
    abi: TRIPWIRE_GUARDIAN_ABI, functionName: 'currentTier', blockNumber: head });
  const confirm = await client.getBlock({ blockNumber: head });
  if (canonical.hash !== confirm.hash) throw new Error('Chain reorganized during refresh; retry');
  const byVerdict = new Map(actions.filter((log) => !log.removed).map((log) => [log.args.verdictId.toLowerCase(), log]));
  const unique = new Map<string, VerdictRow>();
  for (const log of accepted) {
    if (log.removed || !log.transactionHash) continue;
    const action = byVerdict.get(log.args.verdictId.toLowerCase());
    unique.set(log.args.verdictId.toLowerCase(), {
      verdictId: log.args.verdictId, agentId: log.args.agentId.toString(), policyId: log.args.policyId,
      scoreBps: log.args.scoreBps, observedAt: Number(log.args.observedAt), txHash: log.transactionHash,
      actionTxHash: action?.transactionHash ?? undefined, tier: action?.args.tier, block: log.blockNumber,
    });
  }
  const rows = [...unique.values()].sort((a, b) => {
    const left = a.block ?? 0n;
    const right = b.block ?? 0n;
    return left > right ? -1 : left < right ? 1 : 0;
  });
  return { rows, tier, head, fromBlock };
}
