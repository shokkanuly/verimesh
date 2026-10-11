import { root, loadManifest, loadEnvironment, gitState, checkProvenance, buildArtifacts, publicClient, explorerVerifier, verifyDeployment, runCommand, requireCheck, isMain } from './deployment-checks.mjs';

export async function main() {
  requireCheck(process.argv.length === 2, 'verify:deployment takes no flags; it never broadcasts or edits the manifest');
  const manifest = loadManifest();
  const provenance = gitState(root, manifest.commit);
  checkProvenance(manifest, provenance);
  const env = loadEnvironment();
  return verifyDeployment({ manifest, provenance, artifacts: buildArtifacts(root), client: publicClient(manifest, env), verifyExplorer: explorerVerifier(env) });
}

if (isMain(import.meta.url)) {
  await runCommand('Deployment verification', main);
}
