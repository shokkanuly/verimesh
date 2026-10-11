import { runReplayCli } from '../packages/sentinel/dist/replay.js';

runReplayCli().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
