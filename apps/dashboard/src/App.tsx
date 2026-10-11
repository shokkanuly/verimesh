import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Code2, Download, ExternalLink, FileCheck2, RefreshCw, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import type { EvidenceBundle, VerifyReport } from '@horkos/sdk';
import { CONTRACT_ADDRESSES, EVIDENCE_API, EXPLORER, HAS_DEPLOYMENT_RECEIPTS, RECORDED } from './config';
import { readLiveFeed, type VerdictRow } from './feed';
import { SignalBackdrop } from './SignalBackdrop';

const short = (value: string) => `${value.slice(0, 10)}...${value.slice(-6)}`;
const tierName = (tier: number) => ['NORMAL', 'THROTTLE', 'DELAY', 'FREEZE'][tier] ?? 'UNKNOWN';
const scoreTier = (score: number) => score >= 9500 ? 3 : score >= 8500 ? 2 : score >= 6500 ? 1 : 0;
const recordedRows: VerdictRow[] = RECORDED.map((bundle) => ({ verdictId: bundle.verdictId, ...bundle.verdict,
  tier: undefined, observedAt: bundle.verdict.observedAt }));

export function App() {
  const [mode, setMode] = useState<'recorded' | 'live'>(() =>
    CONTRACT_ADDRESSES && new URLSearchParams(window.location.search).get('mode') === 'live' ? 'live' : 'recorded');
  const [tab, setTab] = useState<'feed' | 'evidence' | 'integration'>(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    return view === 'evidence' || view === 'integration' ? view : 'feed';
  });
  const [live, setLive] = useState<Awaited<ReturnType<typeof readLiveFeed>>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('verdict');
    return requested && /^0x[0-9a-fA-F]{64}$/.test(requested)
      ? requested : mode === 'live' ? `0x${'0'.repeat(64)}` : RECORDED[0].verdictId;
  });
  const [bundle, setBundle] = useState<EvidenceBundle>();
  const [json, setJson] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const [bundleLoading, setBundleLoading] = useState(false);
  const [report, setReport] = useState<VerifyReport>();
  const [verifying, setVerifying] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const verificationGeneration = useRef(0);
  const rows = mode === 'recorded' ? recordedRows : live?.rows ?? [];

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!cancelled) setLoading(true);
      try {
        const snapshot = await readLiveFeed();
        if (!cancelled) { setLive(snapshot); setError(''); }
      } catch {
        if (!cancelled) { setError('RPC unavailable or incompatible deployment. Live rows are not verified while disconnected.'); setLive(undefined); }
      } finally {
        if (!cancelled) { setLoading(false); timer = setTimeout(poll, 5000); }
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mode, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    verificationGeneration.current++;
    setVerifying(false);
    setBundle(undefined); setJson(''); setReport(undefined); setEvidenceError('');
    if (mode === 'recorded') {
      const selected = RECORDED.find((item) => item.verdictId === selectedId);
      if (selected) { setBundle(selected); setJson(JSON.stringify(selected, null, 2)); }
      else setEvidenceError('Select a recorded verdict to load its evidence.');
      setBundleLoading(false);
    } else {
      setBundleLoading(true);
      fetch(`${EVIDENCE_API}/bundle/${selectedId}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const selected = await response.json() as EvidenceBundle;
          if (selected.verdictId.toLowerCase() !== selectedId.toLowerCase()) throw new Error();
          if (!cancelled) { setBundle(selected); setJson(JSON.stringify(selected, null, 2)); }
        }).catch(() => { if (!cancelled) setEvidenceError('Evidence unavailable for this verdict. No recorded bundle was substituted.'); })
        .finally(() => { if (!cancelled) setBundleLoading(false); });
    }
    return () => { cancelled = true; controller.abort(); };
  }, [selectedId, mode]);

  async function verify() {
    const generation = ++verificationGeneration.current;
    setVerifying(true); setReport(undefined); setEvidenceError('');
    try {
      const parsed: unknown = JSON.parse(json);
      const response = await fetch(`${EVIDENCE_API}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed), signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if ((response.status !== 200 && response.status !== 422) || typeof result.valid !== 'boolean') throw new Error(result.error || 'Evidence verification unavailable');
      if (generation === verificationGeneration.current) setReport(result);
    } catch (failure) {
      if (generation === verificationGeneration.current) setEvidenceError(failure instanceof SyntaxError ? 'Invalid JSON. Verification was not run.' : 'Evidence API unavailable or rejected the schema. Verification did not pass.');
    } finally { if (generation === verificationGeneration.current) setVerifying(false); }
  }

  function select(row: VerdictRow) { setSelectedId(row.verdictId); setTab('evidence'); }
  function download() {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bundle-${selectedId.slice(2, 10)}.json`;
    anchor.click(); URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <SignalBackdrop variant="workspace" />
    <header className="app-header">
      <div className="brand"><img className="brand-mark" src="/images/horkos-mark.svg" alt="" width="34" height="34" /><div><h1>Horkos</h1><span>Decision Registry</span></div></div>
      <div className="header-controls">
        <a className="icon-button" href="/" title="Back to Horkos home" aria-label="Back to Horkos home"><ArrowLeft size={17} /></a>
        <span className={`mode-label ${mode}`}>{mode.toUpperCase()}</span>
        <span className="network-label">Monad Testnet</span>
        <button className="icon-button" title="Contract addresses" aria-label="Contract addresses" onClick={() => setContractsOpen(!contractsOpen)}><Code2 size={18} /></button>
      </div>
    </header>
    {contractsOpen && <section className="contracts-panel" aria-label="Contract addresses">
      {CONTRACT_ADDRESSES ? Object.entries(CONTRACT_ADDRESSES).map(([name, address]) => <div key={name}><span>{name}</span>
        <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{short(address)} <ExternalLink size={12} /></a></div>) : <p>No active Horkos deployment.</p>}
    </section>}
    {!HAS_DEPLOYMENT_RECEIPTS && <div className="notice"><TriangleAlert size={16} /><span>{CONTRACT_ADDRESSES ? 'Historical deployment manifest. Fresh source and receipt verification is pending.' : 'Horkos is not deployed. Recorded evidence is synthetic; live feed is unavailable.'}</span></div>}
    <section className="metrics" aria-label="Verdict metrics">
      <div><span>{mode === 'recorded' ? 'Synthetic Fixtures' : 'Accepted Events'}</span><strong>{rows.length}</strong><small>{mode === 'recorded' ? 'Offline evidence only' : live ? `RPC snapshot #${live.head}` : 'No confirmed RPC snapshot'}</small></div>
      <div><span>{mode === 'recorded' ? 'Scorer Version' : 'Applied In Range'}</span><strong>{mode === 'recorded' ? '2.0.0' : rows.filter((row) => row.actionTxHash).length}</strong><small>{mode === 'recorded' ? 'Integer reference rules' : 'Matching guardian events'}</small></div>
      <div><span>Guardian Now</span><strong className={mode === 'live' && live ? `tier-${live.tier}` : ''}>{mode === 'live' && live ? tierName(live.tier) : 'UNKNOWN'}</strong><small>{mode === 'recorded' ? 'Not read in recorded mode' : loading ? 'Refreshing snapshot' : error ? 'RPC disconnected' : 'Read at snapshot block'}</small></div>
      <div><span>Verification Scope</span><strong>P256 + Rules</strong><small>Single signer; not trustless AI</small></div>
    </section>
    <nav className="tabs" aria-label="Workspace views">
      {([{ id: 'feed', label: 'Verdicts', Icon: Activity }, { id: 'evidence', label: 'Evidence', Icon: FileCheck2 }, { id: 'integration', label: 'Integration', Icon: Code2 }] as const).map(({ id, label, Icon }) =>
        <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={16} />{label}</button>)}
    </nav>
    <main key={tab} className="workspace-content">
      {tab === 'feed' && <section aria-label="Verdict timeline">
        <div className="section-heading"><div><h2>Verdict Timeline</h2><p>{mode === 'recorded' ? 'Synthetic replay / no chain actions claimed' : 'Live chain events / recent blocks + demo receipts / synthetic inputs'}</p></div>
          <div className="toolbar"><div className="segmented" aria-label="Data source">{(['recorded', 'live'] as const).map((value) => <button key={value} aria-pressed={mode === value} disabled={value === 'live' && !CONTRACT_ADDRESSES} title={value === 'live' && !CONTRACT_ADDRESSES ? 'No active Horkos deployment' : undefined} className={mode === value ? 'active' : ''} onClick={() => { setMode(value); setSelectedId(value === 'recorded' ? RECORDED[0].verdictId : `0x${'0'.repeat(64)}`); }}>{value.toUpperCase()}</button>)}</div>
            <button className="icon-button" title="Refresh live events" aria-label="Refresh live events" disabled={mode !== 'live' || loading} onClick={() => setRefresh(refresh + 1)}><RefreshCw size={17} className={loading ? 'spinning' : ''} /></button></div>
        </div>
        {error && mode === 'live' && <div className="error-message" role="alert"><TriangleAlert size={17} />{error}</div>}
        {loading && rows.length === 0 && <p role="status" className="empty-state">Loading chain events...</p>}
        {!loading && rows.length === 0 && <p className="empty-state">{error ? 'Live feed offline.' : 'No accepted verdicts in the scanned block range.'}</p>}
        <div className="verdict-list">{rows.map((row, index) => <article className="verdict-row" key={row.verdictId}>
          <div className={`tier-indicator tier-${scoreTier(row.scoreBps)}`}>{String(index + 1).padStart(2, '0')}</div>
          <div className="verdict-summary"><div className="row-title"><strong>{mode === 'recorded' ? ['Routine Outflow', 'Near Miss', 'Elevated Outflow', 'Flagged Outflow', 'Proof Mismatch'][index] : `Agent #${row.agentId}`}</strong><span className={`tier-label tier-${scoreTier(row.scoreBps)}`}>{tierName(scoreTier(row.scoreBps))}</span></div>
            <code>{short(row.verdictId)}</code><div className="row-meta"><span>{row.scoreBps.toLocaleString()} bps</span><span>Agent #{row.agentId}</span><time dateTime={new Date(row.observedAt * 1000).toISOString()}>{new Date(row.observedAt * 1000).toLocaleString()}</time></div></div>
          <div className="row-actions"><span>{mode === 'recorded' ? 'SYNTHETIC / NOT SUBMITTED' : row.actionTxHash ? `APPLIED: ${tierName(row.tier!)}` : row.scoreBps < 6500 ? 'NO ACTION EXPECTED' : 'NO ACTION IN RANGE'}</span>
            <div>{row.txHash && <a title="Registry transaction" href={`${EXPLORER}/tx/${row.txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Registry</a>}
              {row.actionTxHash && <a title="Guardian transaction" href={`${EXPLORER}/tx/${row.actionTxHash}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Guardian</a>}
              <button className="command-button" onClick={() => select(row)}>Evidence <ArrowRight size={15} /></button></div></div>
        </article>)}</div>
      </section>}
      {tab === 'evidence' && <section aria-label="Evidence verifier">
        <div className="section-heading"><div><h2>Evidence Verification</h2><p className="hash-line">Verdict {selectedId}</p></div><div className="toolbar">
          <button className="icon-button" title="Restore selected bundle" aria-label="Restore selected bundle" disabled={!bundle || verifying} onClick={() => { verificationGeneration.current++; setJson(JSON.stringify(bundle, null, 2)); setReport(undefined); setEvidenceError(''); }}><RefreshCw size={17} /></button>
          <button className="icon-button" title="Download evidence" aria-label="Download evidence" disabled={!bundle} onClick={download}><Download size={17} /></button>
          <button className="command-button primary" disabled={!json || verifying} onClick={() => void verify()}><ShieldCheck size={16} />{verifying ? 'Verifying...' : 'Verify'}</button></div></div>
        {bundleLoading && <p role="status" className="empty-state">Loading selected evidence...</p>}
        {evidenceError && <div className="error-message" role="alert">{evidenceError}</div>}
        <div className="verification-layout"><div className="json-editor"><label htmlFor="bundle-json">Evidence JSON</label><textarea id="bundle-json" value={json} spellCheck={false} disabled={verifying} onChange={(event) => { verificationGeneration.current++; setJson(event.target.value); setReport(undefined); }} /></div>
          <aside className="verification-results" aria-label="Verification results"><h3>{report ? report.valid ? 'PASS / OFFLINE' : 'MISMATCH' : 'NOT VERIFIED'}</h3>
            {(['inputHashMatch', 'modelHashMatch', 'scoreMatch', 'verdictIdMatch', 'signatureValid'] as const).map((key, index) => <div className="check-row" key={key}><span>{['Normalized Input', 'Scorer Source / Config', 'Recomputed Score', 'EIP-712 Digest', 'Low-s P256 Signature'][index]}</span>{report ? report[key] ? <Check size={17} className="pass" /> : <X size={17} className="fail" /> : <span className="muted">Pending</span>}</div>)}
            {report?.mismatches.map((message, index) => <p className="mismatch" key={index}>{message}</p>)}
            <p className="scope-note">Offline checks do not prove current identity ownership, key binding, feature truth or onchain acceptance.</p>
          </aside></div>
      </section>}
      {tab === 'integration' && <section aria-label="Integration example"><div className="section-heading"><div><h2>Consumer Integration</h2><p>First-party reference / not external adoption</p></div></div>
        <div className="integration-layout"><pre>{`// contracts/src/examples/GuardedAction.sol (excerpt)
function execute(Verdict calldata verdict, bytes32 payload) external {
    if (msg.sender != authorizedCaller) revert Unauthorized();
    bytes32 id = horkos.hashVerdict(verdict);
    _consume(id, trustedAgentId, trustedPolicyId, 8000, 300);
    if (verdict.modelHash != trustedModelHash ||
        verdict.inputHash != actionHash(payload)) {
        revert WrongCommitment();
    }
    actions++;
    emit Executed(id, payload);
}`}</pre><div><h3>Reference Components</h3><dl><dt>Registry</dt><dd>Receipt-confirmed verdict acceptance</dd><dt>Guardian</dt><dd>Bounded throttle, delay and freeze</dd><dt>MockBridge</dt><dd>Owner-authorized native release, guarded atomically</dd><dt>Test Kit</dt><dd>Ephemeral signed fixtures and local sandbox</dd></dl><p className="scope-note">Generic approval-score fixture, not Tripwire risk policy or a secure vault. Trusted roles and commitments are fixed at construction.</p></div></div>
      </section>}
    </main>
    <footer><span>Horkos v1 / Single-signer P256 attestations</span>{CONTRACT_ADDRESSES && <a href={`${EXPLORER}/address/${CONTRACT_ADDRESSES.VerdictRegistry}`} target="_blank" rel="noreferrer">Registry <ExternalLink size={13} /></a>}</footer>
  </div>;
}

export default App;
