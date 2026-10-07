import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuArrowLeft, LuBattery, LuCalendarDays, LuCamera, LuCar, LuCheck, LuChevronRight, LuCircleCheck, LuClock, LuHouse, LuInfo, LuKeyRound, LuListChecks, LuMapPin, LuMessageSquare, LuMessagesSquare, LuMic, LuNavigation, LuPackage, LuPhone, LuPlay, LuPlus, LuRoute, LuSend, LuSignal, LuSparkles, LuStethoscope, LuTimer, LuTriangleAlert, LuUser, LuWifi, LuWifiOff, LuFileText, LuHourglass, LuRotateCcw, LuFlag, LuX, LuRefreshCw, LuSiren, LuHospital, LuCloudOff, LuHistory, LuPill } from 'react-icons/lu';
import { COORDINATOR, DAY_LABEL, KIND, type Visit } from '../shared/data';
import { dur, hhmm, LATE_TOL, vetById, type Proposal, type Stop } from '../shared/engine';
import { useApp, type HandoffPriority } from '../store';
import { CityMap } from '../map';
import { Avatar, PatientBadge } from '../ui';
import { JournalScreen } from './Journal';
import { AssistantScreen } from './Assistant';
import { MicButton, VoiceBubble, VoiceRecorder } from './Voice';
import { HistoryOverlay } from './History';
import type { CustomerEta } from '../store';

type Tab = 'idag' | 'rutt' | 'inkorg';
type Screen = null | { t: 'visit'; id: string } | { t: 'invisit' } | { t: 'proposal' } | { t: 'journal'; id: string; back: Screen } | { t: 'assistant' };
type SheetT = null | 'delay' | 'extend' | 'finish' | 'handoff' | 'profile';
interface Draft { id: string; check: Record<string, boolean>; note: string; photos: string[]; treat: string[]; follow: boolean }

const TREATMENTS: Record<string, string[]> = {
  vaccination: ['Vaccination', 'Hälsokontroll', 'Vägning', 'Chipkontroll'],
  aptit: ['Klinisk undersökning', 'Blodprov', 'Vätska subkutant', 'Illamåendemedicin'],
  öron: ['Otoskopi', 'Öronrengöring', 'Cytologi', 'Örondroppar'],
  senior: ['Blodtryck', 'Blodprov', 'Urinprov', 'Vägning'],
  sår: ['Sårkontroll', 'Stygn borttagna', 'Omläggning', 'Smärtlindring'],
  hälta: ['Ortopedisk undersökning', 'Smärtlindring', 'Vilorekommendation'],
  blodprov: ['Blodprov', 'Vägning'],
  hud: ['Hudskrap', 'Tejpprov', 'Klådstillande', 'Foderråd'],
  andning: ['Syrgas', 'Pulsoximetri', 'Lugnande', 'Remiss'],
  tand: ['Munundersökning', 'Tandfilning', 'Vägning'],
  urin: ['Urinprov', 'Ultraljud', 'Smärtlindring'],
  'akut-mage': ['Klinisk undersökning', 'Dropp', 'Illamåendemedicin', 'Blodprov'],
  uppföljning: ['Stygn borttagna', 'Sårkontroll', 'Vägning'],
};

