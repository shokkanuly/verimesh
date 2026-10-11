import { encodeAbiParameters, keccak256 } from 'viem';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const abiTypes = ['bytes32', 'uint256', 'uint256', 'uint256', 'address', 'uint64', 'uint64'];
const base = {
  routeId: `0x${'12'.repeat(32)}`, amount: '5000000000000000000',
  sourceChainId: '1', targetChainId: '10143', recipient: `0x${'34'.repeat(20)}`,
  timestamp: '1700000000', nonce: '42',
};
const max256 = ((1n << 256n) - 1n).toString();
const max64 = ((1n << 64n) - 1n).toString();
function vector(name, changes = {}) {
  const event = { ...base, ...changes };
  const encoded = encodeAbiParameters(abiTypes.map(type => ({ type })), [
    event.routeId, BigInt(event.amount), BigInt(event.sourceChainId), BigInt(event.targetChainId),
    event.recipient, BigInt(event.timestamp), BigInt(event.nonce),
  ]);
  return { name, event, encoded, inputHash: keccak256(encoded) };
}
const vectors = [
  vector('baseline'),
  vector('zero', { routeId: `0x${'00'.repeat(32)}`, amount: '0', sourceChainId: '0', targetChainId: '0',
    recipient: `0x${'00'.repeat(20)}`, timestamp: '0', nonce: '0' }),
  vector('maximum_widths', { routeId: `0x${'ff'.repeat(32)}`, amount: max256,
    sourceChainId: max256, targetChainId: max256, recipient: `0x${'ff'.repeat(20)}`, timestamp: max64, nonce: max64 }),
  vector('above_javascript_safe_integer', { amount: '9007199254740993', sourceChainId: '9007199254740993',
    targetChainId: '9007199254740995', timestamp: '9007199254740993', nonce: '9007199254740995' }),
  vector('swapped_chains', { sourceChainId: base.targetChainId, targetChainId: base.sourceChainId }),
];
for (const [field, value] of Object.entries({
  routeId: `0x${'12'.repeat(31)}13`, amount: '5000000000000000001', sourceChainId: '2', targetChainId: '10144',
  recipient: `0x${'34'.repeat(19)}35`, timestamp: '1700000001', nonce: '43',
})) vectors.push(vector(`changed_${field}`, { [field]: value }));

const content = JSON.stringify({ version: 1, encoding: 'abi.encode', abiTypes, vectorCount: vectors.length, vectors }, null, 2) + '\n';
const checkIndex = process.argv.indexOf('--check');
const path = checkIndex !== -1 && process.argv[checkIndex + 1]
  ? resolve(process.argv[checkIndex + 1]) : new URL('../test-vectors/input-vectors.json', import.meta.url);
if (checkIndex !== -1) {
  if (readFileSync(path, 'utf8') !== content) throw new Error('Shared input vectors differ from deterministic generator');
  console.log(`Checked ${vectors.length} deterministic normalized-input vectors.`);
} else {
  writeFileSync(path, content);
  console.log(`Generated ${vectors.length} normalized-input vectors.`);
}
