#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, type Hex, type Address } from 'viem';
import { VERDICT_REGISTRY_ABI, type EvidenceBundle } from '@horkos/sdk';
import { verifyTripwireBundle } from '@horkos/sentinel/model';

export interface VerifyBundleCliOptions {
  bundleSource: string;
  rpcUrl?: string;
}

export interface CliReport {
  success: boolean;
  verdictId: string;
  mismatches: string[];
  output: string;
}

export async function runVerifyBundle(options: VerifyBundleCliOptions): Promise<CliReport> {
  let bundle: EvidenceBundle;

  if (options.bundleSource.startsWith('http://') || options.bundleSource.startsWith('https://')) {
    const res = await fetch(options.bundleSource);
    if (!res.ok) {
      throw new Error(`Failed to fetch bundle from URL (${res.status} ${res.statusText}): ${options.bundleSource}`);
    }
    bundle = (await res.json()) as EvidenceBundle;
  } else {
    const raw = readFileSync(options.bundleSource, 'utf8');
    bundle = JSON.parse(raw) as EvidenceBundle;
  }

  const lines: string[] = [];
  lines.push('=== Horkos Decision Re-execution & Verification ===');
  lines.push(`Verdict ID: ${bundle.verdictId}`);
  lines.push(`Agent ID:   ${bundle.verdict.agentId}`);
  lines.push(`Score:      ${bundle.verdict.scoreBps} bps (${(bundle.verdict.scoreBps / 100).toFixed(2)}%)`);
  lines.push(`Registry:   ${bundle.registry}`);
  lines.push(`Chain ID:   ${bundle.chainId}`);
  lines.push('');

  const report = verifyTripwireBundle(bundle);
  const mismatches = [...report.mismatches];

  lines.push(report.inputHashMatch ? '[PASS] 1. inputHash recomputed from normalizedEvent' : '[FAIL] 1. inputHash mismatch');
  lines.push(report.modelHashMatch ? '[PASS] 2. modelHash verified' : '[FAIL] 2. modelHash mismatch');
  lines.push(report.scoreMatch ? '[PASS] 3. scoreBps matches features' : '[FAIL] 3. scoreBps mismatch');
  lines.push(report.verdictIdMatch ? '[PASS] 4. EIP-712 digest matches verdictId' : '[FAIL] 4. EIP-712 digest mismatch');
  lines.push(report.signatureValid ? '[PASS] 5. P256 signature verified by public key' : '[FAIL] 5. P256 signature invalid');

  // Optional onchain check if --rpc provided
  if (options.rpcUrl && report.verdictIdMatch) {
    try {
      const publicClient = createPublicClient({
        transport: http(options.rpcUrl),
      });

      if (await publicClient.getChainId() !== bundle.chainId) throw new Error('RPC chain ID does not match bundle');
      const onchain = await publicClient.readContract({
        address: bundle.registry as Address,
        abi: VERDICT_REGISTRY_ABI,
        functionName: 'getVerdict',
        args: [bundle.verdictId as Hex],
      });

      const expected = {
        agentId: BigInt(bundle.verdict.agentId),
        modelHash: bundle.model.hash.toLowerCase(),
        policyId: bundle.verdict.policyId.toLowerCase(),
        scoreBps: bundle.verdict.scoreBps,
        observedAt: BigInt(bundle.verdict.observedAt),
        expiry: BigInt(bundle.verdict.expiry),
      };
      let onchainMatch = true;
      for (const field of Object.keys(expected) as (keyof typeof expected)[]) {
        const actual = typeof onchain[field] === 'string' ? String(onchain[field]).toLowerCase() : onchain[field];
        if (actual !== expected[field]) {
          onchainMatch = false;
          mismatches.push(`Onchain ${field} mismatch: chain ${actual} vs bundle ${expected[field]}`);
        }
      }
      if (onchain.submittedAt === 0n || onchain.keyEpoch === 0) {
        onchainMatch = false;
        mismatches.push('Onchain verdict has no acceptance timestamp or key epoch');
      }
      lines.push(onchainMatch ? '[PASS] 6. Onchain stored verdict matches bundle' : '[FAIL] 6. Onchain stored verdict mismatch');
    } catch (e) {
      mismatches.push(`Onchain verification failed: ${(e as Error).message}`);
      lines.push('[FAIL] 6. Requested onchain verification failed');
    }
  }

  lines.push('');
  const success = mismatches.length === 0;
  if (success) {
    lines.push('RESULT: PASS (Decision successfully verified and re-executed)');
  } else {
    lines.push('RESULT: MISMATCH');
    for (const m of mismatches) {
      lines.push(`  - ${m}`);
    }
  }

  return {
    success,
    verdictId: bundle.verdictId,
    mismatches,
    output: lines.join('\n'),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'verify-bundle') args.shift();
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: horkos verify-bundle <bundle.json|url> [--rpc <rpcUrl>]

Re-executes and verifies a machine decision evidence bundle.
Performs all 5 core integrity checks:
  1. Recompute inputHash from normalizedEvent
  2. Verify modelHash
  3. Verify integer score logic
  4. Recompute EIP-712 digest to match verdictId
  5. Verify P256 signature with public key
  6. (Optional) Check onchain state in VerdictRegistry
`);
    process.exit(0);
  }

  const bundleSource = args[0];
  let rpcUrl: string | undefined;
  const rpcIdx = args.indexOf('--rpc');
  if (rpcIdx !== -1) {
    if (!args[rpcIdx + 1] || args[rpcIdx + 1].startsWith('--')) throw new Error('--rpc requires an RPC URL');
    rpcUrl = args[rpcIdx + 1];
  }

  try {
    const report = await runVerifyBundle({ bundleSource, rpcUrl });
    console.log(report.output);
    process.exit(report.success ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Only execute CLI if invoked directly
const isMain = process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
