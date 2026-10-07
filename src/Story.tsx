// Guided demo story for pitches: one deterministic scenario through the whole value chain.
// Each step points at the real button to press (spotlight). "Gör det åt mig" presses it for you.
import { useEffect, useRef, useState } from 'react';
import { LuArrowRight, LuCheck, LuMinimize2, LuPlay, LuRotateCcw, LuX, LuMousePointerClick } from 'react-icons/lu';
import { useDemo, type AppState } from './store';
import { hhmm, LATE_TOL, vetById, type VetPlan } from './shared/engine';
import { Logo } from './ui';

type Demo = ReturnType<typeof useDemo>;
interface Step {
  title: string;
  text: (d: Demo) => string;
  /** Click path, in order. The last one currently on screen is highlighted. Comma = either selector. */
  targets?: string[];
  /** Highlight only (nothing to press). */
  spot?: string;
  run?: (d: Demo) => void;
  runLabel?: string;
  enter?: (d: Demo) => void;
  done: (d: Demo) => boolean;
}

const tessan = (s: AppState) => Object.values(s.world.visits).find((v) => v.patient.name === 'Tessan' && v.vetId);
const worstRisk = (plans: Record<string, VetPlan>, s: AppState) => {
  const all = Object.values(plans).flatMap((p) => p.stops.filter((x) => x.state === 'kommande' && x.late > LATE_TOL).map((x) => ({ x, v: s.world.visits[x.id] })));
  return all.sort((a, b) => a.x.arrive - b.x.arrive)[0];
};
const has = (sel: string) => !!document.querySelector(sel);
const ALERT = (kind: string) => `.side .alert[data-kind="${kind}"] button`;

const STEPS: Step[] = [
  {
    title: 'En veterinär ligger efter',
    text: () => 'Klockan är 09:45. Anna är hos katten Luna och besöket drar ut på tiden. Hennes app räknar om resten av dagen direkt.',
    run: (d) => { d.vetAct.forceOverrun(30); d.toast('Lunas besök drar över 30 min', 'warn'); },
    runLabel: 'Låt besöket dra över',
    done: (d) => (d.s.world.visits['v-luna']?.extension ?? 0) >= 30,
  },
  {
    title: 'FieldVet ser risken i förväg',
    text: (d) => {
      const r = worstRisk(d.plans, d.s);
      return r ? `${r.v.patient.name} ${hhmm(r.v.window.from)} beräknas bli ca ${r.x.late} min sen. Samordnaren ser det direkt i raden högst upp och under Behöver åtgärdas, innan kunden märker något.` : 'Förseningen syns högst upp och under Behöver åtgärdas.';
    },
    spot: '[data-demo="risk-summary"]',
    done: () => true,
  },
  {
    title: 'Ett akutärende kommer in',
    text: () => 'Receptionen lägger in ett akutärende: katten Tessan på Kungsholmen, alldeles nära Anna. Men Anna ligger redan efter.',
    run: (d) => { d.act.storyReleaseUrgent(); d.toast('Nytt akutärende från receptionen', 'warn'); },
    runLabel: 'Skicka in akutärendet',
    done: (d) => d.s.slack.some((th) => th.id === 'th-tessan' && th.root.at <= d.s.world.now),
  },
  {
    title: 'Hitta rätt veterinär',
    text: () => 'Tryck Tilldela. Uppgifterna från receptionen är redan ifyllda. FieldVet jämför alla team innan något läggs in i schemat.',
    targets: [ALERT('urgent'), '[data-demo="find-team"]'],
    done: () => has('[data-demo="suggest-list"]'),
  },
  {
    title: 'Ett förslag, påverkan synlig',
    text: () => 'FieldVet visar det team som passar bäst: körtid, vad som händer med nästa besök och när de är framme. Under Visa andra team syns varför Anna och Sara inte passar. Tilldela.',
    targets: ['[data-demo="assign-urgent"]'],
    done: (d) => !!tessan(d.s),
  },
  {
    title: 'Mottagarens app uppdateras direkt',
    text: (d) => { const v = tessan(d.s); const f = v ? vetById(v.vetId).first : 'Veterinären'; return `${f}s app visar akutbesöket direkt, med adress och ankomsttid. ${f} bekräftar med ett tryck och samordnaren ser det.`; },
    enter: (d) => { const v = tessan(d.s); if (v) d.act.setManualVet(v.vetId); },
    targets: ['[data-demo="ack-urgent"]'],
    done: (d) => tessan(d.s)?.ack != null,
  },
  {
    title: 'Kunden får ny tid',
    text: () => 'Annas nästa kund ska inte vänta ovisst. Öppna förseningen, välj att behålla planen och skicka ny tid. Provet skickar den. Visa skickat meddelande visar vad ägaren ser: förnamn, tid och status, inget mer.',
    targets: ['.side .panel-head button[aria-label="Tillbaka"]', ALERT('risk'), '[data-demo="alts"]', '[data-demo="keep-plan"]', '[data-demo="send-eta"]', '[data-demo="customer-view"]'],
    done: () => has('[data-demo="customer-modal"]'),
  },
  {
    title: 'Från hembesök till klinik',
    text: (d) => { const v = tessan(d.s); const f = v ? vetById(v.vetId).first : 'Veterinären'; return `Senare samma förmiddag. ${f} är hos Tessan och bedömer att hon behöver dropp och övervakning på kliniken. Fortsatt vård på klinik: välj när och varför, skicka.`; },
    enter: (d) => {
      (document.querySelector('.modal.customer .modal-head button[aria-label="Stäng"]') as HTMLElement | null)?.click();
      const v = tessan(d.s);
      if (v) { d.act.storyJumpTo(v.id); d.toast('Senare samma förmiddag', 'info'); }
    },
    targets: ['[data-demo="m-continue"]', '[data-demo="m-handoff"]', '[data-demo="handoff-send"]'],
    done: (d) => d.s.handoffs.length > 0,
  },
  {
    title: 'Samordnaren bekräftar nästa steg',
    text: () => 'Ärendet ligger överst under Behöver åtgärdas. FieldVet föreslår nästa lediga kliniktid. Bekräfta, så får veterinären, ägaren och kliniken besked.',
    targets: ['.side .panel-head button[aria-label="Tillbaka"]', ALERT('handoff'), '[data-demo="handoff-confirm"]'],
    done: (d) => d.s.handoffs.some((h) => h.status === 'bekraftad'),
  },
];

