import { readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, http, concat, keccak256, bytesToHex } from 'viem';
import { createSigner, getDeploymentAddresses } from '../packages/sdk/dist/index.js';
import { loadEnvironment } from './deployment-checks.mjs';

async function main() {
  const deployment = JSON.parse(readFileSync(new URL('../deployments/monad-testnet.json', import.meta.url), 'utf8'));
  const addresses = getDeploymentAddresses(deployment);
  const rpcUrl = loadEnvironment().MONAD_RPC_URL || deployment.rpcUrl;
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }) });
  const chainId = await client.getChainId();
  if (chainId !== 10143) throw new Error(`Expected Monad testnet 10143, got ${chainId}`);
  const block = await client.getBlock();
  const contracts = [];
  for (const [name, address] of Object.entries(addresses)) {
    const bytecode = await client.getBytecode({ address, blockNumber: block.number });
    if (!bytecode || bytecode === '0x') throw new Error(`No deployed code for ${name} at ${address}`);
    contracts.push({ name, address, codeHash: keccak256(bytecode) });
  }
  const { vectors } = JSON.parse(readFileSync(new URL('../test-vectors/verdict-vectors.json', import.meta.url), 'utf8'));
  const vector = vectors[0];
  // Deterministic public fixture key; no operator credentials or transactions involved.
  const signer = createSigner(bytesToHex(new Uint8Array(32).fill(1)));
  const { x, y } = signer.publicKey();
  const { r, s } = await signer.signDigest(vector.digest);
  const data = concat([vector.digest, r, s, x, y]);
  const result = await client.call({
    to: '0x0000000000000000000000000000000000000100', data, blockNumber: block.number,
  });
  if (result.data !== `0x${'0'.repeat(63)}1`) throw new Error('Monad P256 precompile rejected an SDK-produced signature');
  const tampered = await client.call({
    to: '0x0000000000000000000000000000000000000100',
    data: concat([`0x${(BigInt(vector.digest) ^ 1n).toString(16).padStart(64, '0')}`, r, s, x, y]),
    blockNumber: block.number,
  });
  if (tampered.data === `0x${'0'.repeat(63)}1`) throw new Error('Monad P256 precompile accepted a tampered digest');
  const proof = {
    checkedAt: new Date().toISOString(), rpcUrl: deployment.rpcUrl, chainId, blockNumber: block.number.toString(),
    contracts, precompile: '0x0000000000000000000000000000000000000100',
    digest: vector.digest, signature: { r, s }, publicKey: { x, y },
    validSignatureAccepted: true, tamperedDigestRejected: true,
    scope: 'Read-only RPC proof. Does not submit a verdict, verify deployed source equivalence, or execute a guardian action.',
  };
  writeFileSync(new URL('../evidence/testnet-proof.json', import.meta.url), JSON.stringify(proof, null, 2) + '\n');
  console.log(`PASS: Monad P256 accepts an SDK signature and rejects tampering at block ${block.number}.`);
  console.log('Recorded evidence/testnet-proof.json. No transactions were broadcast.');
}

main().catch(() => { console.error('Testnet proof failed; provider diagnostics withheld.'); process.exitCode = 1; });
