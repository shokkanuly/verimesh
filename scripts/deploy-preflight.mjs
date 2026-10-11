import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { parseAbi, parseEther } from 'viem';
import { sentinelPublicKey } from './doctor.mjs';
import { root, CheckError, requireCheck, equalHex, addressOf, loadManifest, loadEnvironment, gitState, publicClient, runCommand, isMain } from './deployment-checks.mjs';

const identityAbi = parseAbi(['function ownerOf(uint256) view returns (address)']);

export function environmentBlockers(directory, env) {
  const blockers = [];
  for (const name of ['.env', 'sentinel-p256.key']) {
    const path = resolve(directory, name);
    if (!existsSync(path)) continue;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
      blockers.push(`${name} must be a regular, owner-only file (chmod 600); contents withheld`);
    }
  }
  return blockers;
}

function weakSecret(value) {
  return BigInt(value) <= 0xffffn || /^([\da-fA-F]{2})\1{31}$/i.test(value.slice(2));
}

export function credentialReadiness({ env, exposedAddresses, fixtureKeys, modelHash, allowRegistration = false }) {
  const blockers = [];
  const roles = {};
  for (const [name, role] of [['DEPLOYER_PRIVATE_KEY', 'deployer'], ['AGENT_OWNER_PRIVATE_KEY', 'agentOwner']]) {
    const value = env[name];
    if (typeof value !== 'string' || !/^0x[\da-fA-F]{64}$/.test(value)) {
      blockers.push(`${name} is missing or malformed; value withheld`);
      continue;
    }
    try {
      roles[role] = privateKeyToAccount(value).address;
      if (weakSecret(value) || exposedAddresses.some(address => equalHex(address, roles[role]))) {
        blockers.push(`${name} is an exposed or unsafe fixture wallet; rotate it before funding/deployment`);
      }
    } catch { blockers.push(`${name} is invalid; value and library error withheld`); }
  }
  let publicKey;
  try {
    publicKey = sentinelPublicKey(env);
    if (weakSecret(env.SENTINEL_P256_PRIVATE_KEY) || fixtureKeys.some(key => equalHex(key.x, publicKey.x) && equalHex(key.y, publicKey.y))) {
      blockers.push('SENTINEL_P256_PRIVATE_KEY is a public/unsafe fixture signer; use the fresh private P256 signer');
    }
    for (const [name, coordinate] of [['SENTINEL_KEY_X', 'x'], ['SENTINEL_KEY_Y', 'y']]) {
      if (env[name] && !equalHex(env[name], publicKey[coordinate])) blockers.push(`${name} differs from the local signer public key`);
    }
  } catch { blockers.push('SENTINEL_P256_PRIVATE_KEY is missing or invalid; value withheld'); }
  if (env.CHAIN_ID && env.CHAIN_ID !== '10143') blockers.push('CHAIN_ID must be 10143');
  const agentId = env.SENTINEL_AGENT_ID;
  if (!(allowRegistration && !agentId) && (typeof agentId !== 'string' || !/^(0|[1-9]\d*)$/.test(agentId) || BigInt(agentId) >= 2n ** 256n)) {
    blockers.push('SENTINEL_AGENT_ID must be a uint256 decimal string');
  }
  requireCheck(typeof modelHash === 'string' && /^0x[\da-fA-F]{64}$/.test(modelHash), 'Computed scorer model hash is unavailable');
  if (env.SCORER_MODEL_HASH && !equalHex(env.SCORER_MODEL_HASH, modelHash)) blockers.push('SCORER_MODEL_HASH is stale; it differs from the built scorer source/config');
  return { blockers, configuration: blockers.length ? undefined : { ...roles, agentId, publicKey, modelHash } };
}

