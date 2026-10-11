import { p256 } from '@noble/curves/nist.js';
import { hexToBytes, bytesToHex, parseAbi, keccak256, toHex } from 'viem';
import { root, requireCheck, CheckError, equalHex, addressOf, validateManifest, loadManifest, loadEnvironment, gitState, checkProvenance, buildArtifacts, publicClient, minimumDemoBalance, runCommand, isMain } from './deployment-checks.mjs';

const identityAbi = parseAbi(['function ownerOf(uint256) view returns (address)']);
const trustEvents = parseAbi([
  'event TrustedAgentSet(uint256 indexed agentId, bool trusted)',
  'event TrustedModelSet(bytes32 indexed modelHash, bool trusted)',
]);

export function sentinelPublicKey(env) {
  requireCheck(typeof env.SENTINEL_P256_PRIVATE_KEY === 'string' && /^0x[\da-fA-F]{64}$/.test(env.SENTINEL_P256_PRIVATE_KEY),
    'SENTINEL_P256_PRIVATE_KEY is missing or malformed; value withheld');
  try {
    const publicKey = p256.getPublicKey(hexToBytes(env.SENTINEL_P256_PRIVATE_KEY), false);
    return { x: bytesToHex(publicKey.slice(1, 33)), y: bytesToHex(publicKey.slice(33)) };
  } catch { throw new CheckError('P256 signer is invalid; key and library error withheld'); }
}

export function replayAllowlists(logs) {
  const agents = new Set();
  const models = new Set();
  for (const log of [...logs].sort((a, b) => a.blockNumber < b.blockNumber ? -1 : a.blockNumber > b.blockNumber ? 1 : a.logIndex - b.logIndex)) {
    requireCheck(!log.removed && typeof log.args?.trusted === 'boolean', 'Trust history contains a removed or malformed log');
    const agent = log.eventName === 'TrustedAgentSet';
    requireCheck(agent || log.eventName === 'TrustedModelSet', 'Unexpected event in guardian trust history');
    const value = agent ? log.args.agentId?.toString() : log.args.modelHash?.toLowerCase();
    requireCheck(!!value, 'Trust log is missing its agent/model identifier');
    const set = agent ? agents : models;
    if (log.args.trusted) set.add(value);
    else set.delete(value);
  }
  return { agents: [...agents].sort(), models: [...models].sort() };
}

