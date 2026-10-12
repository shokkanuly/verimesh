import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, FileCheck2, Fingerprint, KeyRound, Menu, Minus, Plus, ShieldCheck, Workflow, X } from 'lucide-react';
import { WorkspacePreview } from './WorkspacePreview';
import './home.css';

const HeroLandscape = lazy(() => import('./HeroLandscape').then((module) => ({ default: module.HeroLandscape })));
const sections = [
  { id: 'about', label: 'About' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'protocol', label: 'Protocol' },
  { id: 'faq', label: 'FAQs' },
];
const questions = [
  ['What can I try right now?', 'Five verdicts and the throttle, delay and freeze sequence are live on Monad testnet. The dashboard separates live RPC receipts from recorded fixtures. Both use synthetic inputs.'],
  ['Does a valid signature prove the input is true?', 'P256 proves an attestation came from the signing key. Offline verification checks the committed inputs and supported scoring rules. It does not prove that supplied features are true.'],
  ['Are the recorded incidents live transactions?', 'Recorded incidents are synthetic and have not been submitted. LIVE is a separate, explicit RPC view; it never substitutes recorded rows when the connection fails.'],
  ['Who decides which agents to trust?', 'The identity owner controls key binding and revocation. Each consuming application chooses its trusted agents, models and policy. Horkos uses one signer per agent.'],
  ['Is Horkos ready for production?', 'This is a source-verified Monad testnet prototype, not a production deployment. Public hosting and remaining roadmap work are pending. Tripwire uses a mock bridge and one trusted signer.'],
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState(window.location.hash.slice(1));
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(window.scrollY > 24);
  const menuButton = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !('IntersectionObserver' in window)) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    const synchronize = () => {
      observer.disconnect();
      page.classList.toggle('motion-ready', !reduced.matches);
      if (!reduced.matches) page.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    };
    synchronize();
    reduced.addEventListener('change', synchronize);
    return () => { observer.disconnect(); reduced.removeEventListener('change', synchronize); page.classList.remove('motion-ready'); };
  }, []);

  useEffect(() => {
    const updateSection = () => setSection(window.location.hash.slice(1));
    const desktop = window.matchMedia('(min-width: 701px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('hashchange', updateSection);
    window.addEventListener('scroll', onScroll, { passive: true });
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      window.removeEventListener('hashchange', updateSection);
      window.removeEventListener('scroll', onScroll);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);

  return <div className="home-page" ref={pageRef}>
    <a className="home-skip" href="#home-content">Skip to content</a>
    <header className={`home-header ${scrolled ? 'is-scrolled' : ''}`} onKeyDown={(event) => {
      if (!menuOpen) return;
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
      if (event.key === 'Tab') {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button')).filter((element) => element.offsetParent !== null);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="home-container home-header-inner">
        <a className="home-brand" href="/" aria-label="Horkos home"><img src="/images/horkos-mark-light.svg" alt="" width="32" height="32" /><span>Horkos<span className="home-brand-dot">.</span></span></a>
        <nav className="home-desktop-nav" aria-label="Main navigation">{sections.map(({ id, label }) => <a key={id} href={`#${id}`} aria-current={section === id ? 'location' : undefined} onClick={() => setSection(id)}>{label}</a>)}</nav>
        <div className="home-header-actions"><a className="home-integration-link" href="/dashboard?view=integration">Integration</a><a className="home-button home-button-nav" href="/dashboard">Open dashboard <ArrowUpRight size={14} /></a>
          <button ref={menuButton} className="home-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="home-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </div>
      {menuOpen && <nav id="home-mobile-nav" className="home-mobile-nav" aria-label="Mobile navigation"><div className="home-mobile-links">{sections.map(({ id, label }) => <a key={id} href={`#${id}`} onClick={() => { setSection(id); setMenuOpen(false); }}>{label}<ArrowUpRight size={21} /></a>)}</div><div className="home-mobile-footer"><span>Signed decisions. Explicit trust.</span><a className="home-button home-button-primary" href="/dashboard">Open dashboard <ArrowUpRight size={16} /></a><a href="/dashboard?view=integration">Integration <ArrowRight size={15} /></a></div></nav>}
    </header>

    <main id="home-content" className="home-main" inert={menuOpen}>
      <div className="home-scene">
        <Suspense fallback={<div className="home-landscape" />}><HeroLandscape paused={menuOpen} /></Suspense>
        <section className="home-hero home-container" aria-labelledby="home-title">
          <span className="home-eyebrow home-hero-kicker"><span /> Decision infrastructure for agents</span>
          <h1 id="home-title" aria-label="Horkos decision registry">Horkos<span>.</span></h1>
          <p className="home-tagline">Every decision.<br /><span>Accounted for.</span></p>
          <p className="home-description">A signed path from machine signals to guarded actions.<br className="home-desktop-break" /> Identity, evidence and policy. Bound together.</p>
          <div className="home-hero-actions"><a className="home-button home-button-primary" aria-label="Open the dashboard" href="/dashboard">Explore the workspace <ArrowUpRight size={16} /></a><a className="home-button home-button-text" href="/dashboard?mode=live">Live on Monad <ArrowUpRight size={15} /></a></div>
        </section>
        <div className="home-hero-preview home-dashboard-preview home-container"><WorkspacePreview hero /><div className="home-hero-preview-note"><span><span /> RECORDED preview</span><span>Testnet enforcement live. Inputs synthetic.</span></div></div>
      </div>

      <div className="home-foundations home-container" aria-label="Protocol foundations" data-reveal><span>Built on verifiable commitments</span><div>{[{ Icon: Fingerprint, label: 'Identity binding' }, { Icon: KeyRound, label: 'P256 signatures' }, { Icon: FileCheck2, label: 'EIP-712 verdicts' }, { Icon: ShieldCheck, label: 'Replay protection' }].map(({ Icon, label }) => <span key={label}><Icon size={20} strokeWidth={1.5} />{label}</span>)}</div></div>

      <section id="about" className="home-about home-container" aria-labelledby="home-about-title"><div className="home-about-inner"><span className="home-eyebrow" data-reveal><span /> The idea</span><h2 id="home-about-title" data-reveal>Machines can make the call.<br /><span>You should know what stands behind it.</span></h2><p data-reveal>Horkos connects a verdict to the agent that signed it, the evidence it committed to, and the policy that governs what happens next.</p><p data-reveal>One accountable path. From an observed signal to a bounded action. <span>The application stays in control.</span></p></div></section>

      <section id="workspace" className="home-workspace home-container" aria-labelledby="workspace-title"><div className="home-section-heading" data-reveal><div><span className="home-eyebrow"><span /> The workspace</span><h2 id="workspace-title">The whole decision.<br /><span>In one place.</span></h2></div><p>Follow a verdict from score to signature. Inspect its commitments, then explore the integration that consumes it.</p></div><div data-reveal><WorkspacePreview /></div></section>

      <section id="protocol" className="home-protocol home-container" aria-labelledby="protocol-title"><div className="home-section-heading" data-reveal><div><span className="home-eyebrow"><span /> The protocol</span><h2 id="protocol-title">Observe. Attest. Act.<br /><span>A clear chain of commitments.</span></h2></div><p>Keep authority explicit at every step. Fresh verdicts, bound signers and application-owned policies.</p></div><div className="home-steps">{[{ Icon: FileCheck2, title: 'Observe the signal', text: 'Normalize an event. Commit to its inputs and the versioned scoring rules.', detail: 'Inputs + model', tone: 'blue' }, { Icon: Fingerprint, title: 'Attest with identity', text: "Sign the verdict with P256. Verify it against the agent's bound key.", detail: 'Identity + signature', tone: 'white' }, { Icon: Workflow, title: 'Apply a bounded action', text: 'Consume a fresh verdict once per contract. Let the application enforce its policy.', detail: 'Policy + replay protection', tone: 'mint' }].map(({ Icon, title, text, detail, tone }, index) => <div className="home-step" key={title} data-reveal style={{ transitionDelay: `${index * 80}ms` }}><div className={`home-step-art ${tone}`}><Icon size={35} strokeWidth={1.2} /><span>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p><span className="home-step-detail">{detail}</span></div>)}</div><a className="home-inline-link" href="/dashboard?view=integration">Explore the integration <ArrowUpRight size={16} /></a></section>

      <section id="trust" className="home-trust home-container" aria-labelledby="trust-title"><div className="home-trust-heading" data-reveal><span className="home-eyebrow"><span /> Explicit trust</span><h2 id="trust-title">A signature has meaning.<br /><span>Know its boundaries.</span></h2><p>An attestation proves where a decision came from. The consuming application decides what to trust.</p><a className="home-inline-link" href="/dashboard?view=evidence">Follow the evidence <ArrowUpRight size={16} /></a></div><div className="home-trust-details">{[{ Icon: Fingerprint, title: 'Your identity. Your authority.', text: 'Identity ownership controls key binding and revocation.' }, { Icon: FileCheck2, title: 'Evidence you can re-execute.', text: 'Recompute supported rules and signatures. Supplied feature truth is not independently proven.' }, { Icon: ShieldCheck, title: 'Trust stays with the application.', text: 'Consumers choose trusted agents, models and acceptable policies.' }, { Icon: Workflow, title: 'Actions stay bounded.', text: 'Tripwire demonstrates throttle, delay and freeze through a mock bridge.' }].map(({ Icon, title, text }) => <div key={title} data-reveal><Icon size={21} strokeWidth={1.5} /><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></section>

      <section id="faq" className="home-faq home-container" aria-labelledby="faq-title"><div className="home-section-heading" data-reveal><div><span className="home-eyebrow"><span /> A little clarity</span><h2 id="faq-title">Good questions.<br /><span>Explicit answers.</span></h2></div><p>Know the prototype, the commitments and the limits before you trust a decision.</p></div><div className="home-faq-body"><div className="home-faq-aside" data-reveal><span>HORKOS / PROTECTED TESTNET PREVIEW</span><p>Start with the evidence.</p><a className="home-inline-link" href="/dashboard?view=evidence">Open evidence <ArrowUpRight size={16} /></a></div><div className="home-questions" data-reveal>{questions.map(([question, answer], index) => <div className={`home-question ${openQuestion === index ? 'is-open' : ''}`} key={question}><button aria-expanded={openQuestion === index} aria-controls={`home-answer-${index}`} onClick={() => setOpenQuestion(openQuestion === index ? null : index)}><span>{question}</span>{openQuestion === index ? <Minus size={17} /> : <Plus size={17} />}</button><div id={`home-answer-${index}`} hidden={openQuestion !== index}><p>{answer}</p></div></div>)}</div></div></section>

      <section className="home-closing" aria-labelledby="home-closing-title"><div className="home-container"><img className="home-closing-mark" src="/images/horkos-mark-light.svg" alt="" width="56" height="56" data-reveal /><span className="home-eyebrow" data-reveal><span /> Follow the evidence</span><h2 id="home-closing-title" data-reveal>Meet the decision.<br /><span>Understand the commitment.</span></h2><a className="home-button home-button-primary" aria-label="Inspect signed evidence" href="/dashboard?view=evidence">Inspect signed evidence <ArrowUpRight size={16} /></a><p>Source-verified Monad testnet deployment.<br />Synthetic inputs. One trusted signer. Protected testnet preview.</p></div></section>
    </main>

    <footer className="home-footer" inert={menuOpen}><div className="home-container"><div className="home-footer-top"><a className="home-brand" href="/"><img src="/images/horkos-mark-light.svg" alt="" width="32" height="32" /><span>Horkos.</span></a><div><a href="#protocol">Protocol</a><a href="#trust">Trust boundaries</a><a href="/dashboard?view=integration">Integration <ArrowUpRight size={13} /></a></div></div><div className="home-footer-wordmark" aria-hidden="true">Horkos<span>.</span></div><div className="home-footer-bottom"><span>Signed decisions. Explicit trust.</span><span>Protected testnet preview / 2026</span></div></div></footer>
  </div>;
}
