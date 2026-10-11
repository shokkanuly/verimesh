import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { addressOf, assertUndeployedManifest } from './deployment-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['node_modules', '.git', 'dist', 'out', 'cache', 'broadcast', 'lib', '.vite']);
const addressPattern = /0x[\da-fA-F]{40}(?![\da-fA-F])/g;

export function checkAddressSource(path, source) {
  const problems = [];
  if (/\.(?:ts|tsx|js|mjs)$/.test(path)) {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteralLike(node)) {
        for (const match of node.text.matchAll(addressPattern)) {
          // System precompiles and tiny mock addresses are not deployed contracts.
          if (BigInt(match[0]) <= 0xffffn) continue;
          const parent = node.parent;
          const field = ts.isPropertyAssignment(parent) ? parent.name.getText(ast) : '';
          if (field === 'recipient' && path.includes('/test/')) continue;
          if (field === 'owner' && path === 'apps/dashboard/src/config.ts') continue;
          problems.push(`${path}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}: address literal; read the manifest instead`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  } else {
    for (const [index, line] of source.split('\n').entries()) {
      for (const match of line.matchAll(addressPattern)) {
        if (BigInt(match[0]) <= 0xffffn) continue;
        problems.push(`${path}:${index + 1}: address literal; read the manifest instead`);
      }
    }
  }
  if (path.endsWith('.env.example')) {
    for (const line of source.split('\n')) {
      if (/^(VERDICT_REGISTRY_ADDRESS|TRIPWIRE_GUARDIAN_ADDRESS|ERC8004_IDENTITY_ADDRESS)=.+/.test(line)) {
        problems.push(`${path}: obsolete contract address override`);
      }
    }
  }
  return problems;
}

export function checkAddresses(directory = root) {
  const deployment = JSON.parse(readFileSync(resolve(directory, 'deployments/monad-testnet.json'), 'utf8'));
  if (deployment.chainId !== 10143) throw new Error('Manifest chain ID must be Monad testnet (10143)');
  if (deployment.stage === 'undeployed') assertUndeployedManifest(deployment);
  else for (const name of ['ERC8004Identity', 'VerdictRegistry', 'TripwireGuardianV2', 'SimpleGate']) {
    addressOf(deployment, name);
  }
  const problems = [];
  function walk(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (ignored.has(item.name) || item.isSymbolicLink()) continue;
      const full = resolve(path, item.name);
      const name = relative(directory, full);
      if (item.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|mjs|sol|md)$/.test(name)) {
        problems.push(...checkAddressSource(name, readFileSync(full, 'utf8')));
      }
    }
  }
  for (const folder of ['apps', 'packages', 'contracts', 'scripts', 'docs']) walk(resolve(directory, folder));
  for (const name of ['README.md', '.env.example']) {
    problems.push(...checkAddressSource(name, readFileSync(resolve(directory, name), 'utf8')));
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const problems = checkAddresses(process.argv[2] ? resolve(process.argv[2]) : root);
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exitCode = 1;
    } else console.log('Address check passed: canonical deployment configuration only; no duplicated addresses.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