export function credentialContext(directory, env, modelHash, options = {}) {
  let exposure;
  let vectors;
  try {
    exposure = JSON.parse(readFileSync(resolve(directory, 'evidence/phase0-ownership.json'), 'utf8'));
    vectors = JSON.parse(readFileSync(resolve(directory, 'test-vectors/verdict-vectors.json'), 'utf8')).vectors;
    requireCheck(exposure.agentOwner?.verified && typeof exposure.agentOwner.address === 'string', 'Missing exposed-wallet safety metadata');
    requireCheck(Array.isArray(vectors) && vectors.length > 0 && vectors.every(vector => vector.signer?.publicKey?.x && vector.signer?.publicKey?.y), 'Missing public-fixture safety metadata');
  } catch { throw new CheckError('Public wallet/fixture safety metadata could not be loaded'); }
  const result = credentialReadiness({ env, modelHash, ...options, exposedAddresses: [exposure.agentOwner.address], fixtureKeys: vectors.map(vector => vector.signer.publicKey) });
  result.blockers.unshift(...environmentBlockers(directory, env));
  return result;
}

export function requireCredentials(context) {
  requireCheck(context.blockers.length === 0, `Deployment blocked:\n${context.blockers.map(message => `- ${message}`).join('\n')}`);
  return context.configuration;
}

export async function preflight({ manifest, client, credentials, provenance, snapshot, forDeployment = false }) {
  const configuration = requireCredentials(credentials);
  requireCheck(!provenance.dirty && /^[\da-f]{40}$/.test(provenance.head), 'Commit intended source before deployment; working tree is dirty or provenance is missing');
  if (forDeployment) requireCheck(manifest.stage === 'undeployed', 'Manifest is already deployed; deployment rerun refused');
  requireCheck(manifest.chainId === 10143 && await client.getChainId() === 10143, 'Preflight RPC/manifest must target Monad testnet (10143)');
  const block = snapshot ?? await client.getBlock();
  const identity = addressOf(manifest, 'ERC8004Identity');
  requireCheck((await client.getCode({ address: identity, blockNumber: block.number }))?.length > 2, 'ERC-8004 identity has no code');
  const registrationRequired = !configuration.agentId;
  if (registrationRequired) requireCheck(manifest.stage === 'undeployed' && !manifest.agent, 'Missing agent ID is allowed only before fresh registration');
  else {
    const owner = await client.readContract({ address: identity, abi: identityAbi, functionName: 'ownerOf', args: [BigInt(configuration.agentId)], blockNumber: block.number });
    requireCheck(equalHex(owner, configuration.agentOwner), 'Fresh agent-owner wallet does not own SENTINEL_AGENT_ID; transfer ownership or register a fresh agent');
    requireCheck(!manifest.agent || manifest.agent.agentId === configuration.agentId, 'Registered manifest agent differs from root environment');
  }
  const wallets = [];
  for (const [role, address, minimum] of [
    ['deployer', configuration.deployer, parseEther('0.1')],
    ['agentOwner', configuration.agentOwner, parseEther('0.01')],
  ]) {
    const balance = await client.getBalance({ address, blockNumber: block.number });
    requireCheck(balance >= minimum, `${role} wallet has insufficient testnet MON (minimum ${role === 'deployer' ? '0.1' : '0.01'})`);
    const nonce = await client.getTransactionCount({ address, blockNumber: block.number });
    const pending = await client.getTransactionCount({ address, blockTag: 'pending' });
    requireCheck(nonce === pending, `${role} wallet has pending transactions; wait and rerun preflight`);
    wallets.push({ role, address, balanceWei: balance.toString(), nonce });
  }
  requireCheck(equalHex((await client.getBlock({ blockNumber: block.number })).hash, block.hash), 'Preflight snapshot was reorganized; rerun');
  return { ready: true, chainId: 10143, sourceCommit: provenance.head, checkedAtBlock: block.number.toString(), wallets,
    agentId: configuration.agentId || null, registrationRequired, publicKey: configuration.publicKey, modelHash: configuration.modelHash, transactionsBroadcast: 0 };
}

export async function main() {
  requireCheck(process.argv.length === 2, 'deploy:preflight takes no flags and never sends transactions');
  const env = loadEnvironment();
  const manifest = loadManifest();
  const { getActiveTripwireModel } = await import('../packages/sentinel/dist/score/model.js');
  const credentials = credentialContext(root, env, getActiveTripwireModel().hash, { allowRegistration: manifest.stage === 'undeployed' && !manifest.agent });
  requireCredentials(credentials);
  return preflight({ manifest, credentials, client: publicClient(manifest, env), provenance: gitState(), forDeployment: true });
}

if (isMain(import.meta.url)) await runCommand('Deployment preflight', main);
