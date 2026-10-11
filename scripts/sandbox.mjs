import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseEther, stringToHex, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { VERDICT_REGISTRY_ABI, TRIPWIRE_GUARDIAN_ABI, submitVerdict } from '../packages/sdk/dist/index.js';
import { createMockSentinel } from '../packages/testing/dist/index.js';
import { executeGuardianAction, verifyTripwireBundle } from '../packages/sentinel/dist/index.js';
import { demoPlan, runDemoScene } from './demo-scenes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, MONAD_RPC_URL: '' };
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function availablePort() {
  const listener = createServer();
  await new Promise((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
  const { port } = listener.address();
  await new Promise((done) => listener.close(done));
  return port;
}

function artifact(name) {
  return JSON.parse(readFileSync(resolve(root, 'contracts/out', `${name}.sol`, `${name}.json`), 'utf8'));
}

export async function runSandbox({ output = resolve(root, 'evidence/replay/sandbox'), rehearsal = false } = {}) {
  const started = performance.now();
  if (rehearsal) {
    mkdirSync(dirname(output), { recursive: true });
    mkdirSync(output);
  }
  const build = spawnSync('forge', ['build'], { cwd: resolve(root, 'contracts'), env: safeEnv, encoding: 'utf8' });
  if (build.status !== 0) throw new Error('Sandbox contract build failed; run forge build locally');
  const port = await availablePort();
  const node = spawn('anvil', ['--silent', '--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
    '--hardfork', 'cancun', '--accounts', '0', '--disable-console-log'], { stdio: 'ignore', env: safeEnv });
  let spawnError = false;
  node.on('error', () => { spawnError = true; });
  const exited = new Promise((done) => node.once('exit', done));
  const stop = () => { node.kill('SIGTERM'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const chain = defineChain({ id: 31337, name: 'Horkos Local Sandbox', nativeCurrency: {
      name: 'Local Ether', symbol: 'ETH', decimals: 18,
    }, rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } } });
    const transport = http(chain.rpcUrls.default.http[0], { timeout: 3000, retryCount: 0 });
    const publicClient = createPublicClient({ chain, transport, pollingInterval: 50 });
    let ready = false;
    for (let i = 0; i < 100; ++i) {
      if (spawnError || node.exitCode !== null) throw new Error('Disposable Anvil could not start');
      try { ready = await publicClient.getChainId() === 31337; } catch {}
      if (ready) break;
      await pause(50);
    }
    if (!ready) throw new Error('Disposable Anvil did not become ready');
    const account = privateKeyToAccount(generatePrivateKey());
    const walletClient = createWalletClient({ chain, account, transport });
    const receipts = [];
    const confirm = async (hash, expected = 'success', label = 'transaction') => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 15000 });
      assert.equal(receipt.status, expected, `Unexpected ${label} receipt status`);
      if (rehearsal) {
        const transaction = await publicClient.getTransaction({ hash });
        assert.equal(transaction.chainId, 31337);
        assert.equal(transaction.hash.toLowerCase(), hash.toLowerCase());
        assert.equal(receipt.transactionHash.toLowerCase(), hash.toLowerCase());
        assert.equal(transaction.from.toLowerCase(), account.address.toLowerCase());
        assert.equal(receipt.from.toLowerCase(), account.address.toLowerCase());
        assert.equal(transaction.blockNumber, receipt.blockNumber);
        assert.equal(transaction.blockHash, receipt.blockHash);
        assert.equal((await publicClient.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash);
      }
      receipts.push({ label, txHash: hash, block: Number(receipt.blockNumber), status: receipt.status,
        ...(rehearsal ? { blockHash: receipt.blockHash } : {}) });
      return receipt;
    };
    const write = async (address, abi, functionName, args, expected = 'success') => confirm(
      await walletClient.writeContract({ address, abi, functionName, args, gas: 8000000n }), expected, functionName,
    );
    const deploy = async (name, args = []) => {
      const spec = artifact(name);
      const receipt = await confirm(await walletClient.deployContract({ abi: spec.abi, bytecode: spec.bytecode.object, args, gas: 15000000n }), 'success', `deploy:${name}`);
      assert.ok(receipt.contractAddress);
      return { address: receipt.contractAddress, abi: spec.abi };
    };
    await publicClient.request({ method: 'anvil_setBalance', params: [account.address, toHex(parseEther('1000000'))] });
    await publicClient.request({ method: 'anvil_setCode', params: [
      '0x0000000000000000000000000000000000000100', artifact('P256Fallback').deployedBytecode.object,
    ] });
    const identity = await deploy('MockIdentity');
    const registry = await deploy('VerdictRegistry', [identity.address]);
    const policyId = keccak256(stringToHex('TRIPWIRE_V2_POLICY'));
    const guardian = await deploy('TripwireGuardianV2', [registry.address, policyId]);
    const bridge = await deploy('MockBridge', [guardian.address]);
    const sentinel = createMockSentinel({ agentId: 7n, chainId: chain.id, registryAddress: registry.address, policyId });
    await write(identity.address, identity.abi, 'setOwner', [sentinel.agentId, account.address]);
    await write(registry.address, registry.abi, 'bindKey', [sentinel.agentId, sentinel.publicKey.x, sentinel.publicKey.y]);
    await write(guardian.address, guardian.abi, 'setTrustedAgent', [sentinel.agentId, true]);
    await write(guardian.address, guardian.abi, 'setTrustedModel', [sentinel.model.hash, true]);
    const cap = parseEther('3');
    await write(guardian.address, guardian.abi, 'configureBridge', [bridge.address, cap]);
    const plan = demoPlan(cap);
    await confirm(await walletClient.sendTransaction({ to: bridge.address, value: rehearsal ? plan.total : parseEther('1000') }), 'success', 'fund:MockBridge');
    const recipient = '0x000000000000000000000000000000000000cafe';
    if (rehearsal) {
      const report = { mode: 'local', provenance: 'synthetic', status: 'running', chainId: 31337,
        p256: 'Solidity fallback, not native Monad', model: sentinel.model, recipient,
        contracts: { identity: identity.address, registry: registry.address, guardian: guardian.address, bridge: bridge.address },
        budget: { capWei: cap.toString(), perRunWei: plan.perRun.toString(), totalWei: plan.total.toString() },
        setupReceipts: receipts, runs: [], windowAdvances: [], startedAt: new Date().toISOString() };
      const save = () => {
        writeFileSync(resolve(output, 'run.json.tmp'), JSON.stringify(report, null, 2) + '\n');
        renameSync(resolve(output, 'run.json.tmp'), resolve(output, 'run.json'));
      };
      save();
      const nonce = BigInt(`0x${randomBytes(8).toString('hex')}`) & (2n ** 63n - 1n);
      try {
        for (let index = 0; index < plan.runs; index++) {
          if (index) {
            const windowStarted = await publicClient.readContract({ address: guardian.address, abi: guardian.abi, functionName: 'windowStartedAt' });
            const window = await publicClient.readContract({ address: guardian.address, abi: guardian.abi, functionName: 'THROTTLE_WINDOW' });
            const next = windowStarted + window;
            await publicClient.request({ method: 'evm_setNextBlockTimestamp', params: [Number(next)] });
            await publicClient.request({ method: 'evm_mine', params: [] });
            report.windowAdvances.push({ beforeRun: index + 1, timestamp: next.toString(), localTimeTravel: true });
          }
          const runDirectory = resolve(output, `run-${index + 1}`);
          mkdirSync(runDirectory);
          const result = await runDemoScene({ client: publicClient, walletClient, account, registry, guardian, bridge,
            sentinel, recipient, cap, nonce: nonce + BigInt(index * 10),
            onProgress(current) {
              const { bundles, ...publicRun } = current;
              report.runs[index] = { run: index + 1, ...publicRun };
              for (const { incident, bundle } of bundles) {
                writeFileSync(resolve(runDirectory, `bundle-${incident}.json`), JSON.stringify(bundle, null, 2) + '\n');
              }
              save();
            },
          });
          assert.equal(result.receipts.length, 20);
          console.log(`LOCAL SYNTHETIC rehearsal ${index + 1}/3: 20 checked receipts, exact transfers and reset passed`);
        }
        assert.equal(await publicClient.getBalance({ address: bridge.address, blockTag: 'latest' }), 0n);
        assert.equal(await publicClient.getBalance({ address: recipient, blockTag: 'latest' }), plan.total);
        const verdictIds = report.runs.flatMap(run => run.incidents.map(incident => incident.verdictId));
        assert.equal(new Set(verdictIds).size, 15);
        for (const entry of [...report.setupReceipts, ...report.runs.flatMap(run => run.receipts)]) {
          assert.equal((await publicClient.getBlock({ blockNumber: BigInt(entry.block) })).hash, entry.blockHash);
        }
        report.status = 'passed';
        report.receiptCount = report.setupReceipts.length + report.runs.reduce((count, run) => count + run.receipts.length, 0);
        report.elapsedSeconds = (performance.now() - started) / 1000;
        save();
        console.log(`Three-run local rehearsal PASS: ${report.receiptCount} receipts. Public evidence: ${resolve(output, 'run.json')}`);
        return report;
      } catch (error) {
        report.status = 'failed';
        report.elapsedSeconds = (performance.now() - started) / 1000;
        save();
        throw error;
      }
    }
    const outflow = () => publicClient.readContract({ address: guardian.address, abi: guardian.abi, functionName: 'windowOutflow' });
    const release = async (amount, expected = 'success') => {
      const previous = await outflow();
      const before = await publicClient.getBalance({ address: recipient, blockTag: 'latest' });
      await write(bridge.address, bridge.abi, 'release', [recipient, parseEther(amount)], expected);
      const after = await publicClient.getBalance({ address: recipient, blockTag: 'latest' });
      assert.equal(after - before, expected === 'success' ? parseEther(amount) : 0n);
      assert.equal(await outflow(), previous + (expected === 'success' ? parseEther(amount) : 0n));
    };
    const incidents = [];
    const fixtureBundles = [];
    let firstVerdictSeconds;
    const nonce = BigInt(Date.now());
    for (const [index, incident] of ['benign', 'near-miss', 'throttle', 'delay', 'freeze'].entries()) {
      const { timestamp } = await publicClient.getBlock({ blockTag: 'latest' });
      const { verdict, bundle } = await sentinel.verdictFor({ incident, observedAt: timestamp, nonce: nonce + BigInt(index * 10) });
      assert.equal(verifyTripwireBundle(bundle).valid, true);
      const accepted = await submitVerdict(walletClient, publicClient, registry.address, verdict, bundle.signature, account);
      assert.equal(accepted.verdictId.toLowerCase(), bundle.verdictId.toLowerCase());
      await confirm(accepted.txHash, 'success', `verdict:${incident}`);
      if (index === 0) firstVerdictSeconds = (performance.now() - started) / 1000;
      if (verdict.scoreBps >= 6500) {
        const action = await executeGuardianAction(bundle.verdictId, sentinel.agentId, {
          publicClient, walletClient, account, guardianAddress: guardian.address,
        });
        await confirm(action.txHash, 'success', `action:${incident}`);
      }
      assert.equal(await publicClient.readContract({ address: guardian.address, abi: TRIPWIRE_GUARDIAN_ABI,
        functionName: 'currentTier' }), index < 2 ? 0 : index - 1);
      if (index < 2) await release('1');
      if (incident === 'throttle') { await release('0.5'); await release('0.5'); await release('0.1', 'reverted'); }
      if (index > 2) await release('0.1', 'reverted');
      fixtureBundles.push(bundle);
      incidents.push({ incident, scoreBps: verdict.scoreBps, verdictId: bundle.verdictId, submitTxHash: accepted.txHash });
      console.log(`LOCAL SYNTHETIC ${incident}: ${verdict.scoreBps} bps; verdict and release checks passed`);
    }
    const tampered = structuredClone(fixtureBundles[4]); tampered.verdict.scoreBps--;
    assert.equal(verifyTripwireBundle(tampered).valid, false);
    const fresh = await sentinel.verdictFor({ observedAt: (await publicClient.getBlock()).timestamp, nonce: nonce + 100n });
    await write(registry.address, registry.abi, 'submit', [{ ...fresh.verdict, scoreBps: fresh.verdict.scoreBps - 1 }, fresh.bundle.signature.r, fresh.bundle.signature.s], 'reverted');
    const original = await sentinel.verdictFor({ incident: 'benign', observedAt: BigInt(fixtureBundles[0].verdict.observedAt), nonce });
    await write(registry.address, registry.abi, 'submit', [original.verdict, original.bundle.signature.r, original.bundle.signature.s], 'reverted');
    await write(guardian.address, guardian.abi, 'resetCircuit', []);
    await release('1');
    await write(registry.address, registry.abi, 'revokeKey', [sentinel.agentId]);
    assert.equal(await publicClient.readContract({ address: registry.address, abi: VERDICT_REGISTRY_ABI,
      functionName: 'isValid', args: [fixtureBundles[4].verdictId, sentinel.agentId, policyId, 6500, 300n] }), false);
    await write(registry.address, registry.abi, 'submit', [fresh.verdict, fresh.bundle.signature.r, fresh.bundle.signature.s], 'reverted');
    const report = { mode: 'local', provenance: 'synthetic', chainId: 31337, p256: 'Solidity fallback, not native Monad',
      contracts: { identity: identity.address, registry: registry.address, guardian: guardian.address, bridge: bridge.address },
      model: sentinel.model, firstVerdictSeconds, incidents, receipts, checks: { tamper: true, duplicate: true, cumulativeCap: true,
        delay: true, freeze: true, ownerReset: true, revokedKey: true }, elapsedSeconds: (performance.now() - started) / 1000 };
    mkdirSync(output, { recursive: true });
    for (const [index, bundle] of fixtureBundles.entries()) writeFileSync(resolve(output, `bundle-${incidents[index].incident}.json`), JSON.stringify(bundle, null, 2) + '\n');
    writeFileSync(resolve(output, 'run.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Sandbox PASS in ${report.elapsedSeconds.toFixed(2)}s. Public evidence: ${resolve(output, 'run.json')}`);
    return report;
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    if (node.exitCode === null && !spawnError) {
      stop();
      await Promise.race([exited, pause(2000)]);
      if (node.exitCode === null) { node.kill('SIGKILL'); await exited; }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSandbox().catch(() => { console.error('Sandbox FAILED. No operator wallet was used. Run the focused unit suites for diagnostics.'); process.exitCode = 1; });
}
