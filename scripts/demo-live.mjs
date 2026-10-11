import { randomBytes, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, realpathSync,
  renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSigner } from '../packages/sdk/dist/index.js';
import { getActiveTripwireModel, loadReplayFeed, processEvent, verifyTripwireBundle } from '../packages/sentinel/dist/index.js';
import { addressOf, buildArtifacts, checkProvenance, equalHex, explorerVerifier, gitState, isMain, loadEnvironment,
  publicClient, requireCheck, root, runCommand } from './deployment-checks.mjs';
import { credentialContext, requireCredentials } from './deploy-preflight.mjs';
import { assertPublicManifest, checkCandidateRoles, readCanonical } from './deploy-workflow.mjs';
import { demoPreflight } from './demo-preflight.mjs';
import { runDemoScene } from './demo-scenes.mjs';
import { checkCancelled, createLiveWriteGuard, liveBudget, liveGasLimit, livePolicyId, nativeP256Address, parseLiveArguments, waitForFreshWindow } from './demo-live-checks.mjs';

export async function prepareLiveDemo(context, options, checkReady = demoPreflight) {
  requireCheck(typeof options.broadcast === 'boolean' && typeof options.allowOwnerReset === 'boolean'
    && options.broadcast === options.allowOwnerReset && (options.runs !== 3 || options.waitWindows === true), 'Invalid live broadcast/reset/window authorization');
  const { manifest, credentials, provenance, client } = context;
  const configuration = requireCredentials(credentials);
  assertPublicManifest(manifest);
  requireCheck(manifest.stage === 'demo' && manifest.seed?.length === 4, 'Live demo requires the published four-contract demo manifest');
  checkCandidateRoles(manifest, configuration);
  checkProvenance(manifest, provenance);
  requireCheck(equalHex(options.recipient, configuration.agentOwner) && !equalHex(options.recipient, configuration.deployer),
    'Recipient must be the distinct, credential-owned agent-owner EOA');
  const budget = liveBudget(manifest, options);
  const ready = await checkReady(context);
  requireCheck(ready.ready === true && ready.transactionsBroadcast === 0, 'Combined live preflight did not establish read-only readiness');
  const block = await client.getBlock({ blockNumber: BigInt(ready.state.checkedAtBlock) });
  requireCheck(equalHex(block.hash, ready.state.checkedAtBlockHash) && await client.getChainId() === 10143, 'Live plan snapshot/chain differs from preflight');
  const empty = async address => {
    const code = await client.getCode({ address, blockNumber: block.number });
    return code === undefined || code === '0x';
  };
  requireCheck(await empty(options.recipient) && await empty(configuration.deployer), 'Live sender/recipient must be undelegated external accounts');
  requireCheck(await empty(nativeP256Address), 'Live precompile address contains local fallback code');
  requireCheck(await client.getBalance({ address: addressOf(manifest, 'MockBridge'), blockNumber: block.number }) >= budget.total,
    'Pre-fund the bridge for the exact intended transfer total; this wrapper never funds it');
  requireCheck(await client.getBalance({ address: configuration.deployer, blockNumber: block.number })
    >= BigInt(budget.maxTransactions) * liveGasLimit * budget.priceCap, 'Live wallet cannot reserve the approved gas ceiling');
  const gasPrice = await client.getGasPrice();
  requireCheck(gasPrice > 0n && gasPrice <= budget.priceCap, 'Current gas price exceeds the approved budget-derived ceiling');
  requireCheck(equalHex((await client.getBlock({ blockNumber: block.number })).hash, block.hash), 'Live plan snapshot was reorganized');
  return { mode: 'monad-testnet', inputProvenance: 'synthetic', chainId: 10143, ready: true,
    sourceCommit: provenance.head, deploymentCommit: manifest.commit, recipient: options.recipient, runs: options.runs,
    expectedTransferWei: budget.total.toString(), maximumAttemptedTransferWei: budget.attempted.toString(),
    approvedTransferWei: options.maxTransferWei, approvedGasWei: options.maxGasWei,
    maxTransactions: budget.maxTransactions, gasLimitPerCall: liveGasLimit.toString(), gasPriceCeilingWei: budget.priceCap.toString(),
    checkedAtBlock: block.number.toString(), checkedAtBlockHash: block.hash, transactionsBroadcast: 0 };
}