export function MobileApp() {
  const { s, plans, act, toast, offlineSince } = useApp();
  const w = s.world;
  const vetId = w.manualVet;
  const p = plans[vetId];
  const [tab, setTab] = useState<Tab>('idag');
  const [screen, setScreen] = useState<Screen>(null);
  const [sheet, setSheet] = useState<SheetT>(null);
  /** The visit just finished: the home screen offers "Diktera journal", then "Nästa besök". */
  const [after, setAfter] = useState<string | null>(null);
  /** Patient history from Provet, shown on top of the current screen (which keeps its place). */
  const [hist, setHist] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const unread = s.messages.filter((m) => m.vetId === vetId && m.from !== 'vet' && !m.read).length;
  const current = p.current;
  const upcoming = p.stops.filter((x) => x.state === 'kommande');
  const inVisit = current && current.state === 'pågår' ? current : null;
  const nextAfter = upcoming[0];
  const draftRef = useRef<Draft | null>(null);

  // Delay detection → calm bottom sheet
  useEffect(() => {
    if (!nextAfter || !inVisit) return;
    const acked = s.delayAck[nextAfter.id] ?? 0;
    if (nextAfter.delay >= 10 && nextAfter.delay - acked >= 8 && sheet !== 'delay') setSheet('delay');
  }, [nextAfter?.delay, inVisit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The delay was resolved elsewhere (e.g. the coordinator approved a new plan): close the sheet.
  useEffect(() => {
    if (sheet === 'delay' && (!nextAfter || !inVisit || nextAfter.delay < 5)) setSheet(null);
  }, [sheet, nextAfter?.delay, inVisit?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Journal signed, or the vet already moved on: the "just finished" step is done.
  useEffect(() => {
    if (!after) return;
    if (w.visits[after]?.journal?.state === 'signerad' || current) setAfter(null);
  }, [after, w.visits, current]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab, screen]);
  useEffect(() => { if (tab === 'inkorg') act.markReadVet(vetId); }, [tab, unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (t: Tab) => { setScreen(null); setTab(t); };

  let content: ReactNode;
  const openJournal = (id: string) => setScreen({ t: 'journal', id, back: screen });
  if (screen?.t === 'assistant') content = <AssistantScreen onBack={() => setScreen(null)} />;
  else if (screen?.t === 'journal') content = <JournalScreen key={screen.id} visitId={screen.id} onBack={() => setScreen(screen.back && (screen.back.t !== 'invisit' || inVisit) ? screen.back : null)} />;
  else if (screen?.t === 'visit') content = <VisitDetail id={screen.id} onBack={() => setScreen(null)} onInVisit={() => setScreen({ t: 'invisit' })} onJournal={openJournal} onHistory={setHist} />;
  else if (screen?.t === 'invisit' && inVisit) content = <InVisit key={inVisit.id} draftRef={draftRef} stop={inVisit} onBack={() => setScreen(null)} onExtend={() => setSheet('extend')} onFinish={() => setSheet('finish')} onJournal={openJournal} onHandoff={() => setSheet('handoff')} onHistory={setHist} />;
  else if (screen?.t === 'proposal') content = <ProposalScreen onBack={() => setScreen(null)} />;
  else if (tab === 'idag') content = <Today after={after} onNext={() => setAfter(null)} onOpen={(id) => setScreen({ t: 'visit', id })} onInVisit={() => setScreen({ t: 'invisit' })} onFinish={() => setSheet('finish')} onProposal={() => setScreen({ t: 'proposal' })} onMessages={() => go('inkorg')} onRoute={() => go('rutt')} onJournal={openJournal} onAsk={() => setScreen({ t: 'assistant' })} onProfile={() => setSheet('profile')} onHistory={setHist} />;
  else if (tab === 'rutt') content = <RouteTab onOpen={(id) => setScreen({ t: 'visit', id })} />;
  else content = <MobileMessages />;

  return (
    <div className="mapp">
      <div className="statusbar" aria-hidden="true">
        <span className="tnum">{hhmm(w.now)}</span>
        <span className="sb-icons"><LuSignal size={14} /><LuWifi size={14} /><LuBattery size={16} /></span>
      </div>
      {offlineSince != null && (
        <div className="offbar" role="status">
          <LuWifiOff size={15} />
          <span><b>Offline</b> · du kan fortfarande se nästa besök. Ändringar synkas när anslutningen är tillbaka.{s.outbox.length ? ` ${s.outbox.length} väntar.` : ''}</span>
        </div>
      )}
      <div className="mbody" ref={bodyRef}>{content}</div>
      {!screen && (
        <nav className="mtabs" aria-label="Appmeny">
          {([
            ['idag', <LuHouse size={22} />, 'Idag'],
            ['rutt', <LuRoute size={22} />, 'Rutt'],
            ['inkorg', <LuMessagesSquare size={22} />, 'Inkorg'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
              <span className="mt-ic">{icon}{id === 'inkorg' && unread > 0 && <i className="badge">{unread}</i>}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {hist && <HistoryOverlay visitId={hist} onClose={() => setHist(null)} />}
      {sheet === 'delay' && nextAfter && (
        <Sheet onClose={() => { act.ackDelay(nextAfter.id, nextAfter.delay); setSheet(null); }}>
          <div className="sheet-ic warn"><LuHourglass size={22} /></div>
          <h3>Du ligger ca {nextAfter.delay} min efter plan.</h3>
          <p className="muted">
            {w.visits[nextAfter.id].patient.name} har bokad tid {hhmm(w.visits[nextAfter.id].window.from)}–{hhmm(w.visits[nextAfter.id].window.to)}. Du är framme ca <b className="tnum">{hhmm(nextAfter.arrive)}</b>
            {nextAfter.late > LATE_TOL ? `, ${nextAfter.late} min för sent.` : ', fortfarande i tid.'} {COORDINATOR.first} ser din nya tid automatiskt.
          </p>
          <div className="sheet-actions">
            <button className="mbtn ghost" onClick={() => { act.ackDelay(nextAfter.id, nextAfter.delay); setSheet(null); toast('Du fortsätter enligt plan. Din nya tid är delad.', 'info'); }}>Fortsätt enligt plan</button>
            <button className="mbtn primary" onClick={() => { act.ackDelay(nextAfter.id, nextAfter.delay); setSheet(null); setScreen({ t: 'proposal' }); }}><LuSparkles size={17} />Se förslag</button>
          </div>
        </Sheet>
      )}
      {sheet === 'extend' && (
        <Sheet onClose={() => setSheet(null)}>
          <h3>Förläng besöket</h3>
          <p className="muted">Resten av dagen räknas om direkt.</p>
          <div className="ext-grid">
            {[10, 25, 45].map((m) => (
              <button key={m} className="mbtn ghost big" onClick={() => { act.extend(m); setSheet(null); toast(`Besöket förlängt ${m} min ✓ · ${COORDINATOR.first} ser din nya tid`); }}>+{m} min</button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'handoff' && inVisit && (
        <HandoffSheet v={w.visits[inVisit.id]} onClose={() => setSheet(null)} onSent={() => setSheet(null)} />
      )}
      {sheet === 'profile' && <ProfileSheet onClose={() => setSheet(null)} />}
      {sheet === 'finish' && inVisit && (
        <FinishSheet draft={draftRef.current} stop={inVisit} onClose={() => setSheet(null)} onDone={(extra) => {
          const id = inVisit.id;
          act.finish(extra);
          setSheet(null);
          setScreen(null);
          setTab('idag');
          setAfter(id);
        }} />
      )}
    </div>
  );
}

function SyncPill() {
  const { s, offlineSince } = useApp();
  const [busy, setBusy] = useState(false);
  const key = `${s.world.planVersion}|${s.messages.length}|${s.handoffs.map((h) => h.status).join()}|${Object.keys(s.world.visits).length}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setBusy(true);
    const id = setTimeout(() => setBusy(false), 1200);
    return () => clearTimeout(id);
  }, [key]);
  const st = offlineSince != null ? 'off' : busy ? 'busy' : 'ok';
  return (
    <span className={`syncpill ${st}`} role="status" aria-live="polite">
      {st === 'off' ? <LuCloudOff size={11} /> : st === 'busy' ? <LuRefreshCw size={11} className="spin-ic" /> : <LuCheck size={11} />}
      {st === 'off' ? 'Offline (demo)' : st === 'busy' ? 'Uppdaterar…' : 'Synkad'}
    </span>
  );
}

const HANDOFF_REASONS = ['Dropp och övervakning', 'Ultraljud', 'Röntgen', 'Operation'];
const PRIO: [HandoffPriority, string, string][] = [['akut', 'Nu', 'Så snart som möjligt'], ['idag', 'Idag', 'Idag'], ['planerad', 'Planerat', 'Kan planeras']];
function HandoffSheet({ v, onClose, onSent }: { v: Visit; onClose: () => void; onSent: () => void }) {
  const { act, toast } = useApp();
  const [priority, setPriority] = useState<HandoffPriority>('idag');
  const [reason, setReason] = useState(HANDOFF_REASONS[0]);
  const [note, setNote] = useState('');
  return (
    <Sheet onClose={onClose}>
      <h3>Fortsatt vård på klinik</h3>
      <p className="muted">{COORDINATOR.first} ordnar tid och meddelar ägaren. Journalen skriver du som vanligt.</p>
      <div className="ho-form">
        <span className="ho-lbl">När?</span>
        <div className="seg m3" role="radiogroup" aria-label="När">
          {PRIO.map(([k, l]) => (
            <button key={k} role="radio" aria-checked={priority === k} className={priority === k ? `on${k === 'akut' ? ' crit' : ''}` : ''} onClick={() => setPriority(k)}>{l}</button>
          ))}
        </div>
        <span className="ho-lbl">Kort anledning</span>
        <div className="tchips">
          {HANDOFF_REASONS.map((r) => <button key={r} className={`chipbtn${reason === r ? ' on' : ''}`} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <label className="sr-only" htmlFor="m-ho-note">Egen notering</label>
        <input id="m-ho-note" className="ho-input" maxLength={160} value={note} placeholder="Egen notering (valfritt)" onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="sheet-actions">
        <button className="mbtn ghost" onClick={onClose}>Avbryt</button>
        <button className="mbtn primary" data-demo="handoff-send" onClick={() => {
          const pref = PRIO.find((x) => x[0] === priority)![2];
          if (!act.requestHandoff({ reason: `Behöver ${reason.toLowerCase()}`, priority, pref, note })) return;
          toast(`Skickat till ${COORDINATOR.first} ✓ · Du får besked här när tiden är bokad`);
          onSent();
        }}><LuSend size={17} />Skicka</button>
      </div>
    </Sheet>
  );
}

/** Only what is not in the standard bag: "Ta med: Vaccin enligt bokning". */
const STANDARD_KIT = new Set(['Stetoskop', 'Termometer', 'Bärbar våg', 'Sprutor och kanyler', 'Blodprovsset', 'Sterila handskar', 'Akutväska', 'Chipläsare', 'Förband', 'Bandage', 'Pannlampa']);
const SPECIAL_NAME: Record<string, string> = { Dropp: 'Droppaggregat', Syrgas: 'Bärbar syrgas', Ultraljud: 'Bärbart ultraljud' };
export function takeAlong(v: Visit): string[] {
  const extra = KIND[v.kind].equipment.filter((e) => !STANDARD_KIT.has(e));
  return extra.slice(0, 3);
}

function Sheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <span className="grabber" />
        {children}
      </div>
    </div>
  );
}

/* ——————————————— Idag ——————————————— */
/* ——————————————— Idag ——————————————— */
interface TodayProps { onHistory: (id: string) => void; after: string | null; onNext: () => void; onOpen: (id: string) => void; onInVisit: () => void; onFinish: () => void; onProposal: () => void; onMessages: () => void; onRoute: () => void; onJournal: (id: string) => void; onAsk: () => void; onProfile: () => void }
function Today({ onHistory, after, onNext, onOpen, onInVisit, onFinish, onProposal, onMessages, onRoute, onJournal, onAsk, onProfile }: TodayProps) {
  const { s, plans, act, toast } = useApp();
  const w = s.world;
  const vetId = w.manualVet;
  const vet = vetById(vetId);
  const p = plans[vetId];
  const hour = Math.floor(w.now / 60);
  const greet = hour < 10 ? 'God morgon' : hour < 17 ? 'Hej' : 'God kväll';
  const focus = p.current ?? p.next;
  const lastNote = [...s.messages].reverse().find((m) => m.vetId === vetId && m.from !== 'vet' && !m.read);
  const later = p.stops.filter((x) => x.state === 'kommande' && x !== focus);
  const done = after ? w.visits[after] : null;
  const older = p.stops.filter((x) => x.state === 'klar' && x.id !== after && w.visits[x.id].journal?.state !== 'signerad');

  // One persistent primary action, always in the same place at the bottom.
  let cta: ReactNode = null;
  if (done) cta = <button className="mbtn primary xl" data-demo="m-journal" onClick={() => onJournal(done.id)}><LuMic size={20} />Diktera journal</button>;
  else if (focus) {
    if (focus.state === 'kommande') cta = <button className="mbtn primary xl" data-demo="m-nav" onClick={() => { act.startNav(); toast('På väg ✓ · kartappen öppnas (demo)'); }}><LuNavigation size={20} />Starta navigering</button>;
    else if (focus.state === 'påväg') cta = <button className="mbtn primary xl nav" data-demo="m-arrive" onClick={() => act.arrive()}><LuMapPin size={20} />Jag är framme</button>;
    else if (focus.state === 'framme') cta = <button className="mbtn primary xl" data-demo="m-start" onClick={() => { act.startVisit(); onInVisit(); }}><LuPlay size={20} />Starta besök</button>;
    else cta = <button className="mbtn primary xl" data-demo="m-finish" onClick={onFinish}><LuCircleCheck size={20} />Avsluta besök</button>;
  }

  return (
    <div className="mscreen today">
      <header className="mhead">
        <div>
          <span className="mdate"><LuCalendarDays size={13} />{DAY_LABEL}</span>
          <h1>{greet}, {vet.first}</h1>
          <span className="mhead-sub tnum">{p.done} av {p.total} klara · slutar ca {hhmm(p.endAt)}{p.delay > 5 && <em> · {p.delay} min efter</em>}<SyncPill /></span>
          <span className="mprog" aria-hidden="true">{p.stops.map((x) => <i key={x.id} className={x.state === 'klar' ? 'd' : x.state === 'kommande' ? (x.late > LATE_TOL ? 'l' : '') : 'n'} />)}</span>
        </div>
        <div className="mhead-act">
          <button className="ask-round" onClick={onAsk} aria-label="Fråga FieldVet med rösten" title="Fråga med rösten"><LuMic size={18} /></button>
          <button className="me-btn" onClick={onProfile} aria-label={`${vet.name}, profil och inställningar`}><Avatar vet={vet} size={38} /></button>
        </div>
      </header>

      {(() => {
        const fresh = p.stops.map((x) => ({ x, v: w.visits[x.id] })).find(({ v }) => v.isNew && v.priority === 'akut' && v.ack == null && v.status === 'planerad');
        if (!fresh) return null;
        return (
          <div className="mbanner urgent" role="alert">
            <span className="mb-ic"><LuSiren size={16} /></span>
            <span><b>Nytt akutbesök: {fresh.v.patient.name}</b><span>{fresh.v.address.area} · framme ca {hhmm(fresh.x.arrive)} · från {COORDINATOR.first}</span></span>
            <AckButton visitId={fresh.v.id} />
          </div>
        );
      })()}
      {s.request?.vetId === vetId && (
        <button className="mbanner pending" onClick={onProposal}>
          <span className="spin" aria-hidden="true" />
          <span><b>Väntar på {COORDINATOR.first}</b><span>Förslag: {s.request.proposal.title.toLowerCase()}</span></span>
          <LuChevronRight size={18} />
        </button>
      )}
      {lastNote && (
        <button className="mbanner" onClick={onMessages}>
          <span className="mb-ic"><LuMessageSquare size={16} /></span>
          <span><b>{lastNote.from === 'system' ? 'Uppdatering' : COORDINATOR.first}</b><span>{lastNote.text}</span></span>
          <LuChevronRight size={18} />
        </button>
      )}

      {done ? (
        <article className="nextcard donecard">
          <span className="cel-ic"><LuCheck size={26} /></span>
          <h2>{done.patient.name} är klart</h2>
          <p className="muted">Diktera journalen nu medan det är färskt, det tar ungefär en halv minut. Du kan också göra det senare.</p>
          {focus && <button className="later inline" data-demo="m-next" onClick={onNext}><span><b>Nästa besök: {w.visits[focus.id].patient.name}</b><span>{w.visits[focus.id].address.area} · {focus.departAt > w.now ? `åk senast ${hhmm(focus.departAt)}` : `framme ca ${hhmm(focus.arrive)}`}</span></span><LuChevronRight size={18} /></button>}
        </article>
      ) : focus ? <NextCard stop={focus} onOpen={onOpen} onInVisit={onInVisit} onHistory={onHistory} /> : (
        <div className="nextcard donecard">
          <span className="cel-ic"><LuCircleCheck size={26} /></span>
          <h2>Dagen är klar</h2>
          <p className="muted">Tack för idag!</p>
          <div className="day-stats">
            <span><b className="tnum">{p.done}</b>besök</span>
            <span><b className="tnum">{Math.round(p.km)}</b>km</span>
            <span><b className="tnum">{p.stops.filter((x) => w.visits[x.id].journal?.state === 'signerad').length}/{p.done}</b>journaler</span>
          </div>
        </div>
      )}

      {older.length > 0 && !done && (
        <button className="mbanner journal" onClick={() => onJournal(older[0].id)}>
          <span className="mb-ic"><LuMic size={16} /></span>
          <span><b>{older.length === 1 ? 'Journal att signera' : `${older.length} journaler att signera`}</b><span>{w.visits[older[0].id].patient.name} · när det passar</span></span>
          <LuChevronRight size={18} />
        </button>
      )}
      {later.length > 0 && (
        <button className="later" onClick={onRoute}>
          <span><b>Senare idag · {later.length} besök</b><span className="tnum">{later.slice(0, 2).map((x) => `${w.visits[x.id].patient.name} ${hhmm(x.arrive)}`).join(' · ')}{later.length > 2 ? ` · +${later.length - 2}` : ''}</span></span>
          <LuChevronRight size={18} />
        </button>
      )}
      {cta && <div className="mcta">{cta}{done && focus && <button className="mbtn ghost xl" onClick={onNext}>Nästa besök</button>}</div>}
    </div>
  );
}

function AckButton({ visitId }: { visitId: string }) {
  const { act, toast } = useApp();
  return <button className="mbtn primary sm" data-demo="ack-urgent" onClick={() => { act.ackVisit(visitId); toast(`Bekräftat. ${COORDINATOR.first} ser att du har tagit besöket.`); }}><LuCheck size={15} />Uppfattat</button>;
}

function Removed() {
  const { s } = useApp();
  const vetId = s.world.manualVet;
  const gone = Object.values(s.world.visits).filter((v) => (v.movedFrom === vetId && v.vetId !== vetId) || (v.status === 'avbokad' && v.vetId === vetId));
  return (
    <>
      {gone.map((v) => (
        <li key={v.id} className="mstop gone">
          <span className="ms-time tnum">{hhmm(v.window.from)}</span>
          <span className="ms-body"><b>{v.patient.name}</b><span className="muted">{v.status === 'avbokad' ? 'Avbokad av ägaren' : `Flyttad till ${vetById(v.vetId).first}`}</span></span>
        </li>
      ))}
    </>
  );
}


function NextCard({ stop, onOpen, onInVisit, onHistory }: { stop: Stop; onOpen: (id: string) => void; onInVisit: () => void; onHistory: (id: string) => void }) {
  const { s, plans, toast } = useApp();
  const w = s.world;
  const v = w.visits[stop.id];
  const vp = plans[w.manualVet];
  const code = v.access.find((a) => /kod/i.test(a));
  const parking = v.access.find((a) => /park|gård|garage|infart/i.test(a));
  const take = takeAlong(v);
  const needs = (KIND[v.kind].needs ?? []).map((n) => SPECIAL_NAME[n] ?? n);
  const eyebrow = stop.state === 'påväg' ? 'På väg till' : stop.state === 'framme' ? 'Du är framme' : stop.state === 'pågår' ? 'Pågår' : 'Nästa besök';
  const late = stop.late > LATE_TOL;
  const eta = s.eta[v.id];
  const leaveNow = stop.state === 'kommande' && stop.departAt <= w.now;

  return (
    <article className={`nextcard st-${stop.state}${v.priority === 'akut' ? ' akut' : ''}`}>
      <div className="nc-top">
        <span className="nc-eyebrow">{eyebrow}</span>
        {v.priority === 'akut' && <span className="tag t-akut"><LuSiren size={11} />Akut</span>}
      </div>
      <button className="nc-patient" onClick={() => onOpen(v.id)} aria-label={`${v.patient.name}, visa mer`}>
        <PatientBadge v={v} size={52} />
        <span>
          <b>{v.patient.name}</b>
          <span>{[v.patient.breed || v.patient.species, KIND[v.kind].label.toLowerCase()].filter(Boolean).join(' · ')}</span>
        </span>
        <LuChevronRight size={20} className="muted" />
      </button>
      <p className="nc-place"><LuMapPin size={15} /><span><b>{v.address.area}</b> · {v.address.street}</span></p>
      {(v.isNew || (v.movedFrom && v.movedFrom !== v.vetId) || v.timeChangedFrom != null) && stop.state === 'kommande' && (
        <p className="nc-updated"><LuRefreshCw size={13} />Ändrat av {COORDINATOR.first}{v.movedFrom && v.movedFrom !== v.vetId ? ` · flyttat från ${vetById(v.movedFrom).first}` : v.isNew ? ' · nytt besök' : v.timeChangedFrom != null ? ` · ny tid, var ${hhmm(v.timeChangedFrom)}` : ''}</p>
      )}

      {stop.state === 'kommande' && (
        <div className="nc-times">
          <div className={`big${leaveNow ? ' now' : ''}`}><span>Åk senast</span><b className="tnum">{leaveNow ? 'Nu' : hhmm(stop.departAt)}</b><em>{stop.drive} min dit</em></div>
          <div><span>Framme ca</span><b className={`tnum${late ? ' warn-t' : ''}`}>{hhmm(stop.arrive)}</b><em className={late ? 'late' : ''}>{late ? `${stop.late} min sen` : 'i tid'}</em></div>
          <div><span>Bokad tid</span><b className="tnum">{hhmm(v.window.from)}</b><em className="tnum">till {hhmm(v.window.to)}</em></div>
        </div>
      )}
      {stop.state === 'påväg' && (
        <div className="nc-times two">
          <div className="big"><span>Framme ca</span><b className={`tnum${late ? ' warn-t' : ''}`}>{hhmm(stop.arrive)}</b><em className={late ? 'late' : ''}>{late ? `${stop.late} min sen` : 'i tid'}</em></div>
          <div><span>Bokad tid</span><b className="tnum">{hhmm(v.window.from)}–{hhmm(v.window.to)}</b></div>
        </div>
      )}
      {stop.state === 'framme' && (code || v.access[0]) && (
        <div className="nc-code"><LuKeyRound size={18} /><span>{code ?? v.access[0]}</span></div>
      )}
      {stop.state === 'pågår' && (
        <div className="nc-times">
          <div><span>Startade</span><b className="tnum">{hhmm(stop.start)}</b></div>
          <div className="big"><span>Klart ca</span><b className="tnum">{hhmm(stop.end)}</b></div>
          <div><span>Förlängt</span><b className="tnum">{v.extension ? `+${v.extension} min` : '–'}</b></div>
        </div>
      )}

      {stop.state === 'påväg' && (code || parking || v.flags.allergy) && (
        <ul className="nc-crit drive">
          {v.flags.allergy && <li className="crit"><LuTriangleAlert size={14} />Allergi: {v.flags.allergy}</li>}
          {code && <li className="code"><LuKeyRound size={14} />{code}</li>}
          {parking && <li><LuInfo size={14} />{parking}</li>}
        </ul>
      )}
      {stop.state === 'kommande' && (
        <ul className="nc-crit">
          {v.flags.allergy && <li className="crit"><LuTriangleAlert size={14} />Allergi: {v.flags.allergy}</li>}
          {v.flags.warning && <li className="warn"><LuTriangleAlert size={14} />{v.flags.warning}</li>}
          {v.flags.medication && v.flags.medication !== 'Ingen' && <li><LuPill size={14} />{v.flags.medication}</li>}
          {(take.length > 0 || needs.length > 0) && <li><LuPackage size={14} />Ta med: {[...needs, ...take].join(', ')}</li>}
          {parking && <li><LuInfo size={14} />{parking}</li>}
        </ul>
      )}
      {(stop.state === 'kommande' || stop.state === 'påväg') && eta && eta.kind !== 'klinik' && <CommLine eta={eta} owner={v.owner.first} />}
      {stop.state === 'påväg' && (
        <div className="nc-map">
          <CityMap routes={[{ vetId: vp.vet.id, color: vp.vet.color, plan: { ...vp, stops: vp.stops.filter((x) => x.id === stop.id) } }]} visits={w.visits} focus={[stop.from, v.loc]} focusKey={stop.id} compact controls={false} padPx={24} />
        </div>
      )}
      <div className="nc-sec">
        <button className="mbtn ghost" onClick={() => toast(`Samtal till ${v.owner.first} öppnas i telefonen (demo)`, 'info')}><LuPhone size={17} />Ring {v.owner.first}</button>
        {stop.state === 'pågår'
          ? <button className="mbtn ghost" data-demo="m-continue" onClick={onInVisit}><LuStethoscope size={17} />Öppna besöket</button>
          : <button className="mbtn ghost" data-demo="m-history" onClick={() => onHistory(v.id)}><LuHistory size={17} />Visa historik</button>}
      </div>
    </article>
  );
}

/** What the owner has been told. Calm confirmation, no messaging controls: Provet sends, the coordinator handles failures. */
function CommLine({ eta, owner }: { eta: CustomerEta; owner: string }) {
  const win = `${hhmm(eta.from)}–${hhmm(eta.to)}`;
  const updated = eta.type === 'ETA_UPDATED' || eta.type === 'VETERINARIAN_DELAYED' || eta.type === 'ARRIVAL_WINDOW_UPDATED';
  if (eta.state === 'pending') return <p className="nc-sent pending" data-demo="m-comm" role="status"><span className="spin" aria-hidden="true" /><span>Skickar {updated ? 'ny tid' : 'ankomsttid'} till {owner}…</span></p>;
  if (eta.state === 'failed') return <p className="nc-sent failed" data-demo="m-comm" role="status"><LuInfo size={14} /><span>Kundmeddelandet kunde inte skickas. {COORDINATOR.first} har fått information.</span></p>;
  if (eta.state === 'blocked') return <p className="nc-sent failed" data-demo="m-comm" role="status"><LuInfo size={14} /><span>{owner} tar inte emot sms enligt Provet. {COORDINATOR.first} ringer vid behov.</span></p>;
  return (
    <p className="nc-sent" data-demo="m-comm" role="status"><LuCheck size={14} />
      <span>{eta.via === 'telefon' ? `${owner} informerad per telefon` : updated ? `Ny ankomsttid skickad ✓ · ${win}` : `${owner} informerad via Provet ✓ · ${win}`}</span>
    </p>
  );
}

/* ——————————————— Visit detail ——————————————— */
function VisitDetail({ id, onBack, onInVisit, onJournal, onHistory }: { id: string; onBack: () => void; onInVisit: () => void; onJournal: (id: string) => void; onHistory: (id: string) => void }) {
  const { s, plans, act, toast } = useApp();
  const w = s.world;
  const v = w.visits[id];
  const p = plans[w.manualVet];
  const st = p.stops.find((x) => x.id === id);
  const isFocus = st && (p.current?.id === id || (!p.current && p.next?.id === id));
  const steps = ['Planerat', 'På väg', 'Framme', 'Pågår', 'Klart'];
  const idx = !st ? -1 : st.state === 'kommande' ? 0 : st.state === 'påväg' ? 1 : st.state === 'framme' ? 2 : st.state === 'pågår' ? 3 : 4;
  const take = takeAlong(v);
  const needs = (KIND[v.kind].needs ?? []).map((n) => SPECIAL_NAME[n] ?? n);

  let cta: ReactNode = null;
  if (isFocus && st) {
    if (st.state === 'kommande') cta = <button className="mbtn primary xl" onClick={() => { act.startNav(); toast('På väg ✓ · kartappen öppnas (demo)'); onBack(); }}><LuNavigation size={20} />Starta navigering</button>;
    else if (st.state === 'påväg') cta = <button className="mbtn primary xl nav" onClick={() => act.arrive()}><LuMapPin size={20} />Jag är framme</button>;
    else if (st.state === 'framme') cta = <button className="mbtn primary xl" onClick={() => { act.startVisit(); onInVisit(); }}><LuPlay size={20} />Starta besök</button>;
    else if (st.state === 'pågår') cta = <button className="mbtn primary xl" onClick={onInVisit}><LuStethoscope size={20} />Öppna besöket</button>;
  }
  if (st?.state === 'klar') cta = v.journal?.state === 'signerad'
    ? <button className="mbtn ghost xl" onClick={() => onJournal(v.id)}><LuCircleCheck size={20} />Visa signerad journal</button>
    : <button className="mbtn primary xl" onClick={() => onJournal(v.id)}><LuMic size={20} />{v.journal ? 'Fortsätt med journalen' : 'Diktera journal'}</button>;

  return (
    <div className="mscreen detail">
      <div className="mtop">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={20} /></button>
        <span>Besök</span>
        <span className="tnum muted">Bokad {hhmm(v.window.from)}</span>
      </div>
      <div className="dhero">
        <PatientBadge v={v} size={60} />
        <div>
          <h1>{v.patient.name}</h1>
          <span>{[v.patient.breed || v.patient.species, v.patient.age, v.patient.weight].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {st && (
        <ol className="stepper five" aria-label="Status">
          {steps.map((label, i) => <li key={label} className={i < idx ? 'done' : i === idx ? 'now' : ''}><i>{i < idx ? <LuCheck size={12} /> : i + 1}</i>{label}</li>)}
        </ol>
      )}
      <section className="mcard">
        <h3><LuFileText size={15} />Anledning</h3>
        <p className="lead">{v.reason}</p>
      </section>
      {(v.flags.allergy || v.flags.warning || (v.flags.medication && v.flags.medication !== 'Ingen')) && (
        <section className="mcard">
          <h3><LuTriangleAlert size={15} />Viktigt inför besöket</h3>
          <ul className="facts">
            {v.flags.allergy && <li className="crit"><b>Allergi</b>{v.flags.allergy}</li>}
            {v.flags.warning && <li className="warn"><b>Obs</b>{v.flags.warning}</li>}
            {v.flags.medication && v.flags.medication !== 'Ingen' && <li><b>Medicin</b>{v.flags.medication}</li>}
          </ul>
        </section>
      )}
      <button className="mcard hist-open" data-demo="m-history" onClick={() => onHistory(v.id)}>
        <LuHistory size={18} />
        <span><b>Visa historik</b><span className="muted">Tidigare besök, diagnoser och läkemedel från Provet</span></span>
        <LuChevronRight size={18} className="muted" />
      </button>
      <section className="mcard">
        <h3><LuKeyRound size={15} />Åtkomst</h3>
        <p><b>{v.address.street}</b>, {v.address.area}</p>
        <ul className="access">
          {v.access.map((a) => <li key={a}>{/kod/i.test(a) ? <LuKeyRound size={15} /> : <LuInfo size={15} />}<span className={/kod/i.test(a) ? 'code' : ''}>{a}</span></li>)}
        </ul>
      </section>
      <section className="mcard">
        <h3><LuPackage size={15} />Ta med</h3>
        <p>{take.length > 0 || needs.length > 0 ? [...needs, ...take].join(', ') : 'Standardväskan räcker.'}</p>
        <p className="muted small">{KIND[v.kind].label} · {v.duration + v.extension} min · standardväska: {KIND[v.kind].equipment.join(', ').toLowerCase()}</p>
      </section>
      <section className="mcard">
        <h3><LuUser size={15} />Ägare</h3>
        <div className="owner-m">
          <div><b>{v.owner.first} {v.owner.last}</b><span className="muted tnum">{v.owner.phone}</span></div>
          <button className="mbtn ghost sm" onClick={() => toast(`Samtal till ${v.owner.first} öppnas i telefonen (demo)`, 'info')}><LuPhone size={16} />Ring</button>
        </div>
      </section>
      {cta && <div className="mcta">{cta}</div>}
    </div>
  );
}

/* ——————————————— During visit ——————————————— */
function InVisit({ stop, onBack, onExtend, onFinish, draftRef, onJournal, onHandoff, onHistory }: { stop: Stop; onBack: () => void; onExtend: () => void; onFinish: () => void; draftRef: { current: Draft | null }; onJournal: (id: string) => void; onHandoff: () => void; onHistory: (id: string) => void }) {
  const { s } = useApp();
  const v = s.world.visits[stop.id];
  const ho = s.handoffs.find((h) => h.visitId === stop.id);
  const planned = v.duration + v.extension;
  const prev = draftRef.current?.id === stop.id ? draftRef.current : null;
  const [check, setCheck] = useState<Record<string, boolean>>(prev?.check ?? {});
  const [note] = useState(prev?.note ?? '');
  const [photos, setPhotos] = useState<string[]>(prev?.photos ?? []);
  const [treat, setTreat] = useState<string[]>(prev?.treat ?? []);
  const [follow, setFollow] = useState(!!prev?.follow);
  const [notes, setNotes] = useState(false);
  draftRef.current = { id: stop.id, check, note, photos, treat, follow };

  const items = ['Anamnes och ägarens oro', 'Klinisk undersökning', 'Behandling eller provtagning', 'Råd och fortsatt plan'];
  const progress = Math.min(1, (s.world.now - stop.start) / planned);

  return (
    <div className="mscreen invisit">
      <div className="mtop">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={20} /></button>
        <span>Besöket pågår</span>
        <SyncPill />
      </div>
      <div className="iv-head">
        <PatientBadge v={v} size={44} />
        <div><b>{v.patient.name}</b><span className="muted">{KIND[v.kind].label} · {v.owner.first}</span></div>
        <button className="mbtn ghost sm" data-demo="m-history" onClick={() => onHistory(v.id)}><LuHistory size={15} />Visa historik</button>
      </div>
      <section className={`iv-timer${v.extension ? ' ext' : ''}`}>
        <div className="row between">
          <span><LuTimer size={16} />Startade <b className="tnum">{hhmm(stop.start)}</b></span>
          <span>Klart ca <b className="tnum">{hhmm(stop.end)}</b></span>
        </div>
        <div className="ivbar"><i style={{ width: `${Math.max(4, progress * 100)}%` }} /></div>
        <div className="row between">
          <span className="muted tnum">{planned} min planerat{v.extension ? ` (+${v.extension})` : ''}</span>
          <button className="mbtn ghost sm" onClick={onExtend}><LuPlus size={15} />Förläng</button>
        </div>
      </section>
      <section className="mcard jr-entry">
        {v.journal?.state === 'signerad' ? (
          <button className="jr-entry-done" onClick={() => onJournal(v.id)}><LuCircleCheck size={18} />Journal signerad {hhmm(v.journal.signedAt ?? s.world.now)} · visa</button>
        ) : (
          <button className="jr-entry-btn" onClick={() => onJournal(v.id)}>
            <span className="jr-entry-mic"><LuMic size={24} /></span>
            <span><b>{v.journal ? 'Fortsätt med journalen' : 'Diktera journal'}</b><span>Prata in, du får ett utkast att granska och signera.</span></span>
          </button>
        )}
      </section>
      {ho ? (
        <section className={`mcard ho-status ${ho.status}`} role="status">
          {ho.status === 'ny' ? <span className="spin" aria-hidden="true" /> : <LuHospital size={18} />}
          <div>
            <b>{ho.status === 'ny' ? `Skickat till ${COORDINATOR.first} ${hhmm(ho.at)}` : ho.status === 'avvaktar' ? `${COORDINATOR.first} ringer ägaren först` : ho.outcome?.kind === 'akut' ? 'Kliniken förbereder akut mottagning' : `Kliniken tar emot ${ho.outcome?.label ?? ''}`}</b>
            <span className="muted">{ho.status === 'ny' ? `${ho.reason} · väntar på svar` : 'Ägaren har fått besked. Avsluta hembesöket när du är klar.'}</span>
          </div>
        </section>
      ) : (
        <button className="mbtn ghost ho-btn" data-demo="m-handoff" onClick={onHandoff}><LuHospital size={17} />Fortsatt vård på klinik</button>
      )}
      <button className="link m-more" onClick={() => setNotes(!notes)} aria-expanded={notes}>{notes ? 'Dölj anteckningar' : 'Anteckningar, bilder och uppföljning (valfritt)'}</button>
      {notes && (
        <>
          <section className="mcard">
            <h3><LuStethoscope size={15} />Utfört</h3>
            <div className="tchips">
              {(TREATMENTS[v.kind] ?? []).concat(['Receptförskrivning']).map((t) => (
                <button key={t} className={`chipbtn${treat.includes(t) ? ' on' : ''}`} onClick={() => setTreat(treat.includes(t) ? treat.filter((x) => x !== t) : [...treat, t])} aria-pressed={treat.includes(t)}>
                  {treat.includes(t) && <LuCheck size={13} />}{t}
                </button>
              ))}
            </div>
          </section>
          <section className="mcard">
            <h3><LuListChecks size={15} />Egen checklista</h3>
            <ul className="checklist">
              {items.map((it) => (
                <li key={it}><button className={check[it] ? 'on' : ''} onClick={() => setCheck({ ...check, [it]: !check[it] })} aria-pressed={!!check[it]}><i>{check[it] && <LuCheck size={14} />}</i>{it}</button></li>
              ))}
            </ul>
          </section>
          <section className="mcard">
            <h3><LuCamera size={15} />Bilder</h3>
            <div className="photos">
              {photos.map((src, i) => <img key={i} src={src} alt={`Bild ${i + 1}`} />)}
              {photos.length === 0 && (
                <button className="photo-demo" onClick={() => setPhotos([demoPhoto(v)])} aria-label="Lägg till exempelbild"><LuCamera size={20} /><span>Exempelbild</span></button>
              )}
              <label className="photo-add"><LuPlus size={20} /><span>Lägg till</span><input id="m-photo" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhotos([...photos, URL.createObjectURL(f)]); }} /></label>
            </div>
          </section>
          <section className="mcard toggle-row">
            <div><b><LuFlag size={15} />Behöver uppföljning</b><span className="muted">{COORDINATOR.first} bokar ett nytt besök</span></div>
            <button className={`switch${follow ? ' on' : ''}`} role="switch" aria-checked={follow} onClick={() => setFollow(!follow)} aria-label="Behöver uppföljning"><i /></button>
          </section>
        </>
      )}
      <div className="mcta"><button className="mbtn primary xl" data-demo="m-finish" onClick={onFinish}><LuCircleCheck size={20} />Avsluta besök</button></div>
    </div>
  );
}


function demoPhoto(v: Visit) {
  const hue = v.patient.species === 'Katt' ? 30 : v.patient.species === 'Kanin' ? 90 : 200;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},35%,78%)'/><stop offset='1' stop-color='hsl(${hue + 30},30%,58%)'/></linearGradient></defs><rect width='200' height='200' fill='url(#g)'/><circle cx='100' cy='110' r='46' fill='hsla(${hue},30%,96%,.55)'/><text x='100' y='188' font-family='sans-serif' font-size='14' text-anchor='middle' fill='white'>${v.patient.name} · exempel</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function FinishSheet({ stop, onClose, onDone, draft: d }: { stop: Stop; onClose: () => void; onDone: (extra: Partial<Visit>) => void; draft: Draft | null }) {
  const { s, plans } = useApp();
  const v = s.world.visits[stop.id];
  const next = plans[s.world.manualVet].stops.find((x) => x.state === 'kommande');
  return (
    <Sheet onClose={onClose}>
      <h3>Avsluta besöket hos {v.patient.name}?</h3>
      <ul className="finish-sum">
        <li><LuClock size={16} />{v.duration + v.extension} min, klart {hhmm(Math.max(s.world.now, stop.end))}</li>
        <li><LuStethoscope size={16} />{d?.treat.length ? d.treat.join(', ') : 'Inga åtgärder valda'}</li>
        <li><LuFileText size={16} />{v.journal?.state === 'signerad' ? 'Journal signerad' : v.journal ? 'Journalutkast sparat, signera efter besöket' : 'Journal dikteras efter besöket'}{d?.photos.length ? ` · ${d.photos.length} bild` : ''}</li>
        {d?.follow && <li><LuFlag size={16} />Uppföljning begärd</li>}
        {(() => { const ho = s.handoffs.find((h) => h.visitId === stop.id && h.status === 'bekraftad'); return ho ? <li><LuHospital size={16} />Fortsätter på kliniken {ho.outcome?.label}</li> : null; })()}
      </ul>
      {next && <p className="muted">Nästa: <b>{s.world.visits[next.id].patient.name}</b>, {s.world.visits[next.id].address.area}. Rutten räknas om direkt.</p>}
      <div className="sheet-actions">
        <button className="mbtn ghost" onClick={onClose}>Inte än</button>
        <button className="mbtn primary" onClick={() => onDone({ note: d?.note, photos: d?.photos, treatments: d?.treat, followUp: d?.follow, checklist: d?.check })}><LuCheck size={18} />Avsluta besök</button>
      </div>
    </Sheet>
  );
}

/* ——————————————— Optimised route proposal (vet side) ——————————————— */
function ProposalScreen({ onBack }: { onBack: () => void }) {
  const { s, plans, act, server, offlineSince } = useApp();
  const w = s.world;
  const vetId = w.manualVet;
  const p = plans[vetId];
  const pending = s.request?.vetId === vetId ? s.request : null;
  // Computed server-side on the full plan (colleagues' capacity); unavailable while offline.
  const proposal = useMemo<Proposal | null>(() => (pending ? pending.proposal : server.vetProposal()), [pending?.id, offlineSince]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = useMemo(() => (proposal ? server.previewPlans(proposal) : null), [proposal]); // eslint-disable-line react-hooks/exhaustive-deps
  const approved = !pending && s.history.length > 0 && proposal && s.history[0] === proposal.title;

  return (
    <div className="mscreen proposal">
      <div className="mtop">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={20} /></button>
        <span>Optimerad rutt</span>
        <span />
      </div>
      {!proposal && offlineSince != null ? (
        <div className="mcard calm-m offline"><LuWifiOff size={20} /><div><b>Kräver täckning</b><span className="muted">Nya förslag räknas fram mot hela teamets plan. Fortsätt enligt plan så länge, dina statusändringar sparas i telefonen.</span></div></div>
      ) : !proposal || !after ? (
        <div className="mcard calm-m"><LuCircleCheck size={20} /><div><b>Din rutt är redan optimal</b><span className="muted">Fortsätt enligt plan. Samordnaren ser din ETA.</span></div></div>
      ) : (
        <>
          <div className="prop-head">
            <span className="sheet-ic"><LuSparkles size={20} /></span>
            <div><h2>{proposal.title}</h2><p className="muted">{proposal.why}</p></div>
          </div>
          <div className="prop-map">
            <CityMap
              routes={[{ vetId, color: vetById(vetId).color, plan: plans[vetId], ghost: true }, { vetId, color: vetById(vetId).color, plan: after[vetId] }]}
              visits={w.visits}
              focus={[p.pos, ...p.stops.filter((x) => x.state !== 'klar').map((x) => w.visits[x.id].loc)]}
              focusKey="prop"
              compact
              controls={false}
              padPx={24}
            />
          </div>
          <ol className="mstops">
            {after[vetId].stops.filter((x) => x.state !== 'klar').map((st) => {
              const b = p.stops.find((y) => y.id === st.id);
              const v = w.visits[st.id];
              if (!v) return null;
              return (
                <li key={st.id} className={`mstop st-${st.state}`}>
                  <button>
                    <span className="ms-time tnum">{hhmm(st.arrive)}</span>
                    <span className="ms-body"><b>{v.patient.name}</b><span className="muted">{v.address.area}{b && Math.abs(b.arrive - st.arrive) >= 5 ? ` · var ${hhmm(b.arrive)}` : ''}</span></span>
                    <span className="ms-tags">{b && b.late > LATE_TOL && st.late <= LATE_TOL && <span className="tag t-ok">I tid</span>}</span>
                  </button>
                </li>
              );
            })}
            {p.stops.filter((x) => x.state === 'kommande' && !after[vetId].stops.some((y) => y.id === x.id)).map((x) => (
              <li key={x.id} className="mstop gone">
                <span className="ms-time tnum">{hhmm(x.arrive)}</span>
                <span className="ms-body"><b>{w.visits[x.id].patient.name}</b><span className="muted">Tas över av {vetById(proposal.reassign[x.id] ?? vetId).first}</span></span>
              </li>
            ))}
          </ol>
          <div className="mcta">
            {pending ? (
              <div className="waiting"><span className="spin" /><div><b>Skickat till {COORDINATOR.first}</b><span className="muted">Du får besked här så fort förslaget är godkänt.</span></div></div>
            ) : approved ? (
              <div className="waiting ok"><LuCircleCheck size={20} /><div><b>Godkänt</b><span className="muted">Din rutt är uppdaterad.</span></div></div>
            ) : (
              <button className="mbtn primary xl" onClick={() => act.requestProposal(proposal, proposal.changes[0]?.visitId)}><LuSend size={19} />Skicka till samordnaren</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ——————————————— Rutt ——————————————— */
function RouteTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { s, plans } = useApp();
  const w = s.world;
  const p = plans[w.manualVet];
  const left = p.stops.filter((x) => x.state !== 'klar');
  const driveLeft = left.reduce((a, x) => a + (x.state === 'kommande' ? x.drive : 0), 0);
  const kmLeft = left.reduce((a, x) => a + (x.state === 'kommande' ? x.km : 0), 0);
  const nextDep = p.stops.find((x) => x.state === 'kommande');
  return (
    <div className="mscreen route">
      <header className="mhead"><div><span className="mdate">{DAY_LABEL}</span><h1>Rutt</h1></div></header>
      <div className="rmap">
        <CityMap
          routes={[{ vetId: p.vet.id, color: p.vet.color, plan: p }]}
          visits={w.visits}
          focus={[p.pos, ...left.map((x) => w.visits[x.id].loc)]}
          focusKey={left.map((x) => x.id).join()}
          compact
          controls={false}
          padPx={30}
        />
      </div>
      <div className="rstats">
        <div><span className="muted">Körtid kvar</span><b className="tnum">{dur(driveLeft)}</b></div>
        <div><span className="muted">Sträcka</span><b className="tnum">{kmLeft.toFixed(1).replace('.', ',')} km</b></div>
        <div><span className="muted">Klar ca</span><b className="tnum">{hhmm(p.endAt)}</b></div>
      </div>
      {nextDep && (
        <div className="rnext">
          <LuCar size={18} />
          <span>Nästa avfärd <b className="tnum">{hhmm(Math.max(w.now, nextDep.departAt))}</b> mot {w.visits[nextDep.id].patient.name}, {w.visits[nextDep.id].address.area}</span>
        </div>
      )}
      <ol className="rlist">
        {p.stops.map((st, i) => {
          const v = w.visits[st.id];
          return (
            <li key={st.id} className={`rstop st-${st.state}`}>
              {st.drive > 0 && st.state !== 'klar' && <span className="rleg"><LuCar size={12} />{st.drive} min</span>}
              <button onClick={() => onOpen(st.id)}>
                <span className="rnum" style={{ ['--vc' as string]: p.vet.color }}>{st.state === 'klar' ? <LuCheck size={13} /> : i + 1}</span>
                <span className="ms-body"><b>{v.patient.name}</b><span className="muted">{v.address.street}, {v.address.area}</span></span>
                <span className="rtime tnum">{hhmm(st.arrive)}</span>
              </button>
              <span className="ms-tags">
                {v.isNew && <span className="tag t-new">Ny</span>}
                {v.movedFrom && <span className="tag t-moved">Flyttad hit</span>}
                {v.timeChangedFrom != null && st.state !== 'klar' && <span className="tag t-time">Ny tid, var {hhmm(v.timeChangedFrom)}</span>}
                {st.late > LATE_TOL && st.state !== 'klar' && <span className="tag t-late">{st.late} min sent</span>}
              </span>
            </li>
          );
        })}
        <Removed />
      </ol>
    </div>
  );
}

/* ——————————————— Meddelanden ——————————————— */
function MobileMessages() {
  const { s, act } = useApp();
  const vetId = s.world.manualVet;
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const thread = s.messages.filter((m) => m.vetId === vetId);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread.length]);
  const send = (t: string) => { if (!t.trim()) return; act.send(vetId, 'vet', t.trim()); setText(''); };
  return (
    <div className="mscreen mmsg">
      <header className="mhead"><div><span className="mdate">{COORDINATOR.role}</span><h1>{COORDINATOR.name}</h1></div></header>
      <div className="chat-body m">
        {thread.map((m) => m.voice ? <VoiceBubble key={m.id} m={m} mine={m.from === 'vet'} /> : (
          <div key={m.id} className={`bubble ${m.from === 'vet' ? 'me' : m.from === 'system' ? 'sys' : 'them'}${m.pending ? ' pending' : ''}`}>
            <span>{m.text}</span>
            <time className="tnum">{m.pending ? 'Väntar på täckning' : hhmm(m.at)}</time>
          </div>
        ))}
        <div ref={end} />
      </div>
      {recording && <VoiceRecorder onClose={() => setRecording(false)} />}
      <div className="quick m">
        {['Försenad ca 10 min', 'Ring mig', 'Uppfattat'].map((q) => <button key={q} className="chipbtn" onClick={() => send(q)}>{q}</button>)}
      </div>
      <form className="composer m" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input id="m-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv till samordnaren" aria-label="Meddelande" />
        {text.trim() ? <button className="roundbtn primary" type="submit" aria-label="Skicka"><LuSend size={18} /></button> : <MicButton onClick={() => setRecording(true)} />}
      </form>
    </div>
  );
}

/* ——————————————— Mer ——————————————— */
/* ——————————————— Profil (bakom avataren) ——————————————— */
function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { s, act, toast } = useApp();
  const vet = vetById(s.world.manualVet);
  return (
    <Sheet onClose={onClose}>
      <div className="prof-head"><Avatar vet={vet} size={44} /><div><h3>{vet.name}</h3><span className="muted">Veterinär · {vet.car}</span></div></div>
      <ul className="kv">
        <li><span>Arbetstid</span><b className="tnum">{hhmm(vet.shift.start)}–{hhmm(vet.shift.end)}</b></li>
        <li><span>Samordnare</span><b>{COORDINATOR.name}</b></li>
        <li><span>Extra i bilen</span><b>{vet.special.map((x) => SPECIAL_NAME[x] ?? x).join(', ')}</b></li>
      </ul>
      <p className="muted small">Fiktiv demodata. Din position delas bara med samordnaren under arbetstid.</p>
      <div className="sheet-actions">
        <button className="mbtn ghost" onClick={() => { act.reset(); toast('Demon är återställd till 08:20', 'info'); onClose(); }}><LuRotateCcw size={17} />Återställ demo</button>
        <button className="mbtn primary" onClick={onClose}>Stäng</button>
      </div>
    </Sheet>
  );
}

export { LuX };