export async function doctor({ manifest, client, artifacts, publicKey, modelHash, scope = 'demo', snapshot }) {
  requireCheck(scope === 'demo' || scope === 'phase1', 'Unknown doctor scope');
  validateManifest(manifest);
  requireCheck(await client.getChainId() === manifest.chainId, 'RPC chain differs from Monad testnet');
  const block = snapshot ?? await client.getBlock();
  const registry = addressOf(manifest, 'VerdictRegistry');
  const guardian = addressOf(manifest, 'TripwireGuardianV2');
  const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args, blockNumber: block.number });
  const registryAbi = artifacts.VerdictRegistry.abi;
  const guardianAbi = artifacts.TripwireGuardianV2.abi;
  const agent = BigInt(manifest.agent.agentId);
  requireCheck(equalHex(await read(registry, registryAbi, 'identityRegistry'), addressOf(manifest, 'ERC8004Identity')), 'Registry points at the wrong ERC-8004 identity');
  requireCheck(equalHex(await read(addressOf(manifest, 'ERC8004Identity'), identityAbi, 'ownerOf', [agent]), manifest.owners.agent), 'ERC-8004 agent owner differs from manifest');
  requireCheck(equalHex(publicKey.x, manifest.agent.keyX) && equalHex(publicKey.y, manifest.agent.keyY), 'Local sentinel public key differs from manifest');
  const [x, y, epoch, active] = await read(registry, registryAbi, 'currentKey', [agent]);
  requireCheck(active && equalHex(x, publicKey.x) && equalHex(y, publicKey.y) && Number(epoch) === manifest.agent.epoch,
    'Onchain sentinel key is inactive or differs from the local key/manifest epoch');
  requireCheck(equalHex(await read(guardian, guardianAbi, 'horkos'), registry), 'Guardian points at the wrong registry');
  requireCheck(equalHex(await read(guardian, guardianAbi, 'owner'), manifest.owners.guardian), 'Guardian owner differs from manifest');
  requireCheck(BigInt(await read(guardian, guardianAbi, 'pendingOwner')) === 0n, 'Guardian has a pending ownership transfer');
  requireCheck(equalHex(await read(guardian, guardianAbi, 'policyId'), keccak256(toHex('TRIPWIRE_CIRCUIT_BREAKER_POLICY'))), 'Guardian policy differs from deployment policy');
  requireCheck(Number(await read(guardian, guardianAbi, 'currentTier')) === 0, 'Guardian still has an active restriction; reset before demo');
  requireCheck(manifest.allowlists.models.some(hash => equalHex(hash, modelHash)), 'Local scorer model is not in the manifest allowlist');
  for (const id of manifest.allowlists.agents) {
    requireCheck(await read(guardian, guardianAbi, 'trustedAgents', [BigInt(id)]) === true, 'Expected agent is not trusted by guardian');
  }
  for (const hash of manifest.allowlists.models) {
    requireCheck(await read(guardian, guardianAbi, 'trustedModels', [hash]) === true, 'Expected model is not trusted by guardian');
  }
  const logs = [];
  const from = BigInt(manifest.contracts.TripwireGuardianV2.block);
  requireCheck(from <= block.number, 'Guardian deployment block is ahead of RPC');
  for (let start = from; start <= block.number; start += 100n) {
    const to = start + 99n < block.number ? start + 99n : block.number;
    const batch = await client.getLogs({ address: guardian, events: trustEvents, fromBlock: start, toBlock: to, strict: true });
    requireCheck(batch.every(log => equalHex(log.address, guardian) && log.blockNumber >= start && log.blockNumber <= to), 'RPC returned trust logs outside the requested guardian/range');
    logs.push(...batch);
  }
  const allowlists = replayAllowlists(logs);
  requireCheck(JSON.stringify(allowlists.agents) === JSON.stringify([...manifest.allowlists.agents].sort())
    && JSON.stringify(allowlists.models) === JSON.stringify(manifest.allowlists.models.map(hash => hash.toLowerCase()).sort()),
  'Guardian trust history differs from manifest (missing or extra allowlisted entries)');
  let bridge;
  if (scope === 'phase1') {
    requireCheck(!manifest.contracts.MockBridge, 'Phase 1 scope cannot bypass a recorded bridge; use full doctor');
    requireCheck(BigInt(await read(guardian, guardianAbi, 'bridge')) === 0n, 'Phase 1 guardian has an unrecorded bridge');
  } else {
    requireCheck(!!manifest.contracts.MockBridge, 'MockBridge enforcement is not deployed; F-20 is still pending');
    bridge = addressOf(manifest, 'MockBridge');
    requireCheck(equalHex(await read(guardian, guardianAbi, 'bridge'), bridge), 'Guardian bridge adapter differs from manifest');
    requireCheck((await client.getCode({ address: bridge, blockNumber: block.number }))?.length > 2, 'Bridge adapter has no deployed code');
    const bridgeAbi = artifacts.MockBridge?.abi;
    requireCheck(Array.isArray(bridgeAbi), 'Fresh MockBridge artifact is unavailable');
    requireCheck(equalHex(await read(bridge, bridgeAbi, 'guardian'), guardian), 'Bridge points at the wrong guardian');
    requireCheck(equalHex(await read(bridge, bridgeAbi, 'owner'), manifest.owners.demo), 'Bridge owner differs from the demo wallet');
    requireCheck(BigInt(await read(bridge, bridgeAbi, 'pendingOwner')) === 0n, 'Bridge has a pending ownership transfer');
    requireCheck(typeof manifest.guardian?.outflowCap === 'string' && /^(0|[1-9]\d*)$/.test(manifest.guardian.outflowCap)
      && BigInt(manifest.guardian.outflowCap) > 0n && BigInt(manifest.guardian.outflowCap) < 2n ** 256n,
    'Manifest must record a positive uint256 guardian outflow cap');
    requireCheck(await read(guardian, guardianAbi, 'outflowCap') === BigInt(manifest.guardian.outflowCap), 'Guardian outflow cap differs from manifest');
    const windowStart = await read(guardian, guardianAbi, 'windowStartedAt');
    const window = await read(guardian, guardianAbi, 'THROTTLE_WINDOW');
    const outflow = await read(guardian, guardianAbi, 'windowOutflow');
    requireCheck(outflow === 0n || block.timestamp >= windowStart + window, 'Current outflow window has leftover demo activity');
  }
  const balance = await client.getBalance({ address: manifest.owners.demo, blockNumber: block.number });
  requireCheck(balance >= minimumDemoBalance, 'Demo wallet has less than 0.1 testnet MON');
  const canonical = await client.getBlock({ blockNumber: block.number });
  requireCheck(equalHex(canonical.hash, block.hash), 'Doctor snapshot was reorganized; rerun the check');
  return { chainId: manifest.chainId, checkedAtBlock: block.number.toString(), checkedAtBlockHash: block.hash, agentId: manifest.agent.agentId,
    epoch: Number(epoch), guardianOwner: manifest.owners.guardian, bridge, allowlists, balanceWei: balance.toString(),
    scope, demoReady: scope === 'demo', bridgePending: scope === 'phase1' };
}

export async function main() {
  const flags = process.argv.slice(2);
  requireCheck(flags.length === 0 || (flags.length === 1 && flags[0] === '--phase1'), 'doctor accepts only --phase1; it never rotates keys or sends transactions');
  const manifest = loadManifest();
  checkProvenance(manifest, gitState(root, manifest.commit));
  const env = loadEnvironment();
  const artifacts = buildArtifacts();
  const { getActiveTripwireModel } = await import('../packages/sentinel/dist/score/model.js');
  return doctor({ manifest, client: publicClient(manifest, env), artifacts, publicKey: sentinelPublicKey(env), modelHash: getActiveTripwireModel().hash,
    scope: flags.length ? 'phase1' : 'demo' });
}

if (isMain(import.meta.url)) {
  await runCommand('Doctor', main);
}
