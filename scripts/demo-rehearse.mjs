import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { runSandbox } from './sandbox.mjs';
import { isMain, requireCheck, root } from './deployment-checks.mjs';

export async function rehearse(args = process.argv.slice(2)) {
  requireCheck(args.length === 0, 'demo:rehearse takes no flags; it uses only a disposable local chain');
  const output = resolve(root, 'evidence/replay/rehearsal', randomUUID());
  return runSandbox({ output, rehearsal: true });
}

if (isMain(import.meta.url)) {
  try { await rehearse(); }
  catch {
    console.error('Local rehearsal FAILED. Partial reports are retained under evidence/replay/rehearsal; operator credentials and Monad were not used.');
    process.exitCode = 1;
  }
}