function syncDirectory(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function safeDirectories(directory, relative) {
  let path = directory;
  for (const component of relative.split('/')) {
    path = resolve(path, component);
    if (!existsSync(path)) { mkdirSync(path, { mode: 0o700 }); syncDirectory(resolve(path, '..')); }
    requireCheck(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(), 'Live evidence directory must not be a symlink');
  }
  requireCheck(realpathSync(path) === resolve(realpathSync(directory), relative), 'Live evidence directory escapes workspace');
  return path;
}

function durableJSON(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temporary, path);
  syncDirectory(resolve(path, '..'));
}

export function createLiveJournal(directory, plan) {
  requireCheck(Object.keys(plan).every(name => ['mode', 'inputProvenance', 'chainId', 'ready', 'sourceCommit', 'deploymentCommit', 'recipient', 'runs',
    'expectedTransferWei', 'maximumAttemptedTransferWei', 'approvedTransferWei', 'approvedGasWei', 'maxTransactions', 'gasLimitPerCall',
    'gasPriceCeilingWei', 'checkedAtBlock', 'checkedAtBlockHash', 'transactionsBroadcast'].includes(name)), 'Live public plan has unexpected fields');
  const pending = safeDirectories(directory, 'deployments/.pending');
  const lockPath = resolve(pending, 'demo-live.lock');
  let lock;
  try { lock = openSync(lockPath, 'wx', 0o600); }
  catch { requireCheck(false, 'Live demo lock already exists or cannot be created; inspect prior intents, do not auto-retry'); }
  const lockStat = fstatSync(lock);
  const release = (retain = false) => {
    closeSync(lock);
    if (!retain && existsSync(lockPath)) {
      const stat = lstatSync(lockPath);
      if (stat.ino === lockStat.ino && stat.dev === lockStat.dev) { unlinkSync(lockPath); syncDirectory(pending); }
    }
  };
  try {
    const parent = safeDirectories(directory, 'evidence/replay/live');
    const output = resolve(parent, randomUUID());
    mkdirSync(output, { mode: 0o700 });
    syncDirectory(parent);
    writeFileSync(lock, JSON.stringify({ output, sourceCommit: plan.sourceCommit }) + '\n');
    fsyncSync(lock);
    syncDirectory(pending);
    const report = { mode: plan.mode, inputProvenance: 'synthetic', chainId: 10143, status: 'running', plan,
      intents: [], runs: [], windows: [], startedAt: new Date().toISOString() };
    const save = () => durableJSON(resolve(output, 'run.json'), report);
    save();
    const bundles = new Set();
    return { output, report, save, close: () => release(report.intents.some(intent => !['success', 'reverted'].includes(intent.status))),
      intent(record) { report.intents.push({ ...record }); save(); },
      updateIntent(record) {
        const index = report.intents.findIndex(item => item.nonce === record.nonce);
        requireCheck(index >= 0, 'Live intent has no durable preparation record');
        report.intents[index] = { ...record }; save();
      },
      progress(index, scene) {
        const runDirectory = resolve(output, `run-${index + 1}`);
        if (!existsSync(runDirectory)) { mkdirSync(runDirectory, { mode: 0o700 }); syncDirectory(output); }
        for (const { incident, bundle } of scene.bundles) {
          requireCheck(['benign', 'near-miss', 'throttle', 'delay', 'freeze'].includes(incident)
            && verifyTripwireBundle(bundle).valid, 'Live journal refuses unverified or unexpected bundles');
          const name = `${index}:${incident}`;
          if (!bundles.has(name)) {
            requireCheck(!existsSync(resolve(runDirectory, `bundle-${incident}.json`)), 'Live bundle must not be overwritten');
            durableJSON(resolve(runDirectory, `bundle-${incident}.json`), bundle);
            bundles.add(name);
          }
        }
        report.runs[index] = { run: index + 1, status: scene.status, nonce: scene.nonce, transfersWei: scene.transfersWei,
          incidents: scene.incidents.map(({ incident, verdictId, scoreBps, tier }) => ({ incident, verdictId, scoreBps, tier })),
          receipts: scene.receipts.map(({ label, txHash, status, block, blockHash, gasUsed, gasCharged, gasPriceWei, feeWei }) =>
            ({ label, txHash, status, block, blockHash, gasUsed, gasCharged, gasPriceWei, feeWei })),
          checks: Object.fromEntries(['exactFunding', 'benign', 'nearMiss', 'cumulativeCap', 'delay', 'freeze', 'tamper', 'duplicate', 'consumedAction',
            'ownerReset', 'resetPreservesOutflow'].filter(name => scene.checks[name] === true).map(name => [name, true])),
          ...(scene.failedScene ? { failedScene: scene.failedScene } : {}) };
        save();
      },
    };
  } catch (error) { release(); throw error; }
}

