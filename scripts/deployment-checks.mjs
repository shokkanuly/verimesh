import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { decode } from 'cborg';
import { createPublicClient, http, getAddress, hexToBytes, bytesToHex, keccak256, encodeAbiParameters, toHex, parseEther } from 'viem';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function isMain(url) {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); }
  catch { return false; }
}
export const contractNames = ['VerdictRegistry', 'TripwireGuardianV2', 'SimpleGate'];
export function deploymentContractNames(manifest) {
  return manifest.contracts?.MockBridge === undefined ? contractNames : [...contractNames, 'MockBridge'];
}
const paths = {
  VerdictRegistry: 'VerdictRegistry.sol',
  TripwireGuardianV2: 'TripwireGuardianV2.sol',
  SimpleGate: 'SimpleGate.sol',
  MockBridge: 'MockBridge.sol',
};

export class CheckError extends Error {}
export function requireCheck(ok, message) {
  if (!ok) throw new CheckError(message);
}
export const equalHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const isHash = value => typeof value === 'string' && /^0x[\da-fA-F]{64}$/.test(value);
const isUint = value => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) < 2n ** 256n;

export function addressOf(manifest, name) {
  const record = manifest.contracts?.[name];
  const value = typeof record === 'string' ? record : record?.address;
  try {
    const address = getAddress(value);
    requireCheck(BigInt(address) !== 0n, `Manifest ${name} address is zero`);
    return address;
  } catch {
    throw new CheckError(`Manifest ${name} address is missing or invalid`);
  }
}

export function validateManifest(manifest) {
  requireCheck(manifest.chainId === 10143, 'Manifest must target Monad testnet (10143)');
  requireCheck(typeof manifest.commit === 'string' && /^[\da-f]{40}$/.test(manifest.commit),
    'Manifest lacks deployment commit provenance; historical addresses are not a verified deployment');
  requireCheck(manifest.solc === '0.8.24', 'Manifest compiler must be 0.8.24');
  addressOf(manifest, 'ERC8004Identity');
  const addresses = new Set();
  for (const name of deploymentContractNames(manifest)) {
    const record = manifest.contracts?.[name];
    const address = addressOf(manifest, name).toLowerCase();
    requireCheck(!addresses.has(address), 'Manifest contract addresses must be distinct');
    addresses.add(address);
    requireCheck(isHash(record?.txHash) && isHash(record?.runtimeCodehash) && isHash(record?.constructorArgsHash)
      && Number.isSafeInteger(record?.block) && record.block > 0,
    `Manifest ${name} lacks confirmed receipt/code/constructor provenance`);
  }
  requireCheck(isUint(manifest.agent?.agentId), 'Manifest agent ID must be a uint256 decimal string');
  requireCheck(isHash(manifest.agent?.keyX) && isHash(manifest.agent?.keyY)
    && BigInt(manifest.agent.keyX) !== 0n && BigInt(manifest.agent.keyY) !== 0n
    && Number.isInteger(manifest.agent?.epoch) && manifest.agent.epoch > 0 && manifest.agent.epoch < 2 ** 32,
  'Manifest requires a public P256 key and positive uint32 epoch');
  for (const name of ['agent', 'guardian', 'demo']) {
    try { requireCheck(BigInt(getAddress(manifest.owners?.[name])) !== 0n, 'Invalid owner'); }
    catch { throw new CheckError(`Manifest owners.${name} must be a nonzero public address`); }
  }
  if (manifest.agent.registration !== undefined) {
    validateRegistration(manifest.agent.registration);
    requireCheck(equalHex(manifest.agent.registration.owner, manifest.owners.agent), 'Agent registration owner differs from manifest owner');
  }
  try { requireCheck(BigInt(getAddress(manifest.deployer)) !== 0n, 'Invalid deployer'); }
  catch { throw new CheckError('Manifest deployer must be a nonzero public address'); }
  const agents = manifest.allowlists?.agents;
  const models = manifest.allowlists?.models;
  requireCheck(Array.isArray(agents) && agents.length > 0 && agents.every(isUint) && new Set(agents).size === agents.length
    && agents.includes(manifest.agent.agentId), 'Manifest agent allowlist is invalid');
  requireCheck(Array.isArray(models) && models.length > 0 && models.every(isHash)
    && new Set(models.map(value => value.toLowerCase())).size === models.length, 'Manifest model allowlist is invalid');
  return manifest;
}

