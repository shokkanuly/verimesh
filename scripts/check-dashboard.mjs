import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters, toHex } from 'viem';
import { getConfiguredDeploymentAddresses, getDeploymentAddresses, hashInput, VERDICT_REGISTRY_ABI, TRIPWIRE_GUARDIAN_ABI } from '../packages/sdk/dist/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const deployment = JSON.parse(readFileSync(resolve(root, 'deployments/monad-testnet.json'), 'utf8'));
const configuredAddresses = getConfiguredDeploymentAddresses(deployment);
const fixtureDeployment = { ...deployment, stage: 'phase1', contracts: {
  ERC8004Identity: '0x0000000000000000000000000000000000000001',
  VerdictRegistry: '0x000000000000000000000000000000000000bEEF',
  TripwireGuardianV2: '0x0000000000000000000000000000000000000002',
  SimpleGate: '0x0000000000000000000000000000000000000003',
} };
const addresses = getDeploymentAddresses(fixtureDeployment);
const bundle = JSON.parse(readFileSync(resolve(root, 'evidence/recorded/bundle-freeze.json'), 'utf8'));
const temp = mkdtempSync(resolve(tmpdir(), 'horkos-ui-'));
const screenshots = resolve(root, 'evidence/replay/screens');
mkdirSync(screenshots, { recursive: true });
const children = [];
let browser;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function port() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const result = server.address().port; await new Promise((done) => server.close(done)); return result;
}
function child(args, extraEnv = {}) {
  const processChild = spawn(process.execPath, args, { cwd: root, stdio: 'ignore', env: {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...extraEnv,
  } });
  const exited = new Promise((done) => processChild.once('exit', done));
  processChild.on('error', () => {});
  children.push({ processChild, exited });
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await pause(100);
  }
  throw new Error('UI test service did not become ready');
}

