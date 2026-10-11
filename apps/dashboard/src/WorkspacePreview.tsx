import { useId, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Braces, ChevronRight, FileCheck2, Fingerprint, KeyRound, Layers3, ShieldCheck } from 'lucide-react';
import { RECORDED } from './config';

const views = [
  { label: 'Decisions', Icon: Activity, caption: 'Every verdict, with its identity and evidence attached.' },
  { label: 'Evidence', Icon: FileCheck2, caption: 'Inspect the commitments behind a recorded decision.' },
  { label: 'Integration', Icon: Braces, caption: 'Keep identity, verification and policy in the same flow.' },
];
const incidentNames = ['Routine Outflow', 'Near Miss', 'Elevated Outflow', 'Flagged Outflow', 'Proof Mismatch'];
const tier = (score: number) => score >= 9500 ? 3 : score >= 8500 ? 2 : score >= 6500 ? 1 : 0;
const short = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-6)}`;

export function WorkspacePreview({ hero = false }: { hero?: boolean }) {
  const [view, setView] = useState(0);
  const [selected, setSelected] = useState(0);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const bundle = RECORDED[selected];
  const evidenceLink = `/dashboard?view=evidence&verdict=${bundle.verdictId}`;
  const link = view === 0 ? '/dashboard' : view === 1 ? evidenceLink : '/dashboard?view=integration';

  return <div className={`home-workspace-preview ${hero ? 'is-hero' : ''}`}>
    {!hero && <div className="home-preview-tabs" role="tablist" aria-label="Workspace preview">
      {views.map(({ label, Icon }, index) => <button key={label} ref={(node) => { tabRefs.current[index] = node; }}
        role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={view === index} tabIndex={view === index ? 0 : -1}
        onClick={() => setView(index)} onKeyDown={(event) => {
          let next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % views.length;
          else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = views.length - 1;
          else return;
          event.preventDefault(); setView(next); tabRefs.current[next]?.focus();
        }}><Icon size={15} />{label}</button>)}
    </div>}
    <div className="home-console" id={`${id}-panel`} role={hero ? undefined : 'tabpanel'} aria-labelledby={hero ? undefined : `${id}-tab-${view}`}>
      <aside className="home-console-sidebar">
        <a className="home-console-brand" href="/dashboard"><img src="/images/horkos-mark-light.svg" alt="" width="24" height="24" /><span>Horkos</span></a>
        <span className="home-console-label">WORKSPACE</span>
        {views.map(({ label, Icon }, index) => <button key={label} className={view === index ? 'is-active' : ''} aria-pressed={view === index} onClick={() => setView(index)}><Icon size={15} />{label}</button>)}
        <div className="home-console-network"><span /><div>Monad Testnet<small>Recorded fixtures</small></div></div>
      </aside>
      <div className="home-console-main">
        <div className="home-console-topbar"><span><Layers3 size={14} /> Decision registry <ChevronRight size={13} /> {views[view].label}</span><span className="home-recorded-tag">RECORDED</span>{hero && <div className="home-console-mobile-views" aria-label="Preview views">{views.map(({ label, Icon }, index) => <button key={label} aria-label={`Preview ${label}`} title={label} aria-pressed={view === index} onClick={() => setView(index)}><Icon size={12} /></button>)}</div>}</div>
        <div className="home-console-content" key={view}>
          {view === 0 && <>
            <div className="home-console-heading"><div><h3>Decision overview</h3><p>Signed verdicts. Traceable commitments.</p></div><a href="/dashboard" aria-label="Open decision dashboard" title="Open decision dashboard"><ArrowUpRight size={18} /></a></div>
            <div className="home-console-metrics"><div><span>Synthetic incidents</span><strong>{RECORDED.length}<small>Recorded</small></strong></div><div><span>Signature scheme</span><strong>P256<small>Single signer</small></strong></div><div><span>Reference rules</span><strong>2.0.0<small>Tripwire</small></strong></div></div>
            <div className="home-console-table-head"><span>INCIDENT</span><span>RISK SCORE</span><span>RULE TIER</span></div>
            <div className="home-console-rows">{RECORDED.map((item, index) => <button key={item.verdictId} onClick={() => { setSelected(index); setView(1); }} aria-label={`Inspect ${incidentNames[index]} evidence`}>
              <span><span className={`home-risk-icon risk-${tier(item.verdict.scoreBps)}`}><Activity size={14} /></span><span>{incidentNames[index]}<small>Agent #{item.verdict.agentId} / {short(item.verdictId)}</small></span></span>
              <span>{item.verdict.scoreBps.toLocaleString()}<small> bps</small></span><span className={`home-risk-tier risk-${tier(item.verdict.scoreBps)}`}>{['Normal', 'Throttle', 'Delay', 'Freeze'][tier(item.verdict.scoreBps)]}<ChevronRight size={13} /></span>
            </button>)}</div>
          </>}
          {view === 1 && <>
            <div className="home-console-heading"><div><h3>{incidentNames[selected]}</h3><p>Recorded evidence / synthetic, not submitted</p></div><Fingerprint size={24} /></div>
            <div className="home-evidence-summary"><span><KeyRound size={18} /> P256 attestation</span><span>Agent #{bundle.verdict.agentId}</span></div>
            <dl className="home-evidence-fields"><div><dt>Verdict ID</dt><dd>{short(bundle.verdictId)}</dd></div><div><dt>Model</dt><dd>{bundle.model.name} / {bundle.model.version}</dd></div><div><dt>Model hash</dt><dd>{short(bundle.model.hash)}</dd></div><div><dt>Policy commitment</dt><dd>{short(bundle.verdict.policyId)}</dd></div><div><dt>Score</dt><dd>{bundle.verdict.scoreBps.toLocaleString()} bps</dd></div><div><dt>Signature r</dt><dd>{short(bundle.signature.r)}</dd></div></dl>
            <a className="home-evidence-open" href={evidenceLink}>Open evidence workspace <ArrowUpRight size={15} /></a>
          </>}
          {view === 2 && <>
            <div className="home-console-heading"><div><h3>One accountable flow</h3><p>From an observed event to an application policy.</p></div><Braces size={24} /></div>
            <div className="home-integration-flow">{[{ Icon: Activity, title: 'Observe', detail: 'Commit inputs' }, { Icon: Fingerprint, title: 'Attest', detail: 'Bind the signer' }, { Icon: ShieldCheck, title: 'Consume', detail: 'Enforce policy' }].map(({ Icon, title, detail }) => <div key={title}><Icon size={20} /><strong>{title}</strong><span>{detail}</span></div>)}</div>
            <pre className="home-code-preview"><code><span>// recorded verdict</span>{'\n'}{JSON.stringify({ agentId: bundle.verdict.agentId, scoreBps: bundle.verdict.scoreBps, observedAt: bundle.verdict.observedAt, nonce: bundle.verdict.nonce }, null, 2)}</code></pre>
            <a className="home-evidence-open" href="/dashboard?view=integration">Open integration workspace <ArrowUpRight size={15} /></a>
          </>}
        </div>
        <div className="home-console-status"><span><span /> Synthetic data / no chain actions claimed</span><a href={link}>Open workspace <ArrowUpRight size={12} /></a></div>
      </div>
    </div>
    {!hero && <div className="home-preview-caption"><button aria-label="Previous preview" title="Previous preview" onClick={() => setView((view + views.length - 1) % views.length)}><ArrowLeft size={17} /></button><p aria-live="polite">{views[view].caption}</p><button aria-label="Next preview" title="Next preview" onClick={() => setView((view + 1) % views.length)}><ArrowRight size={17} /></button></div>}
  </div>;
}