export function assertUndeployedManifest(manifest) {
  const fields = ['chainId', 'network', 'rpcUrl', 'explorerUrl', 'stage', 'contracts', 'agent'];
  requireCheck(manifest.stage === 'undeployed' && Object.keys(manifest).every(key => fields.includes(key))
    && manifest.chainId === 10143 && manifest.network === 'monad-testnet'
    && manifest.rpcUrl === 'https://testnet-rpc.monad.xyz' && manifest.explorerUrl === 'https://testnet.monadscan.com',
  'Undeployed manifest requires only public Monad testnet configuration');
  requireCheck(manifest.contracts && !Array.isArray(manifest.contracts)
    && Object.keys(manifest.contracts).length === 1 && typeof manifest.contracts.ERC8004Identity === 'string',
  'Undeployed manifest must contain only the external ERC8004Identity address');
  addressOf(manifest, 'ERC8004Identity');
  if (manifest.agent !== undefined) {
    requireCheck(Object.keys(manifest.agent).length === 2 && isUint(manifest.agent.agentId)
      && manifest.agent.registration, 'Undeployed agent requires a confirmed registration record');
    validateRegistration(manifest.agent.registration);
  }
}

export function validateRegistration(record) {
  requireCheck(record && Object.keys(record).length === 3 && Object.keys(record).every(key => ['txHash', 'block', 'owner'].includes(key))
    && isHash(record.txHash) && Number.isSafeInteger(record.block) && record.block > 0,
  'Agent registration requires public receipt provenance');
  try { requireCheck(BigInt(getAddress(record.owner)) !== 0n, 'Invalid registration owner'); }
  catch { throw new CheckError('Agent registration owner is invalid'); }
}

export function loadManifest(directory = root) {
  try { return JSON.parse(readFileSync(resolve(directory, 'deployments/monad-testnet.json'), 'utf8')); }
  catch { throw new CheckError('Deployment manifest could not be read as JSON'); }
}

export function loadEnvironment(directory = root) {
  try {
    const path = resolve(directory, '.env');
    if (!existsSync(path)) return { ...process.env };
    const values = parseEnv(readFileSync(path, 'utf8'));
    const names = Object.keys(parseEnv(readFileSync(resolve(root, '.env.example'), 'utf8')));
    return { ...process.env, ...Object.fromEntries(names.map(name => [name, values[name] ?? ''])), ...values };
  } catch { throw new CheckError('Local environment could not be parsed; contents withheld'); }
}

export function gitState(directory = root, commit, publicationArtifacts = []) {
  requireCheck(Array.isArray(publicationArtifacts) && publicationArtifacts.every(path =>
    typeof path === 'string' && /^deployments\/archive\/[\da-f]{64}\.(?:json|DEPRECATED\.md)$/.test(path)),
  'Only exact public deployment archive outputs may be excluded from the final publication guard');
  const run = args => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    requireCheck(result.status === 0, 'Git provenance could not be read');
    return result.stdout.trim();
  };
  const head = run(['rev-parse', 'HEAD']);
  const sourceHash = revision => {
    const excluded = ['contracts/lib/forge-std/test/', 'contracts/lib/openzeppelin-contracts/lib/forge-std/test/'];
    const records = run(['ls-tree', '-r', '--full-tree', revision, '--', 'contracts', '.gitmodules'])
      .split('\n').filter(line => {
        const path = line.split('\t')[1];
        return path && path !== 'contracts/test/DeploymentSafety.t.sol' && !excluded.some(prefix => path.startsWith(prefix));
      });
    return keccak256(toHex(records.join('\n')));
  };
  let contractsUnchanged = false;
  if (typeof commit === 'string' && /^[\da-f]{40}$/.test(commit)) {
    const available = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: directory, encoding: 'utf8' });
    if (available.status === 0) {
      contractsUnchanged = sourceHash(commit) === sourceHash(head);
    } else {
      // A squashed release has no old commit objects; compare the exact recorded source tree.
      let source;
      try { source = JSON.parse(readFileSync(resolve(directory, 'deployments/source-tree.json'), 'utf8')); }
      catch { throw new CheckError('Deployment source tree proof is unavailable in this snapshot'); }
      requireCheck(source.deploymentCommit === commit && /^[\da-f]{40}$/.test(source.contractsTree)
        && (source.gitmodulesBlob === null || /^[\da-f]{40}$/.test(source.gitmodulesBlob)), 'Deployment source tree proof is invalid');
      const modules = run(['ls-tree', head, '--', '.gitmodules']);
      requireCheck(source.contractsSourceHash === undefined || isHash(source.contractsSourceHash), 'Deployment source file hash is invalid');
      contractsUnchanged = (source.contractsSourceHash === undefined
        ? run(['rev-parse', `${head}:contracts`]) === source.contractsTree : sourceHash(head) === source.contractsSourceHash)
        && (source.gitmodulesBlob === null ? modules === '' : modules.split(/\s+/)[2] === source.gitmodulesBlob);
    }
  }
  return { head, contractsUnchanged, dirty: run(['status', '--porcelain', '--untracked-files=all', '--', '.',
    ...publicationArtifacts.map(path => `:(exclude,literal)${path}`)]) !== '' };
}