try {
  const apiPort = await port(); const uiPort = await port();
  const url = `http://127.0.0.1:${uiPort}`;
  child(['packages/sentinel/dist/server.js'], { START_SERVER: 'true', PORT: String(apiPort),
    CORS_ORIGINS: url, EVIDENCE_DIRECTORY: resolve(temp, 'store') });
  child(['apps/dashboard/node_modules/vite/bin/vite.js', 'apps/dashboard', '--config', 'apps/dashboard/vite.config.ts',
    '--port', String(uiPort), '--strictPort'], { EVIDENCE_API_PROXY: `http://127.0.0.1:${apiPort}` });
  await ready(`http://127.0.0.1:${apiPort}/health`); await ready(url);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', () => errors.push('browser runtime error'));
  let homepageApiRequests = 0;
  const countHomepageApiRequests = (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) homepageApiRequests++; };
  page.on('request', countHomepageApiRequests);
  await page.goto(url);
  await page.getByRole('heading', { name: 'Horkos decision registry', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.title(), 'Horkos | Signed Machine Decisions');
  assert.equal(await page.locator('.verdict-row').count(), 0);
  const art = await page.request.get(`${url}/images/horkos-pattern.png`);
  assert.equal(art.ok(), true);
  assert.equal(art.headers()['content-type'], 'image/png');
  assert.ok((await art.body()).length > 100_000);
  for (const viewport of [{ width: 1440, height: 1000, name: 'desktop' }, { width: 1920, height: 1080, name: 'wide' },
    { width: 794, height: 556, name: 'reference' }, { width: 390, height: 844, name: 'mobile' }, { width: 320, height: 740, name: 'narrow' }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('.home-dashboard-preview').evaluate((element) => element.getBoundingClientRect().top < innerHeight - 40), true);
    const linksFit = await page.locator('.home-button, .home-brand').evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth));
    assert.equal(linksFit, true);
    await page.screenshot({ path: resolve(screenshots, `home-${viewport.name}.png`) });
  }
  assert.equal(homepageApiRequests, 0, 'Homepage must not start dashboard polling');
  page.off('request', countHomepageApiRequests);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  assert.equal(await page.getByRole('button', { name: 'Close navigation' }).getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#home-content').evaluate((element) => element.inert), true);
  await page.screenshot({ path: resolve(screenshots, 'home-menu-mobile.png') });
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Integration', exact: true }).press('Tab');
  assert.equal(await page.getByRole('link', { name: 'Horkos home', exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Protocol', exact: true }).click();
  assert.equal(await page.locator('#home-mobile-nav').count(), 0);
  assert.equal(await page.locator('#home-content').evaluate((element) => element.inert), false);
  await page.goto(url);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Protocol', exact: true }).press('Escape');
  assert.equal(await page.locator('#home-mobile-nav').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate((element) => element === document.activeElement), true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#home-mobile-nav').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  const firstQuestion = page.getByRole('button', { name: 'What can I try right now?', exact: true });
  const secondQuestion = page.getByRole('button', { name: 'Does a valid signature prove the input is true?', exact: true });
  assert.equal(await firstQuestion.getAttribute('aria-expanded'), 'true');
  await secondQuestion.click();
  assert.equal(await secondQuestion.getAttribute('aria-expanded'), 'true');
  assert.equal(await firstQuestion.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#home-answer-1').isVisible(), true);
  await page.locator('#faq').screenshot({ path: resolve(screenshots, 'home-faq-desktop.png') });
  await secondQuestion.click();
  assert.equal(await page.locator('#home-answer-1').isVisible(), false);
  await page.goto(url);
  await page.screenshot({ path: resolve(screenshots, 'home-full.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open the dashboard', exact: true }).click();
  await page.locator('.verdict-row').nth(4).waitFor();
  assert.equal(new URL(page.url()).pathname, '/dashboard');
  assert.equal(await page.title(), 'Horkos | Dashboard');
  await page.getByRole('link', { name: 'Back to Horkos home' }).click();
  await page.getByRole('heading', { name: 'Horkos decision registry', exact: true }).waitFor();
  await page.goBack();
  await page.locator('.verdict-row').nth(4).waitFor();
  await page.goForward();
  await page.getByRole('heading', { name: 'Horkos decision registry', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Inspect signed evidence', exact: true }).click();
  await page.getByLabel('Evidence JSON').waitFor();
  await page.goto(`${url}/dashboard?view=integration`);
  await page.locator('.integration-layout').waitFor();
  await page.goto(`${url}/dashboard?view=unknown`);
  await page.locator('.verdict-row').nth(4).waitFor();
  await page.goto(`${url}/not-a-page`);
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  await page.goto(`${url}/dashboard/`);
  console.log('PASS separate routes, generated texture, responsive product preview, mobile focus/menu, FAQ, history and direct views');
  await page.locator('.verdict-row').nth(4).waitFor();
  assert.equal(await page.locator('.verdict-row').count(), 5);
  assert.equal(await page.locator('.mode-label').innerText(), 'RECORDED');
  await page.screenshot({ path: resolve(screenshots, 'recorded-desktop.png'), fullPage: true });
  await page.locator('.verdict-row').nth(2).getByRole('button', { name: 'Evidence' }).click();
  await page.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#bundle-json')?.value || '{}').verdict.scoreBps === 7300; }
    catch { return false; }
  });
  let selected = JSON.parse(await page.getByLabel('Evidence JSON').inputValue());
  assert.equal(selected.verdict.scoreBps, 7300);
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByRole('heading', { name: 'PASS / OFFLINE' }).waitFor();
  selected.features.sizeRatioBps = 0;
  await page.getByLabel('Evidence JSON').fill(JSON.stringify(selected));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByRole('heading', { name: 'MISMATCH' }).waitFor();
  await page.screenshot({ path: resolve(screenshots, 'tamper-desktop.png'), fullPage: true });
  await page.getByLabel('Evidence JSON').fill('{');
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByText('Invalid JSON. Verification was not run.').waitFor();
  await page.getByRole('button', { name: 'Restore selected bundle' }).click();
  assert.equal(JSON.parse(await page.getByLabel('Evidence JSON').inputValue()).verdict.scoreBps, 7300);
  await page.route('**/api/verify', (route) => route.abort());
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await page.getByText('Evidence API unavailable or rejected the schema. Verification did not pass.').waitFor();
  await page.unroute('**/api/verify');
  console.log('PASS recorded selection, full API verification, tamper, invalid JSON, restore and API-offline states');

  if (!configuredAddresses) {
    let rpcRequests = 0;
    const countRpc = request => { if (request.url().startsWith(deployment.rpcUrl)) rpcRequests++; };
    page.on('request', countRpc);
    await page.getByRole('button', { name: 'Verdicts', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'LIVE', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Contract addresses' }).click();
    await page.getByText('No active Horkos deployment.', { exact: true }).waitFor();
    assert.equal(await page.locator('.contracts-panel a').count(), 0);
    assert.equal(await page.locator('footer a').count(), 0);
    assert.equal(rpcRequests, 0);
    page.off('request', countRpc);
    console.log('PASS undeployed manifest: disabled live mode, no retired links and zero RPC requests');
  }

  // Replace only the browser's JSON module with an explicit synthetic deployment.
  // The canonical file and production undeployed checks above remain unchanged.
  let fixtureLoads = 0;
  await page.route('**/deployments/monad-testnet.json*', async route => {
    fixtureLoads++;
    await route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(fixtureDeployment)};` });
  });
  await page.goto(`${url}/dashboard`);
  await page.locator('.verdict-row').nth(4).waitFor();
  assert.ok(fixtureLoads > 0, 'Synthetic deployment module was not loaded');
  assert.equal(await page.getByRole('button', { name: 'LIVE', exact: true }).isDisabled(), false);

  let rpcMode = 'events';
  const head = 5000n; const hash = `0x${'ab'.repeat(32)}`;
  const inputHash = hashInput({ routeId: bundle.normalizedEvent.routeId, amount: BigInt(bundle.normalizedEvent.amount),
    sourceChainId: BigInt(bundle.normalizedEvent.sourceChainId), targetChainId: BigInt(bundle.normalizedEvent.targetChainId),
    recipient: bundle.normalizedEvent.recipient, timestamp: BigInt(bundle.normalizedEvent.timestamp), nonce: BigInt(bundle.normalizedEvent.nonce) });
  const baseLog = { blockHash: hash, blockNumber: toHex(head), transactionIndex: '0x0', logIndex: '0x0', removed: false };
  const accepted = { ...baseLog, address: addresses.VerdictRegistry, transactionHash: hash,
    topics: encodeEventTopics({ abi: VERDICT_REGISTRY_ABI, eventName: 'VerdictAccepted', args: {
      verdictId: bundle.verdictId, agentId: BigInt(bundle.verdict.agentId), policyId: bundle.verdict.policyId,
    } }), data: encodeAbiParameters(parseAbiParameters('uint16, bytes32, bytes32, uint64'), [
      bundle.verdict.scoreBps, bundle.model.hash, inputHash, BigInt(bundle.verdict.observedAt),
    ]) };
  const action = { ...baseLog, logIndex: '0x1', address: addresses.TripwireGuardianV2, transactionHash: `0x${'cd'.repeat(32)}`,
    topics: encodeEventTopics({ abi: TRIPWIRE_GUARDIAN_ABI, eventName: 'ActionApplied', args: { verdictId: bundle.verdictId } }),
    data: encodeAbiParameters(parseAbiParameters('uint16, uint8'), [9900, 3]) };
  await page.route(deployment.rpcUrl + '/**', async (route) => {
    if (rpcMode === 'offline') { await route.abort(); return; }
    const request = route.request().postDataJSON();
    const handle = (call) => {
      let result;
      if (call.method === 'eth_chainId') result = toHex(deployment.chainId);
      else if (call.method === 'eth_blockNumber') result = toHex(head);
      else if (call.method === 'eth_getBlockByNumber') result = { number: toHex(head), hash, transactions: [], timestamp: '0x6553f100' };
      else if (call.method === 'eth_call') result = encodeAbiParameters(parseAbiParameters('uint8'), [3]);
      else if (call.method === 'eth_getLogs') result = rpcMode === 'empty' ? [] :
        call.params[0].address.toLowerCase() === addresses.VerdictRegistry.toLowerCase() ? [accepted] : [action];
      else throw new Error('Unexpected mocked RPC method');
      return { jsonrpc: '2.0', id: call.id, result };
    };
    await route.fulfill({ json: Array.isArray(request) ? request.map(handle) : handle(request) });
  });
  await page.getByRole('button', { name: 'Verdicts', exact: true }).click();
  await page.getByRole('button', { name: 'LIVE', exact: true }).click();
  await page.getByText('APPLIED: FREEZE', { exact: true }).waitFor();
  assert.equal(await page.locator('.verdict-row').count(), 1);
  assert.ok(await page.getByRole('link', { name: 'Guardian', exact: true }).getAttribute('href'));
  await page.locator('.verdict-row').getByRole('button', { name: 'Evidence' }).click();
  await page.waitForFunction((id) => JSON.parse(document.querySelector('textarea').value || '{}').verdictId === id, bundle.verdictId);
  await page.getByRole('button', { name: 'Verdicts', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh live events' }).waitFor({ state: 'visible' });
  rpcMode = 'empty';
  await page.getByRole('button', { name: 'Refresh live events' }).click();
  await page.getByText('No accepted verdicts in the scanned block range.').waitFor();
  rpcMode = 'offline';
  await page.getByRole('button', { name: 'Refresh live events' }).click();
  await page.getByText('Live feed offline.').waitFor();
  assert.equal(await page.locator('.verdict-row').count(), 0);
  console.log('PASS mocked RPC event correlation, selected live bundle, empty range and offline states (synthetic test, not live proof)');
  await page.getByRole('button', { name: 'RECORDED', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(screenshots, 'recorded-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('.verdict-row').nth(4).getByRole('button', { name: 'Evidence' }).click();
  await page.screenshot({ path: resolve(screenshots, 'evidence-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Integration', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('.integration-layout pre').evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await page.screenshot({ path: resolve(screenshots, 'integration-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(screenshots, 'integration-desktop.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS desktop/mobile layout, screenshots and no browser runtime errors');
} finally {
  if (browser) await browser.close();
  for (const { processChild, exited } of children) {
    if (processChild.exitCode === null) {
      processChild.kill('SIGTERM'); await Promise.race([exited, pause(2000)]);
      if (processChild.exitCode === null) { processChild.kill('SIGKILL'); await exited; }
    }
  }
  rmSync(temp, { recursive: true, force: true });
}