export async function runLiveDemo(context, options, { checkReady = demoPreflight, scene = runDemoScene,
  wait = waitForFreshWindow, journalFactory = createLiveJournal } = {}) {
  checkCancelled(context.signal);
  const plan = await prepareLiveDemo(context, options, checkReady);
  if (!options.broadcast) return plan;
  const journal = journalFactory(context.directory ?? root, plan);
  try {
    requireCheck(typeof context.assertInputsUnchanged === 'function', 'Live run requires immutable local inputs');
    await context.assertInputsUnchanged();
    checkCancelled(context.signal);
    const { walletClient, account, sentinel } = await context.createExecutor();
    const { manifest, client, artifacts } = context;
    const contract = name => ({ address: addressOf(manifest, name), abi: artifacts[name].abi });
    const guardian = contract('TripwireGuardianV2');
    const writer = createLiveWriteGuard({ manifest, options, client, walletClient, account, artifacts, signal: context.signal,
      assertInputsUnchanged: context.assertInputsUnchanged, onIntent: record => journal.intent(record), onIntentUpdate: record => journal.updateIntent(record) });
    const nonce = BigInt(`0x${randomBytes(8).toString('hex')}`) & (2n ** 63n - 1n);
    for (let index = 0; index < options.runs; index++) {
      if (index) {
        await wait({ client, guardian, signal: context.signal, onWait(value) {
          journal.report.windows[index - 1] = { beforeRun: index + 1, ...value }; journal.save();
        } });
        await context.assertInputsUnchanged();
        // Combined preflight is repeated after every natural window. Funding is
        // checked separately for the exact remaining runs, not another three.
        const ready = await checkReady(context);
        requireCheck(ready.ready && ready.transactionsBroadcast === 0, 'Repeated combined preflight failed');
        const balance = await client.getBalance({ address: addressOf(manifest, 'MockBridge'), blockTag: 'latest' });
        requireCheck(balance >= liveBudget(manifest, options).perRun * BigInt(options.runs - index), 'Bridge cannot fund the remaining runs');
      }
      const result = await scene({ client, walletClient, account, registry: contract('VerdictRegistry'), guardian,
        bridge: contract('MockBridge'), sentinel, recipient: options.recipient, cap: BigInt(manifest.guardian.outflowCap),
        nonce: nonce + BigInt(index * 10), chainId: 10143, writeGuard: writer, onProgress: current => journal.progress(index, current) });
      requireCheck(result.status === 'passed' && result.receipts.length === 20, 'Live scene did not complete twenty verified calls');
      checkCancelled(context.signal);
    }
    const receipts = journal.report.runs.flatMap(run => run.receipts);
    requireCheck(receipts.length === plan.maxTransactions && journal.report.intents.length === plan.maxTransactions
      && journal.report.intents.every(intent => intent.status === 'success' || intent.status === 'reverted'), 'Live run has unresolved or missing transactions');
    requireCheck(new Set(receipts.map(receipt => receipt.txHash?.toLowerCase())).size === plan.maxTransactions
      && receipts.every(receipt => journal.report.intents.some(intent => equalHex(intent.txHash, receipt.txHash)
        && intent.label === receipt.label && intent.status === receipt.status && intent.block === receipt.block
        && equalHex(intent.blockHash, receipt.blockHash) && intent.feeWei === receipt.feeWei)), 'Live receipt ledger differs from the confirmed intents');
    requireCheck(new Set(journal.report.runs.flatMap(run => run.incidents.map(incident => incident.verdictId))).size === options.runs * 5,
      'Live runs did not produce distinct verdict digests');
    for (const receipt of receipts) requireCheck(equalHex((await client.getBlock({ blockNumber: BigInt(receipt.block) })).hash, receipt.blockHash), 'Final live receipt audit detected a reorganization');
    const transferred = journal.report.runs.reduce((sum, run) => sum + BigInt(run.transfersWei), 0n);
    requireCheck(transferred.toString() === plan.expectedTransferWei, 'Final live transferred total differs from the approved plan');
    await context.assertInputsUnchanged();
    checkCancelled(context.signal);
    journal.report.status = 'passed';
    journal.report.transactionsBroadcast = receipts.length;
    journal.report.feeWei = receipts.reduce((sum, receipt) => sum + BigInt(receipt.feeWei), 0n).toString();
    journal.save();
    return { ...plan, transactionsBroadcast: receipts.length, report: resolve(journal.output, 'run.json') };
  } catch (error) {
    journal.report.status = context.signal?.aborted ? 'cancelled' : 'failed';
    journal.save();
    throw error;
  } finally { journal.close(); }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseLiveArguments(args);
  if (options.help) return { usage: 'demo:live --recipient <agent-owner EOA> --max-transfer-wei <uint256> --max-gas-wei <uint256> [--runs 3 --wait-windows] [--broadcast --allow-owner-reset]',
    default: 'Read-only combined preflight and budget plan. No funding, deployment, reseeding, key rotation, time travel or retry.',
    receipts: '20 calls per run; fixed 2000000 gas per call; Monad charges the full gas limit. Three runs wait for natural one-hour windows.' };
  const env = loadEnvironment();
  const model = getActiveTripwireModel();
  const credentials = credentialContext(root, env, model.hash);
  requireCredentials(credentials);
  const base = readCanonical(root);
  const manifest = base.manifest;
  const provenance = gitState(root, manifest.commit);
  checkProvenance(manifest, provenance);
  const client = publicClient(manifest, env);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const assertInputsUnchanged = () => {
    requireCheck(readCanonical(root).text === base.text, 'Canonical deployment manifest changed during live run');
    const current = gitState(root, manifest.commit);
    checkProvenance(manifest, current);
    requireCheck(current.head === provenance.head, 'Source HEAD changed during live run');
    const fresh = loadEnvironment();
    requireCredentials(credentialContext(root, fresh, model.hash));
    requireCheck(['DEPLOYER_PRIVATE_KEY', 'AGENT_OWNER_PRIVATE_KEY', 'SENTINEL_P256_PRIVATE_KEY', 'SENTINEL_AGENT_ID', 'MONAD_RPC_URL', 'ETHERSCAN_API_KEY']
      .every(name => fresh[name] === env[name]), 'Operator configuration changed during live run; values withheld');
  };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    return await runLiveDemo({ manifest, credentials, provenance, client, artifacts: buildArtifacts(), verifyExplorer: explorerVerifier(env),
      signal: controller.signal, assertInputsUnchanged,
      createExecutor() {
        const rpc = env.MONAD_RPC_URL || manifest.rpcUrl;
        const chain = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
        const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
        const walletClient = createWalletClient({ chain, account, transport: http(rpc, { timeout: 15000, retryCount: 0 }) });
        const signer = createSigner(env.SENTINEL_P256_PRIVATE_KEY);
        const sentinel = { chainId: 10143, agentId: BigInt(manifest.agent.agentId), registryAddress: addressOf(manifest, 'VerdictRegistry'),
          policyId: livePolicyId, model, publicKey: signer.publicKey(),
          verdictFor({ incident = 'freeze', observedAt, nonce }) {
            const entry = loadReplayFeed({ observedAt, nonce }).find(item => item.id === incident);
            requireCheck(!!entry, 'Unknown live demo scene');
            return processEvent({ ...entry.events[0], nonce }, entry.features, this.agentId, this.policyId, model.hash,
              signer, 10143, this.registryAddress, model.version);
          } };
        return { walletClient, account, sentinel };
      },
    }, options);
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

if (isMain(import.meta.url)) await runCommand('Live demo', main);