export function checkProvenance(manifest, { head, dirty, contractsUnchanged = false }) {
  validateManifest(manifest);
  requireCheck(!dirty, 'Working tree is dirty; commit the intended deployment source before verification');
  requireCheck(head === manifest.commit || contractsUnchanged,
    'Contract sources/dependencies differ from the deployment commit; redeploy before verification');
}

export function buildArtifacts(directory = root) {
  const result = spawnSync('forge', ['build', '--force', '--silent'], {
    cwd: resolve(directory, 'contracts'), encoding: 'utf8',
    env: { ...process.env, MONAD_RPC_URL: '' }, maxBuffer: 16 * 1024 * 1024,
  });
  requireCheck(result.status === 0, 'Fresh Forge build failed; compiler output withheld');
  return Object.fromEntries([...contractNames, 'MockBridge'].map(name => {
    try { return [name, JSON.parse(readFileSync(resolve(directory, 'contracts/out', paths[name], `${name}.json`), 'utf8'))]; }
    catch { throw new CheckError(`Fresh ${name} artifact is unavailable`); }
  }));
}

export function publicClient(manifest, env) {
  const rpc = env.MONAD_RPC_URL || manifest.rpcUrl;
  try {
    const url = new URL(rpc);
    requireCheck(['https:', 'http:'].includes(url.protocol), 'Invalid RPC protocol');
    return createPublicClient({ transport: http(rpc, { timeout: 15000, retryCount: 0 }) });
  } catch { throw new CheckError('RPC URL is missing or invalid; value withheld'); }
}

export function runtimeBody(code) {
  requireCheck(typeof code === 'string' && /^0x(?:[\da-fA-F]{2})+$/.test(code), 'Runtime code is empty or malformed');
  const bytes = hexToBytes(code);
  requireCheck(bytes.length > 2, 'Runtime code has no Solidity metadata trailer');
  const length = bytes.at(-2) * 256 + bytes.at(-1);
  const start = bytes.length - length - 2;
  requireCheck(length > 0 && start > 0, 'Solidity metadata length is invalid');
  let metadata;
  try { metadata = decode(bytes.slice(start, -2), { strict: true, allowIndefinite: false, rejectDuplicateMapKeys: true }); }
  catch { throw new CheckError('Solidity metadata is not valid CBOR'); }
  requireCheck(metadata?.solc instanceof Uint8Array && metadata.solc.length === 3
    && bytesToHex(metadata.solc) === '0x000818', 'Runtime metadata compiler differs from 0.8.24');
  return bytes.slice(0, start);
}

export function compareRuntime(artifact, liveCode) {
  requireCheck(artifact.metadata?.compiler?.version === '0.8.24+commit.e11b9ed9', 'Artifact compiler differs from pinned Solidity');
  requireCheck(Object.keys(artifact.deployedBytecode?.linkReferences || {}).length === 0, 'Linked runtime libraries are not supported by this verifier');
  const local = runtimeBody(artifact.deployedBytecode?.object);
  const live = runtimeBody(liveCode);
  requireCheck(local.length === live.length, 'Runtime executable length differs from local build');
  const occupied = new Set();
  for (const ranges of Object.values(artifact.deployedBytecode?.immutableReferences || {})) {
    requireCheck(Array.isArray(ranges), 'Artifact immutable references are malformed');
    for (const { start, length } of ranges) {
      requireCheck(Number.isInteger(start) && start >= 0 && length === 32 && start + length <= local.length,
        'Artifact immutable reference is outside executable code');
      for (let index = start; index < start + length; index++) {
        requireCheck(!occupied.has(index), 'Artifact immutable references overlap');
        occupied.add(index);
      }
      local.fill(0, start, start + length);
      live.fill(0, start, start + length);
    }
  }
  requireCheck(bytesToHex(local) === bytesToHex(live), 'Runtime executable bytes differ from local build');
}

export function constructorArgs(manifest, name, artifact) {
  const registry = addressOf(manifest, 'VerdictRegistry');
  const values = {
    VerdictRegistry: [addressOf(manifest, 'ERC8004Identity')],
    TripwireGuardianV2: [registry, keccak256(toHex('TRIPWIRE_CIRCUIT_BREAKER_POLICY'))],
    SimpleGate: [registry, BigInt(manifest.agent.agentId), keccak256(toHex('SIMPLE_GATE_POLICY')), 8000, 300n],
    MockBridge: [addressOf(manifest, 'TripwireGuardianV2')],
  };
  const constructor = artifact?.abi?.find(item => item.type === 'constructor');
  requireCheck(!!constructor && !!values[name], 'Constructor ABI is unavailable');
  return encodeAbiParameters(constructor.inputs, values[name]);
}

