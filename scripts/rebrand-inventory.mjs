import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashDomain, hashStruct, keccak256, stringToBytes, toFunctionSelector } from 'viem';
import { getDomain, hashInput, hashVerdict, VERDICT_EIP712_TYPES } from '../packages/sdk/dist/index.js';
import { computeModelHash } from '../packages/sentinel/dist/score/modelHash.js';
import { verifyTripwireBundle } from '../packages/sentinel/dist/score/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineCommit = '2b1c5d2355cdbd0d93942328eba65ece4b59ce63';
const outputDir = resolve(root, 'evidence/rebrand');
const namePattern = /veri[-_ ]?mesh/gi;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString('utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

// Freeze the inventory at RB-0 so this report cannot count its own audit text.
const files = git('ls-tree', '-r', '--name-only', '-z', baselineCommit).split('\0').filter(Boolean)
  .filter((path) => !/(^|\/)(node_modules|lib|dist|out|cache|build|broadcast|\.git)(\/|$)/.test(path))
  .filter((path) => !/(^|\/)\.env(?:\.|$)/.test(path) || path.endsWith('.env.example'))
  .filter((path) => !path.endsWith('.key') && !path.startsWith('deployments/.pending/')).sort();
git('diff', '--exit-code', baselineCommit, '--', ...files);

function replaceName(value) {
  return value.replace(namePattern, (match) => {
    if (match === 'VeriMesh' || match === 'Verimesh') return 'Horkos';
    if (match === 'VERIMESH') return 'HORKOS';
    if (match === 'verimesh') return 'horkos';
    if (['veri-mesh', 'Veri Mesh', 'Veri-Mesh'].includes(match)) return 'Horkos';
    throw new Error(`Unmapped variant: ${match}`);
  });
}

function categories(path, source) {
  const result = new Set();
  if (path.startsWith('evidence/')) result.add('evidence/generated');
  else if (path.startsWith('.github/')) result.add('CI');
  else if (/\.(md|docx)$/.test(path) || path.startsWith('docs/')) result.add('docs');
  else if (path.startsWith('apps/dashboard/')) result.add('UI');
  else result.add('code identifier / string constant');
  if (/package\.json$|pnpm-lock\.yaml$/.test(path) || source.includes('@verimesh/') || path === '.gitleaks.toml') result.add('package/path');
  if (['packages/sdk/src/domain.ts', 'contracts/src/libs/VerdictLib.sol', 'scripts/gen-vectors.js'].includes(path)) result.add('EIP-712 domain');
  if (/\bVERIMESH_[A-Z0-9_]+\b/.test(source)) result.add('env var');
  return [...result];
}

function plannedReplacement(path, source) {
  if (path.startsWith('evidence/')) return 'Regenerate reproducible artifacts; preserve historical raw evidence with STALE/DEPRECATED context, pending approval. Do not rewrite history as a new run.';
  const variants = [...new Set(source.match(namePattern) ?? [])].sort();
  return variants.map((variant) => `${variant} -> ${replaceName(variant)}`).join('; ')
    + (path === 'pnpm-lock.yaml' ? '; regenerate via pnpm install, not a manual lockfile rewrite' : '')
    + (path.endsWith('.docx') ? '; structured DOCX edit, then check readable text and formatting' : '');
}

const sources = new Map();
for (const path of files) {
  const bytes = read(path);
  if (!bytes.includes(0) && !/\.(png|jpg|jpeg|ico|docx)$/.test(path)) sources.set(path, bytes.toString('utf8'));
}
const inventory = [...sources].flatMap(([path, source]) => {
  const matches = [...source.matchAll(namePattern)];
  if (!matches.length) return [];
  return [{ path, occurrences: matches.length, categories: categories(path, source),
    variants: [...new Set(matches.map((match) => match[0]))].sort(), plannedReplacement: plannedReplacement(path, source) }];
});
const rgCounts = new Map();
const rgOutput = execFileSync('rg', ['--json', '-i', 'veri[-_ ]?mesh', '--', ...sources.keys()],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
for (const line of rgOutput.trim().split('\n')) {
  const entry = JSON.parse(line);
  if (entry.type === 'match') rgCounts.set(entry.data.path.text,
    (rgCounts.get(entry.data.path.text) ?? 0) + entry.data.submatches.length);
}
assert.equal(rgCounts.size, inventory.length);
for (const row of inventory) assert.equal(rgCounts.get(row.path), row.occurrences, `Literal search differs for ${row.path}`);

// DOCX text can split a word across XML runs; inspect paragraphs, not ZIP bytes.
const docxAudit = JSON.parse(execFileSync('python3', ['-c', `
import zipfile, xml.etree.ElementTree as E, re, json, sys
z=zipfile.ZipFile(sys.argv[1]); parts=[]; total=0
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
pat=re.compile(r'veri[-_ ]?mesh',re.I)
for name in z.namelist():
 if not name.endswith('.xml'): continue
 tree=E.fromstring(z.read(name))
 body='\\n'.join(''.join(p.itertext()) for p in tree.findall('.//w:p',ns)) if name.startswith('word/') else E.tostring(tree,encoding='unicode')
 matches=pat.findall(body); total+=len(matches)
 hashes=re.findall(r'0x[0-9a-fA-F]{64}(?![0-9a-fA-F])',body)
 if matches or hashes: parts.append({'part':name,'occurrences':len(matches),'variants':sorted(set(matches)),'hashCandidates':len(hashes)})
print(json.dumps({'occurrences':total,'parts':parts}))
`, resolve(root, 'docs/02_VeriMesh_Protocol.docx')], { encoding: 'utf8' }));
inventory.push({ path: 'docs/02_VeriMesh_Protocol.docx', occurrences: docxAudit.occurrences, categories: ['docs'],
  variants: [...new Set(docxAudit.parts.flatMap((part) => part.variants))],
  plannedReplacement: plannedReplacement('docs/02_VeriMesh_Protocol.docx', docxAudit.parts.flatMap((part) => part.variants).join(' ')) });
inventory.sort((a, b) => a.path.localeCompare(b.path, 'en'));

const pathRenames = files.filter((path) => /veri[-_ ]?mesh/i.test(path)).map((path) => ({ old: path, proposed: replaceName(path) }));
const directoryNames = [...new Set(files.flatMap((path) => {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}))].filter((path) => /veri[-_ ]?mesh/i.test(path));

const modelInputs = [
  ['v1', 'packages/sentinel/src/score/rules.ts', 'packages/sentinel/config/model.json'],
  ['v2', 'packages/sentinel/src/score/rules-v2.ts', 'packages/sentinel/config/model-v2.json'],
];
const models = modelInputs.map(([version, sourcePath, configPath]) => {
  const source = text(sourcePath), config = text(configPath);
  const oldHash = computeModelHash(source, config), prospectiveHash = computeModelHash(replaceName(source), replaceName(config));
  assert.equal(oldHash, prospectiveHash, `${version} scorer hash unexpectedly changes`);
  return { version, inputs: [sourcePath, configPath], occurrences: (source.match(namePattern) ?? []).length + (config.match(namePattern) ?? []).length,
    oldHash, prospectiveHash, changes: oldHash !== prospectiveHash };
});

const nameHashes = { old: keccak256(stringToBytes('VeriMesh')), proposed: keccak256(stringToBytes('Horkos')) };
const typeStrings = {
  domain: 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
  verdict: 'Verdict(uint256 agentId,bytes32 modelHash,bytes32 inputHash,bytes32 policyId,uint16 scoreBps,uint64 observedAt,uint64 expiry,uint64 nonce)',
};
const unchanged = { version: '1', versionHash: keccak256(stringToBytes('1')),
  domainTypeHash: keccak256(stringToBytes(typeStrings.domain)), verdictTypeHash: keccak256(stringToBytes(typeStrings.verdict)) };
const domainFor = (chainId, registry, name) => ({ name, version: '1', chainId: BigInt(chainId), verifyingContract: registry });
const domainHash = (domain) => hashDomain({ domain, types: { EIP712Domain: [
  { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
] } });
const verdictFrom = (v) => ({ ...v, agentId: BigInt(v.agentId), observedAt: BigInt(v.observedAt), expiry: BigInt(v.expiry), nonce: BigInt(v.nonce) });
const structHash = (v) => hashStruct({ data: v, primaryType: 'Verdict', types: VERDICT_EIP712_TYPES });
const changedHashes = new Map([[nameHashes.old.toLowerCase(), nameHashes.proposed]]);
function recordChange(oldValue, newValue) {
  const key = oldValue.toLowerCase();
  assert.notEqual(oldValue, newValue);
  if (changedHashes.has(key)) assert.equal(changedHashes.get(key), newValue);
  changedHashes.set(key, newValue);
}

const vectors = JSON.parse(text('test-vectors/verdict-vectors.json')).vectors.map((vector) => {
  const v = verdictFrom(vector.verdict);
  const oldDomain = domainFor(vector.chainId, vector.verifyingContract, 'VeriMesh');
  const newDomain = domainFor(vector.chainId, vector.verifyingContract, 'Horkos');
  const oldDigest = hashVerdict(v, oldDomain), newDigest = hashVerdict(v, newDomain);
  const oldDomainSeparator = domainHash(oldDomain), newDomainSeparator = domainHash(newDomain);
  assert.equal(oldDigest, vector.digest); assert.equal(oldDomainSeparator, vector.domainSeparator);
  assert.equal(structHash(v), vector.structHash);
  recordChange(oldDigest, newDigest); recordChange(oldDomainSeparator, newDomainSeparator);
  return { name: vector.name, chainId: vector.chainId, registry: vector.verifyingContract,
    oldDomainSeparator, proposedDomainSeparator: newDomainSeparator, oldDigest, proposedDigest: newDigest,
    unchangedStructHash: vector.structHash, signatureValid: vector.signatureValid, expectedValid: vector.expectedValid,
    signaturePlan: vector.signatureValid ? 'Regenerate with the existing deterministic public-fixture generator.' : 'Retain the tampering relationship: reuse the regenerated valid vector signature, not a signature over the tampered verdict.' };
});

function walkJson(path) {
  return readdirSync(resolve(root, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap((entry) => {
    if (entry.isSymbolicLink() || entry.name === 'rebrand') return [];
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) return walkJson(child);
    return entry.isFile() && entry.name.endsWith('.json') ? [child] : [];
  });
}
const evidenceFiles = walkJson('evidence');
const bundles = [];
for (const path of evidenceFiles) {
  const bundle = JSON.parse(text(path));
  if (!bundle.signature?.r || !bundle.signature?.s || !bundle.verdict || !bundle.normalizedEvent || !bundle.model || !bundle.features) continue;
  const e = bundle.normalizedEvent;
  const inputHash = hashInput({ routeId: e.routeId, amount: BigInt(e.amount), sourceChainId: BigInt(e.sourceChainId),
    targetChainId: BigInt(e.targetChainId), recipient: e.recipient, timestamp: BigInt(e.timestamp), nonce: BigInt(e.nonce) });
  const v = verdictFrom({ ...bundle.verdict, inputHash, modelHash: bundle.model.hash });
  const oldDomain = getDomain(bundle.chainId, bundle.registry);
  const newDomain = { ...oldDomain, name: 'Horkos' };
  const oldDigest = hashVerdict(v, oldDomain), newDigest = hashVerdict(v, newDomain);
  assert.equal(bundle.verdictId, oldDigest, `Unexpected digest failure in ${path}`);
  const verification = verifyTripwireBundle(bundle);
  if (!verification.valid) {
    assert.equal(path, 'evidence/bundle-latest.json', `Unapproved baseline failure in ${path}`);
    assert.equal(verification.modelHashMatch, false);
    for (const field of ['inputHashMatch', 'scoreMatch', 'verdictIdMatch', 'signatureValid']) assert.equal(verification[field], true);
  }
  recordChange(oldDigest, newDigest);
  recordChange(domainHash(oldDomain), domainHash(newDomain));
  bundles.push({ path, tracked: files.includes(path), sha256: sha256(read(path)), chainId: bundle.chainId, registry: bundle.registry,
    oldVerdictId: oldDigest, proposedVerdictId: newDigest, oldDomainSeparator: domainHash(oldDomain), proposedDomainSeparator: domainHash(newDomain),
    oldDomainVerification: verification.valid ? 'PASS' : 'FAIL: approved legacy modelHash exception',
    verification, proposedIdIsNotSigned: true, requiresRegeneration: true,
    ...(path.startsWith('evidence/replay/store/') ? { prospectiveStorePath: `evidence/replay/store/${newDigest}.json` } : {}) });
}

const digestReferences = [];
function findDigestReferences(value, path, pointer = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const next = `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    if (['digest', 'verdictId', 'domainSeparator'].includes(key) && typeof child === 'string' && /^0x[0-9a-fA-F]{64}$/.test(child)) {
      const proposed = changedHashes.get(child.toLowerCase());
      digestReferences.push({ path, pointer: next, literalSha256: sha256(child),
        ...(proposed ? { oldPublicNameDerivedValue: child, prospectiveValue: proposed } : {}),
        action: proposed ? 'Regenerate bundle/ledger or mark historical record STALE; never replace a real receipt.' : 'Historical digest: mark STALE and regenerate from its original inputs; no inferred new value.' });
    }
    findDigestReferences(child, path, next);
  }
}
for (const path of evidenceFiles) findDigestReferences(JSON.parse(text(path)), path);

// List all 32-byte literal locations without copying possible credential material.
// Only independently identified public name-derived hashes get old/new values.
const hashLocations = [];
for (const [path, source] of sources) {
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index++) {
    for (const match of lines[index].matchAll(/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g)) {
      const value = match[0];
      let category = 'unclassified 32-byte literal: review context; never blind-replace';
      if (/verdictId|digest|domainSeparator/i.test(lines[index])) category = 'digest/domain: regenerate or explicitly mark historical record STALE';
      else if (/transactionHash|txHash|blockHash/i.test(lines[index])) category = 'historical transaction/block: preserve, not a name-derived value';
      else if (/codeHash|bytecode/i.test(lines[index])) category = 'historical bytecode identity: preserve; new compiled artifact gets a new hash later';
      else if (/PRIVKEY|privKey|createSigner\(/i.test(lines[index]) || (path === 'packages/sentinel/src/replay.ts' && index + 1 === 87)) category = 'documented public test signing fixture: unchanged; value deliberately withheld';
      else if (/keyX|keyY|publicKey|PUB_[XY]|"[xy]"\s*:|bytes32 [xy] =/i.test(lines[index])) category = 'public P256 key: unchanged';
      else if (/SIG_[RS]|"[rs]"\s*:|bytes32 [rs] =/i.test(lines[index])) category = 'public signature: regenerate if bound to an old-domain digest';
      else if (/model_?hash|"hash"\s*:/i.test(lines[index]) || models.some((model) => model.oldHash === value)) category = 'model hash: unchanged for the two audited models; preserve intentional negative fixtures';
      else if (/inputHash|policyId|routeId/i.test(lines[index])) category = 'input/policy/route hash: unchanged for identical input/policy';
      else if (/structHash/i.test(lines[index])) category = 'verdict struct hash: unchanged for an identical verdict';
      else if (path === 'contracts/test/mocks/fcl/FCL_elliptic.sol') category = 'P256 arithmetic constant: unchanged; do not edit';
      else if (path === 'packages/cli/test/cli.test.ts' && /bundle\.model\.hash/.test(lines[index])) category = 'intentional model-hash negative fixture: unchanged';
      const proposed = changedHashes.get(value.toLowerCase());
      if (proposed) category = 'known name-derived domain/digest: regenerate or explicitly mark historical record STALE';
      hashLocations.push({ path, line: index + 1, column: match.index + 1, category,
        literalSha256: sha256(value), ...(proposed ? { oldPublicNameDerivedValue: value, prospectiveValue: proposed } : {}) });
    }
  }
}
const vectorSignatures = JSON.parse(text('test-vectors/verdict-vectors.json')).vectors.flatMap((vector) =>
  ['r', 's'].map((component) => ({ vector: vector.name, component, fingerprint: sha256(vector.signature[component]) })));
const signatureLocations = hashLocations.flatMap((location) => {
  const matches = vectorSignatures.filter((signature) => signature.fingerprint === location.literalSha256);
  return matches.length ? [{ path: location.path, line: location.line, column: location.column,
    components: [...new Set(matches.map((signature) => signature.component))], vectors: [...new Set(matches.map((signature) => signature.vector))],
    action: 'Regenerate from the new-domain public vector fixture; preserve tampered-vector signature relationships.' }] : [];
});

const protectedPaths = ['evidence/bundle-latest.json', 'deployments/monad-testnet.json'];
const assets = readdirSync(resolve(root, 'docs/assets/brand')).filter((name) => name.startsWith('horkos-')).sort().map((name) => {
  const path = `docs/assets/brand/${name}`, bytes = read(path);
  if (name.endsWith('.png')) assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const dimensions = name.endsWith('.png') ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {};
  return { path, proposed: `brand/${name}`, bytes: bytes.length, sha256: sha256(bytes), ...dimensions };
});
const checkedNoName = ['.env.example', 'pnpm-workspace.yaml', 'contracts/foundry.toml', 'SUBMISSION.md',
  '.github/workflows/ci.yml', '.github/workflows/deployment-drift.yml', ...files.filter((path) => /tsconfig.*\.json$/.test(path))]
  .map((path) => ({ path, occurrences: (text(path).match(namePattern) ?? []).length }));
const result = {
  step: 'RB-1', baselineCommit, mode: 'inventory and prospective hashing only; no source rename, signing, deployment or bundle rewrite',
  literalSearch: { command: 'rg --json -i veri[-_ ]?mesh -- <all baseline first-party text files>',
    independentCountsMatch: true, filesWithMatches: rgCounts.size,
    occurrences: [...rgCounts.values()].reduce((sum, count) => sum + count, 0) },
  scope: { trackedFirstPartyFiles: files.length, ignoredEvidenceIncludedOnlyForBundleAudit: true,
    excluded: ['vendored lib/', 'node_modules/', '.git/', 'build output', 'ignored .env/keys', 'this RB-1 report and generator'],
    workingTreeBaselineMatchesCommit: true },
  totals: { textFilesWithNames: inventory.length - 1, textOccurrences: inventory.filter((row) => !row.path.endsWith('.docx')).reduce((n, row) => n + row.occurrences, 0),
    docxOccurrences: docxAudit.occurrences, allOccurrences: inventory.reduce((n, row) => n + row.occurrences, 0),
    namedFiles: pathRenames.length, namedDirectories: directoryNames.length, vectors: vectors.length, bundles: bundles.length,
    bundlesPassing: bundles.filter((bundle) => bundle.oldDomainVerification === 'PASS').length,
    bundlesFailing: bundles.filter((bundle) => bundle.oldDomainVerification !== 'PASS').length,
    uniquePublicNameDerivedValues: changedHashes.size, hardcodedHashLocations: hashLocations.length,
    matchedNameDerivedHashLocations: hashLocations.filter((item) => item.prospectiveValue).length,
    evidenceDigestReferences: digestReferences.length, publicVectorSignatureLocations: signatureLocations.length },
  inventory, pathRenames, directoryNames, checkedNoName, docxAudit, nameHashes, unchanged, models, vectors, bundles, digestReferences, hashLocations, signatureLocations,
  getterSelector: { old: toFunctionSelector('verimesh()'), proposed: toFunctionSelector('horkos()'),
    consequence: 'ABI selector changes; migrate all consumers and seed checks together; decision logic does not change.' },
  assets, missingAssets: ['horkos-mark-white.svg', 'horkos-social-1280x640.svg'],
  protectedFiles: protectedPaths.map((path) => ({ path, sha256: sha256(read(path)), unchanged: true })),
  deployment: JSON.parse(text('deployments/monad-testnet.json')),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'RB-1-inventory.json'), `${JSON.stringify(result, null, 2)}\n`);
const escapeCell = (value) => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const table = ['# RB-1 File Inventory', '', `Snapshot: \`${baselineCommit}\`. Generated by \`node scripts/rebrand-inventory.mjs\`.`, '',
  'Occurrences count matches, not lines. Word-document text is parsed separately. This is a plan, not a completed rename.', '',
  '| File | Occurrences | Category | Planned Replacement |', '|---|---:|---|---|',
  ...inventory.map((row) => `| \`${row.path}\` | ${row.occurrences} | ${row.categories.join(', ')} | ${escapeCell(row.plannedReplacement)} |`), '',
  `Text: ${result.totals.textOccurrences} occurrences in ${result.totals.textFilesWithNames} files. DOCX: ${docxAudit.occurrences}. Total: ${result.totals.allOccurrences}.`, '',
  '## File Paths', '', '| Current | Planned |', '|---|---|', ...pathRenames.map((row) => `| \`${row.old}\` | \`${row.proposed}\` |`), '',
  `Matching directory paths within the repo: ${directoryNames.length}. The workspace directory is outside this rename scope.`, '',
  '## Public Name-Derived Hashes', '',
  'All old/new vector domain separators and digests, all bundle IDs, model hashes and hardcoded hash locations are in `RB-1-inventory.json`. Prospective values hold chain/address/message constant and are NOT newly signed evidence.', '',
  `Vectors: ${vectors.length}; bundles: ${bundles.length}; baseline bundles PASS: ${result.totals.bundlesPassing}, FAIL: ${result.totals.bundlesFailing}.`, '',
  '## Zero-Match Files Reviewed', '', '| File | Old-Name Occurrences |', '|---|---:|', ...checkedNoName.map((row) => `| \`${row.path}\` | ${row.occurrences} |`), ''];
writeFileSync(resolve(outputDir, 'RB-1-files.md'), table.join('\n'));
console.log(`PASS inventory: ${result.totals.textOccurrences} text occurrences in ${result.totals.textFilesWithNames} files; ${docxAudit.occurrences} DOCX occurrences; ${pathRenames.length} named files; ${directoryNames.length} named directories.`);
console.log(`PASS dry-run: ${vectors.length} vectors; ${bundles.length} bundle IDs; ${models.length} model hashes unchanged; ${changedHashes.size} unique public name-derived hashes.`);
console.log(`Baseline bundle verification: ${result.totals.bundlesPassing} PASS, ${result.totals.bundlesFailing} approved legacy failure. No signatures or artifacts regenerated.`);
console.log(`Hash locations inventoried: ${hashLocations.length}, of which ${result.totals.matchedNameDerivedHashLocations} match known name-derived values.`);
console.log('Wrote evidence/rebrand/RB-1-inventory.json and evidence/rebrand/RB-1-files.md only.');
