import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  CI: 'true', MONAD_RPC_URL: '', NO_COLOR: '1' };

export function quickstartCommands(markdown) {
  const blocks = [...markdown.matchAll(/^```bash\r?\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error('Quickstart must contain exactly one acceptance command block');
  const commands = blocks[0][1].trim().split(/\r?\n/);
  if (commands.length !== 4 || commands.some((command) => !command.trim() || /[;&|`$\\]/.test(command))) {
    throw new Error('Quickstart acceptance commands must be four simple standalone commands');
  }
  return commands;
}

export function checkCheckout({ source = root, inPlace = false } = {}) {
  const started = performance.now();
  const steps = [];
  let temporary;
  const run = (command, args, cwd, label) => {
    const start = performance.now();
    const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
    const step = { command: label ?? [command, ...args].join(' '), exitCode: result.status,
      elapsedSeconds: (performance.now() - start) / 1000 };
    steps.push(step);
    console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${step.command} (${step.elapsedSeconds.toFixed(2)}s)`);
    if (result.status !== 0) throw new Error(`Checkout check failed at ${step.command}; raw subprocess diagnostics withheld`);
    return result.stdout;
  };
  try {
    const commit = run('git', ['rev-parse', 'HEAD'], source).trim();
    let checkout = source;
    if (!inPlace) {
      temporary = mkdtempSync(resolve(tmpdir(), 'horkos-checkout-'));
      checkout = resolve(temporary, 'repo');
      run('git', ['clone', '--local', '--no-hardlinks', '--quiet', source, checkout], temporary, 'clone committed source into private temporary checkout');
      run('git', ['checkout', '--quiet', '--detach', commit], checkout, 'checkout tested commit');
    }
    const initialStatus = run('git', ['status', '--porcelain'], checkout, 'check clean checkout');
    if (initialStatus.trim()) throw new Error('Checkout must be clean');
    const quickstart = quickstartCommands(readFileSync(resolve(checkout, 'QUICKSTART.md'), 'utf8'));
    const quickstartStart = performance.now();
    for (const command of quickstart) {
      const [executable, ...args] = command.split(' ');
      run(executable, args, checkout, command);
    }
    const quickstartSeconds = (performance.now() - quickstartStart) / 1000;
    run('node', ['apps/integrator-demo/demo.mjs'], checkout);
    const sandbox = JSON.parse(readFileSync(resolve(checkout, 'evidence/replay/sandbox/run.json'), 'utf8'));
    run('pnpm', ['test'], checkout);
    const forge = run('forge', ['test', '--gas-snapshot-check', 'true'], resolve(checkout, 'contracts'));
    run('pnpm', ['check:addresses'], checkout);
    run('pnpm', ['check:parity'], checkout);
    run('pnpm', ['replay'], checkout);
    for (const incident of ['benign', 'near-miss', 'throttle', 'delay', 'freeze']) {
      run('pnpm', ['verify-bundle', `evidence/replay/bundle-${incident}.json`], checkout);
    }
    const finalStatus = run('git', ['status', '--porcelain'], checkout, 'check no tracked source changes');
    if (finalStatus.trim()) throw new Error('Acceptance commands modified tracked source');
    const summary = forge.match(/(\d+) tests passed, (\d+) failed, (\d+) skipped/);
    return { mode: inPlace ? 'clean-workspace' : 'isolated-local-clone', commit, steps, quickstartSeconds,
      localSandboxSeconds: sandbox.elapsedSeconds, firstLocalVerdictSeconds: sandbox.firstVerdictSeconds,
      localReceipts: sandbox.receipts.length, solidity: summary ? { passed: Number(summary[1]), failed: Number(summary[2]), skipped: Number(summary[3]) } : undefined,
      elapsedSeconds: (performance.now() - started) / 1000, remoteCI: 'not-run' };
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = checkCheckout({ inPlace: process.argv.includes('--workspace') });
    const path = resolve(root, 'evidence/replay/clean-checkout.json');
    mkdirSync(resolve(root, 'evidence/replay'), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
    console.log(`Checkout acceptance PASS. Public report: ${path}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
