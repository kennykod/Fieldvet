import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LuFastForward, LuMonitor, LuSmartphone, LuColumns2, LuCalendarX, LuHourglass, LuRotateCcw, LuFlaskConical, LuChevronDown, LuWifiOff, LuWifi, LuServerOff, LuServer, LuCircleHelp, LuArrowRight, LuX, LuPlay, LuTrafficCone, LuRepeat } from 'react-icons/lu';
import { AppProvider, CoordinatorScope, useDemo, VetScope, type Role } from './store';
import { Dashboard } from './desktop/Dashboard';
import { MobileApp } from './mobile/Mobile';
import { DemoErrorBoundary, Logo, Toasts } from './ui';
import { hhmm, optimizeDay } from './shared/engine';
import { VETS } from './shared/data';
import { cancelVisit } from './shared/actions';
import { StoryGuide, type StoryKind } from './Story';

function useViewport() {
  const [vw, setVw] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVw({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vw;
}

/** Renders the 1440-class dashboard at a logical width and scales it down to fit smaller screens. */
function Scaled({ children, minW = 1280, minH = 760 }: { children: ReactNode; minW?: number; minH?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [sz, setSz] = useState({ w: 1440, h: 900 });
  useLayoutEffect(() => {
    const el = box.current!;
    const m = () => setSz({ w: el.clientWidth, h: el.clientHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lw = Math.max(minW, sz.w);
  const scale = sz.w / lw;
  // On portrait phones keep desktop proportions (the dashboard is a desktop tool) instead of stretching it tall.
  // On landscape screens (laptop, projector, "Båda samtidigt") fill the available height.
  const portrait = sz.h > sz.w;
  const lh = scale < 1 ? Math.max(minH, portrait ? Math.min(sz.h / scale, 900) : sz.h / scale) : Math.max(minH, sz.h);
  return (
    <div className="scaled" ref={box}>
      <div className="scaled-inner" style={{ width: lw, height: lh, transform: scale < 1 ? `scale(${scale})` : undefined }}>{children}</div>
      {scale < 1 && <div style={{ height: lh * scale, width: 1 }} aria-hidden="true" />}
    </div>
  );
}

function PhoneFrame({ maxH }: { maxH: number }) {
  const { s, act } = useDemo();
  const scale = Math.min(1, (maxH - 60) / 860);
  return (
    <div className="phone-col">
    <label className="phone-switch">
      <span>Visar appen för</span>
      <select id="phone-vet" value={s.world.manualVet} disabled={!!s.device} title={s.device ? 'Går inte att byta medan appen saknar täckning' : undefined} onChange={(e) => act.setManualVet(e.target.value)}>
        {VETS.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </label>
    <div className="phone-holder" style={{ width: 404 * scale, height: 860 * scale }}>
      <div className="phone" style={{ transform: `scale(${scale})` }}>
        <div className="phone-screen"><VetScope key={s.world.manualVet}><MobileApp /></VetScope></div>
        <span className="phone-notch" aria-hidden="true" />
      </div>
    </div>
    </div>
  );
}

// ——— Introduction for visitors who explore the demo on their own ———
const INTRO_KEY = 'fieldvet-intro-seen';
function introWanted() {
  if (/[?&]intro=0\b/.test(location.search)) return false; // presenter link: …?intro=0
  try { return localStorage.getItem(INTRO_KEY) !== '1'; } catch { return true; }
}
function rememberIntro() { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* storage unavailable: show again next time */ } }

function Welcome({ compact, onClose, onStory }: { compact: boolean; onClose: () => void; onStory: () => void }) {
  const { setRole } = useDemo();
  const start = (r: Role) => { setRole(r); rememberIntro(); onClose(); };
  const steps: [string, string][] = [
    ['Välj perspektiv', compact ? 'Växla mellan Samordnare (dashboarden) och Veterinär (mobilappen) högst upp.' : 'Samordnare visar dashboarden, Veterinär mobilappen och Båda samtidigt hur de hänger ihop.'],
    ['Låt något hända', 'Öppna Demo uppe till höger. Låt ett besök dra över, en kund avboka eller en veterinär tappa täckning, och se hur FieldVet föreslår en lösning. Som samordnare kan du också importera en egen dag med knappen Importera.'],
    ['Börja om när du vill', 'Demo → Återställ demo tar dig tillbaka till kl. 08:20. Inget du gör sparas.'],
  ];
  return (
    <div className="modal-back" onClick={() => { rememberIntro(); onClose(); }}>
      <div className="modal welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-h" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { rememberIntro(); onClose(); } }}>
        <button className="iconbtn wl-x" onClick={() => { rememberIntro(); onClose(); }} aria-label="Stäng introduktionen"><LuX size={18} /></button>
        <div className="wl-head">
          <Logo size={34} word={false} />
          <h2 id="welcome-h">Välkommen till FieldVet</h2>
          <p>En klickbar konceptprototyp för veterinärer som gör hembesök. Samordnaren ser hela dagen, veterinären ser nästa steg, och när något ändras föreslår FieldVet en lösning. All data är påhittad.</p>
        </div>
        <ol className="wl-steps">
          {steps.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
        </ol>
        <div className="wl-foot">
          {compact
            ? <button className="btn primary" autoFocus onClick={() => start('veterinar')}>Starta som veterinär<LuArrowRight size={16} /></button>
            : <>
                <button className="btn ghost" onClick={() => start('samordnare')}>Börja som samordnare</button>
                <button className="btn ghost" onClick={() => { rememberIntro(); onClose(); onStory(); }}><LuPlay size={15} />Guidad demo, 3 min</button>
                <button className="btn primary" autoFocus onClick={() => start('bada')}>Visa båda samtidigt<LuArrowRight size={16} /></button>
              </>}
        </div>
      </div>
    </div>
  );
}


/* ——— Colour demo: show the product in a clinic's accent colour. Only the brand accent changes;
   status colours (sen, akut, klar, ledigt) and the vets' own colours stay fixed so meaning never shifts. ——— */
const FIELDVET = '#2A7867';
const CLINIC_PINK = '#D94F8A';
const hexRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (c: number[]) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t);
function applyAccent(hex: string | null) {
  const r = document.documentElement.style;
  const keys = ['--brand', '--brand-ink', '--brand-soft', '--brand-tint'];
  if (!hex || hex.toLowerCase() === FIELDVET.toLowerCase()) { keys.forEach((k) => r.removeProperty(k)); return; }
  const base = hexRgb(hex);
  // Buttons carry white text: darken just enough for 4.5:1 contrast.
  let brand = base; for (let t = 0; t < 0.8 && 1.05 / (lum(brand) + 0.05) < 4.5; t += 0.04) brand = mix(base, [0, 0, 0], t);
  r.setProperty('--brand', rgbHex(brand));
  r.setProperty('--brand-ink', rgbHex(mix(brand, [0, 0, 0], 0.22)));
  r.setProperty('--brand-soft', rgbHex(mix(base, [255, 255, 255], 0.84)));
  r.setProperty('--brand-tint', rgbHex(mix(base, [255, 255, 255], 0.93)));
}
const initialAccent = (() => {
  const q = new URLSearchParams(location.search).get('farg');
  if (q === 'klinik' || q === 'rosa') return CLINIC_PINK;
  if (q && /^[0-9a-f]{6}$/i.test(q)) return '#' + q;
  try { return sessionStorage.getItem('fv-accent') || FIELDVET; } catch { return FIELDVET; }
})();
applyAccent(initialAccent);

function ThemePicker() {
  const [accent, setAccent] = useState(initialAccent);
  const pick = (h: string) => { setAccent(h); applyAccent(h); try { sessionStorage.setItem('fv-accent', h); } catch { /* demo only */ } };
  const opts: [string, string][] = [[FIELDVET, 'FieldVet'], [CLINIC_PINK, 'Klinikens rosa']];
  const custom = !opts.some(([h]) => h.toLowerCase() === accent.toLowerCase());
  return (
    <div className="dm-theme" role="group" aria-label="Färgtema">
      {opts.map(([h, label]) => (
        <button key={h} role="menuitemradio" aria-checked={accent.toLowerCase() === h.toLowerCase()} className={accent.toLowerCase() === h.toLowerCase() ? 'on' : ''} onClick={() => pick(h)}>
          <i style={{ background: h }} />{label}
        </button>
      ))}
      <label className={custom ? 'on' : ''} title="Välj egen accentfärg">
        <input type="color" value={accent} onChange={(e) => pick(e.target.value)} aria-label="Egen accentfärg" />
        <span>Egen</span>
      </label>
    </div>
  );
}

function DemoStrip({ compact, onIntro, onStory }: { compact: boolean; onIntro: () => void; onStory: (k?: StoryKind) => void }) {
  const { role, setRole, act, vetAct, s, toast, plans } = useDemo();
  const [open, setOpen] = useState(false);
  const roles: [Role, ReactNode, string][] = [
    ['samordnare', <LuMonitor size={14} />, 'Samordnare'],
    ['veterinar', <LuSmartphone size={14} />, 'Veterinär'],
  ];
  if (!compact) roles.push(['bada', <LuColumns2 size={14} />, 'Båda samtidigt']);
  const cancelOne = () => {
    const anna = plans[s.world.manualVet];
    const cand = anna.stops.filter((x) => x.state === 'kommande');
    // Demo: prefer a cancellation where re-planning actually helps, so the flow shows a real proposal.
    const free = cand.filter((x) => !s.world.visits[x.id].locked && x.late <= 5); // not the visit currently being fixed
    const useful = free.find((x) => { const r = cancelVisit(s.world, x.id); return r.ok && optimizeDay(r.world).changes.length > 0; });
    const pick = useful ?? free.find((x) => x.id === 'v-ester') ?? free[0];
    if (!pick) { toast('Inga fler planerade besök att avboka', 'warn'); return; }
    if (act.cancel(pick.id)) toast(`${s.world.visits[pick.id].patient.name} har avbokats av ägaren`, 'info');
  };
  const run = (f: () => void) => { f(); setOpen(false); };
  return (
    <div className={`demostrip${compact ? ' compact' : ''}`}>
      <span className="ds-note"><Logo size={20} word={false} /><b>FieldVet</b><span className="ds-dim">Konceptprototyp · fiktiv data · inget officiellt samarbete</span></span>
      <div className="seg small" role="radiogroup" aria-label="Visa som">
        {roles.map(([id, icon, label]) => (
          <button key={id} className={role === id ? 'on' : ''} onClick={() => setRole(id)} role="radio" aria-checked={role === id}>{icon}<span>{label}</span></button>
        ))}
      </div>
      <div className="ds-right">
        <button className={`demo-toggle${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <LuFlaskConical size={14} /><span>Demo</span><span className="tnum">{hhmm(s.world.now)}</span><LuChevronDown size={14} />
        </button>
        {open && (
          <div className="demo-menu" role="menu">
            {!compact && <button role="menuitem" className="dm-story" onClick={() => run(() => onStory('dag'))}><LuPlay size={15} /><span><b>Guidad demo</b><span>Hela flödet steg för steg, ca 3 min</span></span></button>}
            {!compact && <button role="menuitem" className="dm-story" onClick={() => run(() => onStory('provet'))}><LuPlay size={15} /><span><b>Guidad demo: Provet i bakgrunden</b><span>Kundmeddelanden och historik, ca 1 min</span></span></button>}
            <p className="muted">Simulera händelser. Tiden i demon går framåt när något händer.</p>
            <button role="menuitem" onClick={() => run(() => { act.advanceMin(15); toast('Tiden spolades fram 15 min', 'info'); })}><LuFastForward size={15} />Spola fram 15 min</button>
            <button role="menuitem" onClick={() => run(() => { vetAct.forceOverrun(25); toast('Annas besök drar över 25 min', 'warn'); })}><LuHourglass size={15} />Annas besök drar över 25 min</button>
            <button role="menuitem" onClick={() => run(cancelOne)}><LuCalendarX size={15} />En kund avbokar</button>
            <button role="menuitem" onClick={() => run(() => { if (vetAct.demoTraffic(20)) toast('Köer på vägen: Annas ankomst flyttas 20 min', 'warn'); })}><LuTrafficCone size={15} />Köer på Annas väg, +20 min</button>
            <button role="menuitem" onClick={() => run(() => { vetAct.demoResend(); })}><LuRepeat size={15} />Appen skickar samma händelse igen</button>
            <button role="menuitem" onClick={() => run(() => act.setOffline(!s.device))}>{s.device ? <LuWifi size={15} /> : <LuWifiOff size={15} />}{s.device ? 'Anna får täckning igen' : 'Anna tappar täckning'}</button>
            <button role="menuitem" onClick={() => run(() => act.setProvetDown(!s.provetDown))}>{s.provetDown ? <LuServer size={15} /> : <LuServerOff size={15} />}{s.provetDown ? 'Provet svarar igen' : 'Provet slutar svara'}</button>
            <button role="menuitem" onClick={() => run(() => { act.reset(); toast('Demon är återställd till 08:20', 'info'); })}><LuRotateCcw size={15} />Återställ demo</button>
            <button role="menuitem" onClick={() => run(onIntro)}><LuCircleHelp size={15} />Så fungerar demon</button>
            <p className="muted dm-sec">Färgtema · bara accentfärgen byts, statusfärgerna ligger fast</p>
            <ThemePicker />
          </div>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const { role, setRole, s, act, toast } = useDemo();
  const vp = useViewport();
  const phone = vp.w < 640;
  useEffect(() => { if (phone && role === 'bada') setRole('veterinar'); }, [phone, role, setRole]);
  const stageH = vp.h - (phone ? 44 : 40);
  const [intro, setIntro] = useState(introWanted);
  const [story, setStory] = useState(0);
  const [storyKind, setStoryKind] = useState<StoryKind>('dag');
  // The guided story needs the dashboard and the phone side by side.
  const startStory = (k: StoryKind = 'dag') => {
    if (k === 'provet') act.reset(); else act.storyStart();
    setStoryKind(k); setRole('bada'); setIntro(false); setStory((n) => n + 1);
  };
  useEffect(() => { if (phone) setStory(0); }, [phone]);
  return (
    <div className={`shell role-${role}${phone ? ' phone-mode' : ''}`}>
      <DemoStrip compact={phone} onIntro={() => setIntro(true)} onStory={startStory} />
      <div className="stage">
        {/* key: "Återställ demo" remounts all local UI state, so nothing can point at a visit that no longer exists. */}
        <DemoErrorBoundary key={s.epoch} onReset={() => { act.reset(); toast('Demon är återställd till 08:20', 'info'); }}>
        {role === 'samordnare' && (phone ? (
          <div className="phone-coord"><p>Samordnarvyn är byggd för dator. Här visas den förminskad, tryck och zooma för detaljer.</p><Scaled><CoordinatorScope><Dashboard /></CoordinatorScope></Scaled></div>
        ) : <Scaled><CoordinatorScope><Dashboard /></CoordinatorScope></Scaled>)}
        {role === 'veterinar' && (phone ? <div className="fullapp"><VetScope><MobileApp /></VetScope></div> : (
          <div className="vet-stage">
            <div className="stage-copy">
              <Logo size={30} />
              <h2>Veterinärens app</h2>
              <p>Nästa patient, navigering och ett enkelt statusflöde. Allt som ändras här syns direkt hos samordnaren.</p>
              <ol>
                <li>Starta navigering</li>
                <li>Jag är framme</li>
                <li>Starta besök</li>
                <li>Avsluta besök</li>
              </ol>
            </div>
            <PhoneFrame maxH={stageH - 24} />
          </div>
        ))}
        {role === 'bada' && (
          <div className="split">
            <Scaled><CoordinatorScope><Dashboard /></CoordinatorScope></Scaled>
            <div className="split-phone"><PhoneFrame maxH={stageH - 20} /></div>
          </div>
        )}
        </DemoErrorBoundary>
      </div>
      {intro && <Welcome compact={phone} onClose={() => setIntro(false)} onStory={() => startStory('dag')} />}
      {story > 0 && !phone && <StoryGuide key={story} kind={storyKind} onClose={() => setStory(0)} onRestart={() => startStory(storyKind)} />}
      <Toasts />
    </div>
  );
}

const hash = location.hash.replace('#', '');
const initialRole: Role = hash === 'veterinar' || hash === 'bada' || hash === 'samordnare' ? hash : window.innerWidth < 640 ? 'veterinar' : 'samordnare';

createRoot(document.getElementById('root')!).render(
  <AppProvider initialRole={initialRole}>
    <Shell />
  </AppProvider>,
);
