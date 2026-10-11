import { hashTypedData, encodeAbiParameters, keccak256, hexToBytes, toHex, stringToBytes } from 'viem';
import { p256 } from '@noble/curves/nist.js';
import fs from 'node:fs';
import { resolve } from 'node:path';

const VERDICT_EIP712_TYPES = {
  Verdict: [
    { name: 'agentId', type: 'uint256' },
    { name: 'modelHash', type: 'bytes32' },
    { name: 'inputHash', type: 'bytes32' },
    { name: 'policyId', type: 'bytes32' },
    { name: 'scoreBps', type: 'uint16' },
    { name: 'observedAt', type: 'uint64' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
  ],
};

const VERDICT_TYPEHASH = keccak256(
  stringToBytes(
    'Verdict(uint256 agentId,bytes32 modelHash,bytes32 inputHash,bytes32 policyId,uint16 scoreBps,uint64 observedAt,uint64 expiry,uint64 nonce)'
  )
);

const DOMAIN_TYPEHASH = keccak256(
  stringToBytes(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  )
);

function getDomainSeparator(chainId, contract) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typeHash', type: 'bytes32' },
        { name: 'nameHash', type: 'bytes32' },
        { name: 'versionHash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToBytes('Horkos')),
        keccak256(stringToBytes('1')),
        BigInt(chainId),
        contract,
      ]
    )
  );
}

function getStructHash(v) {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typeHash', type: 'bytes32' },
        { name: 'agentId', type: 'uint256' },
        { name: 'modelHash', type: 'bytes32' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'policyId', type: 'bytes32' },
        { name: 'scoreBps', type: 'uint256' },
        { name: 'observedAt', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
      ],
      [
        VERDICT_TYPEHASH,
        BigInt(v.agentId),
        v.modelHash,
        v.inputHash,
        v.policyId,
        BigInt(v.scoreBps),
        BigInt(v.observedAt),
        BigInt(v.expiry),
        BigInt(v.nonce),
      ]
    )
  );
}

function computeDigest(domainSeparator, structHash) {
  const prefix = new Uint8Array([0x19, 0x01]);
  const ds = hexToBytes(domainSeparator);
  const sh = hexToBytes(structHash);
  const combined = new Uint8Array(66);
  combined.set(prefix, 0);
  combined.set(ds, 2);
  combined.set(sh, 34);
  return keccak256(combined);
}

const privKeyBytes = new Uint8Array(32).fill(1);
const pub = p256.getPublicKey(privKeyBytes, false);
const pubX = `0x${Buffer.from(pub.slice(1, 33)).toString('hex')}`;
const pubY = `0x${Buffer.from(pub.slice(33, 65)).toString('hex')}`;

const standardContract = '0x000000000000000000000000000000000000beef';
const baseChainId = 10143;

const baseVerdict = {
  agentId: '1',
  modelHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
  inputHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
  policyId: '0x3333333333333333333333333333333333333333333333333333333333333333',
  scoreBps: 8500,
  observedAt: 1700000000,
  expiry: 1700003600,
  nonce: 42,
};

function signDigest(digest) {
  const sigBytes = p256.sign(hexToBytes(digest), privKeyBytes, { lowS: true, prehash: false });
  return {
    r: `0x${Buffer.from(sigBytes.slice(0, 32)).toString('hex')}`,
    s: `0x${Buffer.from(sigBytes.slice(32, 64)).toString('hex')}`,
  };
}

function makeVector(name, description, chainId, contract, vMod, expectedValid = true) {
  const v = { ...baseVerdict, ...vMod };
  const domainSep = getDomainSeparator(chainId, contract);
  const structHash = getStructHash(v);
  const digest = computeDigest(domainSep, structHash);

  const viemDigest = hashTypedData({
    domain: {
      name: 'Horkos',
      version: '1',
      chainId: BigInt(chainId),
      verifyingContract: contract,
    },
    types: VERDICT_EIP712_TYPES,
    primaryType: 'Verdict',
    message: {
      agentId: BigInt(v.agentId),
      modelHash: v.modelHash,
      inputHash: v.inputHash,
      policyId: v.policyId,
      scoreBps: v.scoreBps,
      observedAt: BigInt(v.observedAt),
      expiry: BigInt(v.expiry),
      nonce: BigInt(v.nonce),
    },
  });

  if (digest !== viemDigest) {
    throw new Error(`Digest mismatch for ${name}: custom=${digest} vs viem=${viemDigest}`);
  }

  const sig = signDigest(digest);

  return {
    name,
    description,
    chainId,
    verifyingContract: contract,
    domainSeparator: domainSep,
    structHash,
    digest,
    verdict: v,
    signer: {
      publicKey: { x: pubX, y: pubY },
    },
    signature: sig,
    signatureValid: true,
    expectedValid,
  };
}

const vectors = [
  makeVector(
    'valid',
    'Standard valid verdict on Monad testnet',
    baseChainId,
    standardContract,
    {},
    true
  ),
  makeVector(
    'tweaked_score',
    'Same inputs but scoreBps is tweaked from 8500 to 9500',
    baseChainId,
    standardContract,
    { scoreBps: 9500 },
    true
  ),
  makeVector(
    'tweaked_model',
    'Same inputs but modelHash is altered by 1 byte',
    baseChainId,
    standardContract,
    { modelHash: '0x11111111111111111111111111111111111111111111111111111111111111ff' },
    true
  ),
  makeVector(
    'wrong_chain_id',
    'Verdict signed for Ethereum Mainnet (chainId 1) instead of Monad testnet (chainId 10143)',
    1,
    standardContract,
    {},
    false
  ),
  makeVector(
    'expired',
    'Verdict with expiry in the past (observedAt 1000, expiry 1600)',
    baseChainId,
    standardContract,
    { observedAt: 1000, expiry: 1600 },
    false
  ),
];

const tamperedFields = {
  agentId: '2',
  modelHash: `0x${'12'.repeat(32)}`,
  inputHash: `0x${'23'.repeat(32)}`,
  policyId: `0x${'34'.repeat(32)}`,
  scoreBps: 8501,
  observedAt: 1700000001,
  expiry: 1700003601,
  nonce: 43,
};
for (const [field, value] of Object.entries(tamperedFields)) {
  const vector = makeVector(`tampered_${field}`, `Changed ${field} without re-signing`, baseChainId, standardContract, { [field]: value }, false);
  vector.signature = vectors[0].signature;
  vector.signatureValid = false;
  vectors.push(vector);
}
vectors.push(makeVector('wrong_registry', 'Signed for a different registry domain', baseChainId,
  '0x000000000000000000000000000000000000cafe', {}, false));

const checkIndex = process.argv.indexOf('--check');
const outputPath = checkIndex !== -1 && process.argv[checkIndex + 1]
  ? resolve(process.argv[checkIndex + 1]) : new URL('../test-vectors/verdict-vectors.json', import.meta.url);
const content = JSON.stringify({ version: 2, vectors }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(outputPath, 'utf8') !== content) throw new Error('Shared vectors differ from deterministic generator; run pnpm vectors:generate');
  console.log(`Checked ${vectors.length} deterministic public-only vectors.`);
} else {
  fs.writeFileSync(outputPath, content);
  console.log(`Generated ${vectors.length} public-only vectors in test-vectors/verdict-vectors.json.`);
}