/* Provet in the background: the vet stays in FieldVet, Provet sends and supplies history. Starts at 08:20. */
const bosseEta = (d: Demo) => d.s.eta['v-bosse'];
const PROVET_STEPS: Step[] = [
  {
    title: 'Bosse är nästa besök',
    text: () => 'Klockan är 08:20. Annas nästa besök är Bosse, vaccination på Dalagatan. Hon trycker Starta navigering. Det är allt hon gör.',
    targets: ['[data-demo="m-nav"]'],
    done: (d) => d.s.world.visits['v-bosse']?.status !== 'planerad',
  },
  {
    title: 'Provet informerar ägaren',
    text: (d) => { const e = bosseEta(d); return `Status blev På väg automatiskt. FieldVet räknade ut ankomsttiden${e ? ` ${hhmm(e.from)}–${hhmm(e.to)}` : ''} och bad Provet skicka klinikens "på väg"-meddelande. Anna skrev ingenting och behövde inte öppna Provet.`; },
    spot: '[data-demo="m-comm"]',
    done: (d) => bosseEta(d)?.state === 'sent',
  },
  {
    title: 'Historik utan att byta system',
    text: () => 'Inför vaccinationen vill Anna se hur det gick förra året. Visa historik hämtar Bosses historik från Provet: bara hennes egen patient, bara läsning.',
    targets: ['[data-demo="m-history"]'],
    done: () => has('[data-demo="history-list"]'),
  },
  {
    title: 'Tillbaka dit hon var',
    text: () => 'Förra året fick Bosse en lindrig reaktion efter vaccinationen. Det syns också under det viktiga på besökskortet. Tryck tillbaka, så är Anna kvar på samma ställe.',
    targets: ['[data-demo="history-back"]'],
    done: () => !has('.mhist'),
  },
  {
    title: 'Köer på vägen',
    text: () => 'Det blir kö på vägen och ankomsten flyttas 20 minuter. Det är mer än gränsen på 10 minuter, så FieldVet ber Provet skicka en ny tid. En gång.',
    run: (d) => { d.vetAct.demoTraffic(20); },
    runLabel: 'Lägg till köer, +20 min',
    done: (d) => { const e = bosseEta(d); return !!e && e.type !== 'VETERINARIAN_ON_THE_WAY' && e.state === 'sent'; },
  },
  {
    title: 'Inga dubbletter',
    text: () => 'Appen tappar nätet en sekund och skickar samma händelse igen. Den har samma nyckel som förut, så FieldVet stoppar den. Karin får inget extra sms.',
    run: (d) => { d.vetAct.demoResend(); },
    runLabel: 'Låt appen skicka igen',
    done: (d) => d.s.commDupes > 0,
  },
  {
    title: 'Samordnaren ser läget',
    text: () => 'Maria ser på Annas teamkort att ägaren har fått den nya tiden. Ingen behövde ringa, och Anna har inte öppnat Provet en enda gång.',
    spot: '[data-demo="vc-comm-anna"]',
    done: () => true,
  },
];

