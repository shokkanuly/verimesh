import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { decodeEventLog, encodeFunctionData, formatEther, parseAbi, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { root, CheckError, requireCheck, equalHex, addressOf, loadEnvironment, loadManifest, publicClient, assertUndeployedManifest, isMain } from './deployment-checks.mjs';
import { sentinelPublicKey } from './doctor.mjs';

const identityAbi = parseAbi(['function register() returns (uint256)', 'function ownerOf(uint256) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
const gasPriceWei = 102000000000n;
const entries = {
  bootstrap: ['script/Seed.s.sol:SeedScript', 'bootstrap()'],
  deploy: ['script/Deploy.s.sol:DeployScript', 'run()'],
  demo: ['script/DeployDemo.s.sol:DeployDemoScript', 'run()'],
  seed: ['script/Seed.s.sol:SeedScript', 'run()'],
  register: ['script/Seed.s.sol:SeedScript', 'registerAgent()'],
};

export function parseArguments(args) {
  if (args.length === 0) return { script: 'bootstrap' };
  if (args.length === 2 && args[0] === '--script' && Object.hasOwn(entries, args[1])) return { script: args[1] };
  if (args.length === 2 && args[0] === '--record-registration' && /^0x[\da-fA-F]{64}$/.test(args[1])) return { txHash: args[1] };
  throw new CheckError('Use no flags for the combined dry run, --script bootstrap|deploy|demo|seed|register, or --record-registration <confirmed hash>. Broadcasting is not supported.');
}

export async function registrationFromReceipt({ client, manifest, txHash, owner }) {
  requireCheck(await client.getChainId() === 10143, 'Registration RPC must target Monad testnet');
  const identity = addressOf(manifest, 'ERC8004Identity');
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const transaction = await client.getTransaction({ hash: txHash });
  requireCheck(receipt.status === 'success' && receipt.blockNumber > 0n && receipt.blockNumber <= BigInt(Number.MAX_SAFE_INTEGER)
    && equalHex(receipt.transactionHash, txHash) && equalHex(transaction.hash, txHash)
    && transaction.chainId === 10143 && equalHex(transaction.from, owner) && equalHex(receipt.from, owner)
    && equalHex(transaction.to, identity) && transaction.value === 0n
    && equalHex(transaction.input, encodeFunctionData({ abi: identityAbi, functionName: 'register' }))
    && transaction.blockNumber === receipt.blockNumber && equalHex(transaction.blockHash, receipt.blockHash),
  'Registration requires a successful matching register() transaction and receipt');
  const minted = [];
  for (const log of receipt.logs) {
    if (!equalHex(log.address, identity)) continue;
    try {
      const decoded = decodeEventLog({ abi: identityAbi, eventName: 'Transfer', data: log.data, topics: log.topics, strict: true });
      if (equalHex(decoded.args.from, zeroAddress) && equalHex(decoded.args.to, owner)) minted.push(decoded.args.tokenId);
    } catch { /* Other identity events do not identify the minted agent. */ }
  }
  requireCheck(minted.length === 1, 'Registration receipt must contain exactly one identity mint to the deployer');
  const agentId = minted[0];
  requireCheck(equalHex(await client.readContract({ address: identity, abi: identityAbi, functionName: 'ownerOf', args: [agentId], blockNumber: receipt.blockNumber }), owner),
    'Registered agent ownership differs from the deployer');
  requireCheck(equalHex((await client.getBlock({ blockNumber: receipt.blockNumber })).hash, receipt.blockHash), 'Registration receipt is not canonical');
  return { agentId: agentId.toString(), registration: { txHash, block: Number(receipt.blockNumber), owner } };
}

export function saveRegistration(directory, agent) {
  const manifestPath = resolve(directory, 'deployments/monad-testnet.json');
  const envPath = resolve(directory, '.env');
  for (const path of [resolve(directory, 'deployments'), manifestPath, envPath]) {
    const stat = lstatSync(path);
    requireCheck(!stat.isSymbolicLink() && (path.endsWith('deployments') ? stat.isDirectory() : stat.isFile()), 'Registration paths must be regular workspace files');
  }
  const lockPath = resolve(directory, 'deployments/.registration.lock');
  const lock = openSync(lockPath, 'wx', 0o600);
  const staged = [];
  try {
    const oldManifest = readFileSync(manifestPath, 'utf8');
    const oldEnv = readFileSync(envPath, 'utf8');
    const manifest = JSON.parse(oldManifest);
    assertUndeployedManifest(manifest);
    requireCheck(!manifest.agent || (manifest.agent.agentId === agent.agentId && equalHex(manifest.agent.registration.txHash, agent.registration.txHash)),
      'A different agent registration is already recorded');
    const currentId = parseEnv(oldEnv).SENTINEL_AGENT_ID;
    requireCheck(!currentId || currentId === agent.agentId, 'Root environment already records a different agent ID');
    const lines = oldEnv.split('\n');
    const matches = lines.flatMap((line, index) => /^\s*(?:export\s+)?SENTINEL_AGENT_ID\s*=/.test(line) ? [index] : []);
    requireCheck(matches.length <= 1, 'Root environment has duplicate SENTINEL_AGENT_ID assignments');
    if (matches.length) lines[matches[0]] = `SENTINEL_AGENT_ID=${agent.agentId}`;
    else { if (lines.at(-1) === '') lines.pop(); lines.push(`SENTINEL_AGENT_ID=${agent.agentId}`, ''); }
    manifest.agent = agent;
    assertUndeployedManifest(manifest);
    const writes = [[envPath, lines.join('\n'), 0o600], [manifestPath, JSON.stringify(manifest, null, 2) + '\n', 0o644]];
    for (const [path, content, mode] of writes) {
      const temp = `${path}.registration-${process.pid}`;
      const fd = openSync(temp, 'wx', mode);
      staged.push(temp);
      try { writeFileSync(fd, content); fsyncSync(fd); } finally { closeSync(fd); }
    }
    requireCheck(readFileSync(manifestPath, 'utf8') === oldManifest && readFileSync(envPath, 'utf8') === oldEnv,
      'Registration files changed during recording');
    // Both files record only a confirmed ID; a rerun repairs an interrupted second rename.
    renameSync(staged[0], envPath);
    renameSync(staged[1], manifestPath);
  } finally {
    for (const path of staged) if (existsSync(path)) unlinkSync(path);
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

export async function simulate({ script, env, manifest, directory = root, client }) {
  requireCheck(Object.hasOwn(entries, script), 'Unknown deployment script');
  let account;
  try { account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY); }
  catch { throw new CheckError('Root deployer key is missing or invalid; value withheld'); }
  requireCheck(await client.getChainId() === 10143, 'Dry run RPC must target Monad testnet');
  const block = await client.getBlock();
  const balance = await client.getBalance({ address: account.address, blockNumber: block.number });
  const scratch = mkdtempSync(join(tmpdir(), 'horkos-deploy-seed-'));
  try {
    const contracts = join(scratch, 'contracts');
    mkdirSync(contracts);
    for (const name of ['src', 'script', 'lib', 'test', 'foundry.toml']) cpSync(resolve(directory, 'contracts', name), join(contracts, name), { recursive: true });
    mkdirSync(join(scratch, 'deployments'));
    cpSync(resolve(directory, 'deployments/monad-testnet.json'), join(scratch, 'deployments/monad-testnet.json'));
    cpSync(resolve(directory, 'test-vectors'), join(scratch, 'test-vectors'), { recursive: true });
    const [entry, signature] = entries[script];
    const args = ['script', entry, '--sig', signature, '--rpc-url', env.MONAD_RPC_URL || manifest.rpcUrl,
      '--fork-block-number', block.number.toString(), '--network', 'monad', '--isolate', '--sender', account.address,
      '--legacy', '--with-gas-price', gasPriceWei.toString(), '--gas-estimate-multiplier', '130', '--non-interactive', '--rpc-timeout', '15'];
    const childEnv = { ...env, HORKOS_ROOT_ENV_LOADED: 'true', DEPLOYMENT_MANIFEST: join(scratch, 'deployments/monad-testnet.json'),
      FOUNDRY_BROADCAST: join(scratch, 'broadcast'), FOUNDRY_OUT: join(contracts, 'out'), FOUNDRY_CACHE_PATH: join(contracts, 'cache'), RUST_LOG: 'error', NO_COLOR: '1' };
    if (['deploy', 'demo'].includes(script) && !childEnv.SENTINEL_AGENT_ID) childEnv.SENTINEL_AGENT_ID = '1';
    let output = '';
    const child = spawn('forge', args, { cwd: contracts, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const exitCode = await new Promise((res, rej) => { child.once('error', rej); child.once('close', res); });
    requireCheck(exitCode === 0, 'Forge dry run failed; private traces withheld');
    const broadcast = join(scratch, 'broadcast');
    const latest = `${signature.slice(0, signature.indexOf('('))}-latest.json`;
    const files = readdirSync(broadcast, { recursive: true }).filter(path => typeof path === 'string' && path.endsWith(latest) && !path.includes('sensitive'));
    requireCheck(files.length === 1, 'Dry run did not produce one simulation transaction list');
    const run = JSON.parse(readFileSync(join(broadcast, files[0]), 'utf8'));
    requireCheck(Array.isArray(run.transactions) && run.transactions.length > 0 && run.receipts?.length === 0,
      'Dry run must have simulated transactions and no receipts');
    const transactions = run.transactions.map(tx => ({ action: tx.transactionType === 'CREATE' ? tx.contractName : tx.function,
      gasLimit: BigInt(tx.transaction.gas).toString() }));
    const totalGas = transactions.reduce((sum, tx) => sum + BigInt(tx.gasLimit), 0n);
    requireCheck(output.includes(`Estimated total gas used for script: ${totalGas}`), 'Forge gas summary differs from transaction limits');
    const cost = totalGas * gasPriceWei;
    return { script, chainId: 10143, checkedAtBlock: block.number.toString(), deployer: account.address,
      transactions, totalGas: totalGas.toString(), gasPriceGwei: '102', estimatedCostMON: formatEther(cost),
      requiredWith2xMarginMON: formatEther(cost * 2n), balanceMON: formatEther(balance), covers2xMargin: balance >= cost * 2n,
      transactionsBroadcast: 0, canonicalFilesWritten: 0 };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const env = loadEnvironment();
  const manifest = loadManifest();
  const client = publicClient(manifest, env);
  if (options.txHash) {
    let owner;
    try { owner = privateKeyToAccount(env.AGENT_OWNER_PRIVATE_KEY).address; }
    catch { throw new CheckError('Root agent-owner key is missing or invalid; value withheld'); }
    const agent = await registrationFromReceipt({ client, manifest, txHash: options.txHash, owner });
    saveRegistration(root, agent);
    return { agentId: agent.agentId, registration: agent.registration, transactionsBroadcast: 0 };
  }
  if (['bootstrap', 'register'].includes(options.script)) {
    assertUndeployedManifest(manifest);
    requireCheck(!env.SENTINEL_AGENT_ID && !manifest.agent, 'An agent is already configured; confirm it before deploying or seeding');
  }
  if (options.script === 'seed' && !env.AGENT_OWNER_PRIVATE_KEY) env.AGENT_OWNER_PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY;
  if (options.script === 'bootstrap' && env.AGENT_OWNER_PRIVATE_KEY) {
    let sameOwner = false;
    try { sameOwner = equalHex(privateKeyToAccount(env.AGENT_OWNER_PRIVATE_KEY).address, privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY).address); }
    catch { throw new CheckError('Root owner credential is invalid; value withheld'); }
    requireCheck(sameOwner, 'Bootstrap registers the new agent to the deployer; configured owner differs');
  }
  if (['bootstrap', 'seed'].includes(options.script)) {
    const key = sentinelPublicKey(env);
    for (const [name, value] of [['SENTINEL_KEY_X', key.x], ['SENTINEL_KEY_Y', key.y]]) {
      requireCheck(!env[name] || equalHex(env[name], value), `${name} differs from root P256 signer`);
      env[name] = value;
    }
    const { getActiveTripwireModel } = await import('../packages/sentinel/dist/score/model.js');
    const modelHash = getActiveTripwireModel().hash;
    requireCheck(!env.SCORER_MODEL_HASH || equalHex(env.SCORER_MODEL_HASH, modelHash), 'Root scorer model hash is stale');
    env.SCORER_MODEL_HASH = modelHash;
  }
  return simulate({ ...options, env, manifest, client });
}

if (isMain(import.meta.url)) {
  process.umask(0o077);
  try { console.log(JSON.stringify(await main(), null, 2)); }
  catch (error) { console.error(error instanceof CheckError ? error.message : 'Deployment/seed operation failed; private diagnostics withheld'); process.exitCode = 1; }
}