export function assertExplorerSource(response, name, artifact, args) {
  const record = response?.result?.[0];
  requireCheck(response?.status === '1' && Array.isArray(response.result) && response.result.length === 1
    && typeof record?.SourceCode === 'string' && record.SourceCode.trim().length > 0
    && record.ABI !== 'Contract source code not verified' && record.ContractName === name
    && record.CompilerVersion === `v${artifact.metadata.compiler.version}` && record.Proxy === '0'
    && equalHex(`0x${record.ConstructorArguments || ''}`, args),
  `${name} source verification is missing or mismatched on the explorer`);
}

export function explorerVerifier(env, fetcher = fetch) {
  return async (name, address, artifact, args) => {
    if (!env.ETHERSCAN_API_KEY?.trim()) return { status: 'not-verified', provider: 'none', reason: 'Explorer API key absent; source publication is a separate post-deploy step' };
    const url = new URL('https://api.etherscan.io/v2/api');
    url.search = new URLSearchParams({ chainid: '10143', module: 'contract', action: 'getsourcecode', address, apikey: env.ETHERSCAN_API_KEY });
    let response;
    try {
      const result = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      requireCheck(result.ok, 'Explorer request failed');
      response = await result.json();
    } catch { throw new CheckError('Explorer source query failed; response and credentials withheld'); }
    assertExplorerSource(response, name, artifact, args);
    return { status: 'verified', provider: 'monadscan' };
  };
}

export async function verifyDeployment({ manifest, provenance, artifacts, client, verifyExplorer, snapshot }) {
  checkProvenance(manifest, provenance);
  requireCheck(await client.getChainId() === manifest.chainId, 'RPC chain differs from Monad testnet');
  const block = snapshot ?? await client.getBlock();
  const results = [];
  for (const name of deploymentContractNames(manifest)) {
    const record = manifest.contracts[name];
    const address = addressOf(manifest, name);
    const artifact = artifacts[name];
    const args = constructorArgs(manifest, name, artifact);
    requireCheck(equalHex(record.constructorArgsHash, keccak256(args)), `${name} constructor argument hash differs`);
    const receipt = await client.getTransactionReceipt({ hash: record.txHash });
    requireCheck(receipt.status === 'success' && equalHex(receipt.transactionHash, record.txHash)
      && receipt.blockNumber === BigInt(record.block) && receipt.blockNumber <= block.number && equalHex(receipt.contractAddress, address),
    `${name} deployment receipt is missing, failed or mismatched`);
    const tx = await client.getTransaction({ hash: record.txHash });
    requireCheck(tx.to === null && equalHex(tx.hash, record.txHash) && Number(tx.chainId) === manifest.chainId
      && tx.blockNumber === receipt.blockNumber && equalHex(tx.blockHash, receipt.blockHash)
      && equalHex(tx.from, manifest.deployer) && equalHex(receipt.from, tx.from)
      && equalHex(tx.input, `${artifact.bytecode.object}${args.slice(2)}`),
    `${name} creation transaction differs from the local constructor/build/deployer`);
    const deploymentBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
    requireCheck(equalHex(deploymentBlock.hash, receipt.blockHash), `${name} receipt is not in the canonical block`);
    const code = await client.getCode({ address, blockNumber: block.number });
    compareRuntime(artifact, code);
    requireCheck(equalHex(record.runtimeCodehash, keccak256(code)), `${name} full runtime codehash differs from the manifest`);
    const sourceVerification = await verifyExplorer(name, address, artifact, args);
    results.push({ name, address, txHash: record.txHash, block: record.block,
      ...(sourceVerification ? { sourceVerification } : {}) });
  }
  const canonical = await client.getBlock({ blockNumber: block.number });
  requireCheck(equalHex(canonical.hash, block.hash), 'Verification snapshot was reorganized; rerun the check');
  return { chainId: manifest.chainId, checkedAtBlock: block.number.toString(), checkedAtBlockHash: block.hash, commit: manifest.commit, contracts: results };
}

export async function runCommand(label, action) {
  try {
    const result = await action();
    console.log(`${label}: PASS`);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`${label}: FAIL - ${error instanceof CheckError ? error.message : 'RPC/build/input check failed; sensitive details withheld'}`);
    process.exitCode = 1;
  }
}

export const minimumDemoBalance = parseEther('0.1');
