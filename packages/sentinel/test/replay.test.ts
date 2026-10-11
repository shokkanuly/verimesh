import { describe, it, expect, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, type Account, type PublicClient, type WalletClient } from 'viem';
import { createSigner, TRIPWIRE_GUARDIAN_ABI } from '@horkos/sdk';
import { loadReplayFeed } from '../src/observers/replay.js';
import { runReplay, runReplayCli } from '../src/replay.js';
import { scoreFeaturesV2 } from '../src/score/rules-v2.js';
import { verifyTripwireBundle } from '../src/score/model.js';
import { executeGuardianAction, type ExecutorOptions } from '../src/executor.js';

const hash = `0x${'11'.repeat(32)}` as const;
const guardianAddress = '0x0000000000000000000000000000000000000001' as const;
const options = {
  signer: createSigner('0x0101010101010101010101010101010101010101010101010101010101010101'),
  agentId: 2009n, policyId: hash, registryAddress: guardianAddress, chainId: 10143,
};

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return { ...actual, readFileSync: (...args: Parameters<typeof actual.readFileSync>) =>
    String(args[0]).endsWith('/deployments/monad-testnet.json')
      ? JSON.stringify({ stage: 'undeployed', contracts: { ERC8004Identity: '0x0000000000000000000000000000000000000001' } })
      : actual.readFileSync(...args) };
});

describe('Deterministic replay', () => {
  it('blocks live replay before signer, RPC and writes when Horkos is undeployed', async () => {
    await expect(runReplayCli(['--live'])).rejects.toThrow('Horkos is not deployed; live replay is unavailable');
  });
  it('covers benign, near miss and three non-boundary tiers with unique nonces', () => {
    const incidents = loadReplayFeed();
    expect(incidents.map((incident) => scoreFeaturesV2(incident.features))).toEqual([550, 6200, 7300, 8900, 9900]);
    expect(new Set(incidents.flatMap((incident) => incident.events.map((event) => event.nonce))).size).toBe(5);
    expect(loadReplayFeed()).toEqual(incidents);
  });

  it('produces reproducible evidence without claiming onchain execution', async () => {
    const results = await runReplay(options);
    expect(results).toEqual(await runReplay(options));
    expect(results).toHaveLength(5);
    expect(JSON.stringify(results)).toBe(JSON.stringify(await runReplay(options)));
    for (const result of results) {
      expect(verifyTripwireBundle(result.bundle).valid).toBe(true);
      expect(result.submitTxHash).toBeUndefined();
      expect(result.action).toBeUndefined();
    }
  });

  it('detects altered features in a signed replay bundle', async () => {
    const result = (await runReplay(options))[2];
    result.bundle.features.sizeRatioBps = 0;
    const report = verifyTripwireBundle(result.bundle);
    expect(report.valid).toBe(false);
    expect(report.mismatches).toContain('Score mismatch: expected 6500, got 7300');
  });
});

function executor(receipt: unknown) {
  const wallet = { writeContract: vi.fn().mockResolvedValue(hash) };
  const client = {
    simulateContract: vi.fn().mockResolvedValue({ request: {} }),
    waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
  };
  const config: ExecutorOptions = {
    walletClient: wallet as unknown as WalletClient, publicClient: client as unknown as PublicClient,
    account: {} as Account, guardianAddress,
  };
  return { config, wallet, client };
}

const actionLog = {
  address: guardianAddress,
  topics: encodeEventTopics({ abi: TRIPWIRE_GUARDIAN_ABI, eventName: 'ActionApplied', args: { verdictId: hash } }),
  data: encodeAbiParameters(parseAbiParameters('uint16, uint8'), [9500, 3]),
};

describe('Guardian executor', () => {
  it('reports execution only after a matching action is confirmed', async () => {
    const { config } = executor({ status: 'success', logs: [actionLog] });
    expect(await executeGuardianAction(hash, 2009n, config)).toEqual({
      verdictId: hash, agentId: 2009n, executed: true, txHash: hash, tier: 3,
    });
  });

  it('never submits when simulation rejects an invalid verdict', async () => {
    const { config, client, wallet } = executor({});
    client.simulateContract.mockRejectedValue(new Error('VerdictInvalid'));
    await expect(executeGuardianAction(hash, 2009n, config)).rejects.toThrow('VerdictInvalid');
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it('rejects a reverted action receipt', async () => {
    const { config } = executor({ status: 'reverted', logs: [] });
    await expect(executeGuardianAction(hash, 2009n, config)).rejects.toThrow('reverted');
  });

  it('rejects an event from another guardian', async () => {
    const { config } = executor({ status: 'success', logs: [{ ...actionLog, address: '0x0000000000000000000000000000000000000002' }] });
    await expect(executeGuardianAction(hash, 2009n, config)).rejects.toThrow('no matching ActionApplied');
  });
});
