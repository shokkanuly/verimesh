import { root, requireCheck, checkProvenance, loadEnvironment, loadManifest, gitState, buildArtifacts, publicClient, explorerVerifier, runCommand, isMain } from './deployment-checks.mjs';
import { credentialContext, requireCredentials, preflight } from './deploy-preflight.mjs';
import { assertPublicManifest, checkCandidateRoles, verifyPreparedState } from './deploy-workflow.mjs';

export async function demoPreflight(context) {
  const { manifest, credentials, provenance } = context;
  const configuration = requireCredentials(credentials);
  assertPublicManifest(manifest);
  requireCheck(manifest.stage === 'demo' && manifest.seed?.length === 4, 'Demo preflight requires a published four-contract demo manifest with four seed receipts');
  checkCandidateRoles(manifest, configuration);
  checkProvenance(manifest, provenance);
  requireCheck(await context.client.getChainId() === manifest.chainId, 'RPC chain differs from Monad testnet');
  const snapshot = await context.client.getBlock();
  const funding = await preflight({ ...context, snapshot });
  const checked = await verifyPreparedState({ ...context, snapshot, publicKey: configuration.publicKey, modelHash: configuration.modelHash });
  requireCheck(JSON.stringify(checked.seed) === JSON.stringify(manifest.seed), 'Published seed receipts differ from canonical seed history');
  return { ready: true, ...checked, wallets: funding.wallets, transactionsBroadcast: 0 };
}

export async function main() {
  requireCheck(process.argv.length === 2, 'demo:preflight takes no flags and never sends transactions');
  const env = loadEnvironment();
  const { getActiveTripwireModel } = await import('../packages/sentinel/dist/score/model.js');
  const credentials = credentialContext(root, env, getActiveTripwireModel().hash);
  requireCredentials(credentials);
  const manifest = loadManifest();
  const provenance = gitState(root, manifest.commit);
  checkProvenance(manifest, provenance);
  return demoPreflight({ manifest, credentials, provenance, artifacts: buildArtifacts(), client: publicClient(manifest, env), verifyExplorer: explorerVerifier(env) });
}

if (isMain(import.meta.url)) await runCommand('Demo preflight', main);