export type StoryKind = 'dag' | 'provet';
const STORIES: Record<StoryKind, { steps: Step[]; title: string; summary: string[] }> = {
  dag: { steps: STEPS, title: 'Hela kedjan, på ett par minuter', summary: [
    'Förseningen upptäcktes innan kunden märkte den',
    'Akutbesöket gick till bäst lämpade team, med påverkan synlig före beslut',
    'Veterinären såg och bekräftade ändringen direkt',
    'Ägarna fick ny tid utan att någon ringde',
    'Hembesöket fortsatte på kliniken med en tydlig överlämning',
  ] },
  provet: { steps: PROVET_STEPS, title: 'Provet i bakgrunden', summary: [
    'Starta navigering gav På väg, och Provet skickade tiden till ägaren',
    'Historiken hämtades från Provet, bara för läsning',
    'En ny tid gick ut en gång när ankomsten ändrades mer än 10 min',
    'Ett nytt försök från appen gav ingen dubblett',
    'Samordnaren såg att kunden var informerad',
  ] },
};

function findTarget(step: Step): HTMLElement | null {
  if (step.targets) {
    for (let i = step.targets.length - 1; i >= 0; i--) {
      const el = document.querySelector(step.targets[i]) as HTMLElement | null;
      if (el && !(el as HTMLButtonElement).disabled) return el;
    }
    return null;
  }
  return step.spot ? (document.querySelector(step.spot) as HTMLElement | null) : null;
}

export function StoryGuide({ kind = 'dag', onClose, onRestart }: { kind?: StoryKind; onClose: () => void; onRestart: () => void }) {
  const STEPS = STORIES[kind].steps;
  const d = useDemo();
  const [idx, setIdx] = useState(0);
  const [mini, setMini] = useState(false);
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);
  const spotRef = useRef<HTMLElement | null>(null);
  const dRef = useRef(d);
  dRef.current = d;
  const finished = idx >= STEPS.length;
  const step = STEPS[Math.min(idx, STEPS.length - 1)];

  // Enter effects run once per step.
  useEffect(() => { if (!finished) step.enter?.(dRef.current); }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spotlight the element to press, and re-check "done" as the UI changes.
  useEffect(() => {
    const clear = () => { spotRef.current?.classList.remove('demo-spot'); spotRef.current = null; };
    if (finished) { clear(); return; }
    const t = setInterval(() => {
      const el = findTarget(step);
      if (el !== spotRef.current) {
        clear();
        if (el) { el.classList.add('demo-spot'); spotRef.current = el; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      }
      tick((n) => n + 1);
    }, 250);
    return () => { clearInterval(t); clear(); };
  }, [idx, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = !finished && step.done(d);
  const doIt = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (step.run && !step.done(dRef.current)) step.run(dRef.current);
      for (let i = 0; i < 8 && !step.done(dRef.current); i++) {
        const el = findTarget(step);
        if (!el) break;
        el.click();
        await new Promise((r) => setTimeout(r, 450));
      }
    } finally { setBusy(false); }
  };

  if (mini) {
    return (
      <button className="story-mini" onClick={() => setMini(false)} aria-label="Visa demoberättelsen">
        <LuPlay size={13} />{finished ? 'Demoberättelse klar' : `Steg ${idx + 1} av ${STEPS.length}`}
      </button>
    );
  }

  return (
    <aside className="story" aria-label="Demoberättelse" role="complementary">
      <div className="story-head">
        <Logo size={20} word={false} />
        <span>Demoberättelse{!finished && <em> · steg {idx + 1} av {STEPS.length}</em>}</span>
        <button className="iconbtn sm" onClick={() => setMini(true)} aria-label="Minimera"><LuMinimize2 size={14} /></button>
        <button className="iconbtn sm" onClick={onClose} aria-label="Avsluta demoberättelsen"><LuX size={15} /></button>
      </div>
      <div className="story-dots" aria-hidden="true">{STEPS.map((_, i) => <i key={i} className={i < idx ? 'done' : i === idx ? 'now' : ''} />)}</div>
      {finished ? (
        <div className="story-body">
          <b className="story-title">{STORIES[kind].title}</b>
          <ul className="story-sum">
            {STORIES[kind].summary.map((x) => <li key={x}><LuCheck size={13} />{x}</li>)}
          </ul>
          <div className="story-foot">
            <button className="btn ghost sm" onClick={onRestart}><LuRotateCcw size={14} />Spela igen</button>
            <button className="btn primary sm" onClick={onClose}>Klar</button>
          </div>
        </div>
      ) : (
        <div className="story-body">
          <b className="story-title">{step.title}</b>
          <p>{step.text(d)}</p>
          {step.targets && !done && <p className="story-hint"><LuMousePointerClick size={13} />Tryck på det markerade, eller låt demon göra det.</p>}
          <div className="story-foot">
            {!done && (step.run || step.targets) ? (
              <button className="btn soft sm" onClick={doIt} disabled={busy}>{step.run ? step.runLabel : 'Gör det åt mig'}</button>
            ) : <span className="story-ok"><LuCheck size={14} />Klart</span>}
            <button className={`btn primary sm${done ? ' pulse' : ''}`} disabled={!done} onClick={() => setIdx(idx + 1)}>{idx === STEPS.length - 1 ? 'Avsluta' : 'Nästa'}<LuArrowRight size={14} /></button>
          </div>
        </div>
      )}
    </aside>
  );
}
