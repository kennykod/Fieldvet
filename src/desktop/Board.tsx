// The coordinator's day as one row per team: what is happening in one sentence, how far the day has come,
// and the visits from now and forward. Drag a visit to another team to see the impact before letting go.
import { useMemo, useRef, useState } from 'react';
import { LuCheck, LuLock, LuMap, LuWifiOff, LuTriangleAlert, LuSiren, LuChevronRight } from 'react-icons/lu';
import { VETS, type Visit } from '../shared/data';
import { hhmm, LATE_TOL, suggest, vetById, type Stop, type Suggestion, type VetPlan } from '../shared/engine';
import { capacityOf, impactLine, teamLine } from '../shared/ops';
import { useApp, type Alert } from '../store';
import { Avatar, SpeciesIcon } from '../ui';

export type BoardMode = 'nu' | 'dag';
const DAY = { from: 7 * 60 + 30, to: 17 * 60 + 30 };
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);

/** The visible span: from just before now to a few hours ahead, or the whole working day. */
export function boardWindow(mode: BoardMode, now: number) {
  if (mode === 'dag') return DAY;
  const from = Math.max(DAY.from, Math.floor((now - 45) / 15) * 15);
  return { from, to: from + 270 };
}

/** Free stretches long enough to matter (an urgent visit with driving fits in about 45 min). */
export function freeGaps(p: VetPlan, now: number): { from: number; to: number; before?: string }[] {
  const out: { from: number; to: number; before?: string }[] = [];
  if (p.state === 'dagen-klar') return out;
  let t = Math.max(now, p.vet.shift.start);
  for (const s of p.stops) {
    if (s.state !== 'kommande') { t = Math.max(t, s.end); continue; }
    if (s.departAt - t >= 45) out.push({ from: t, to: s.departAt, before: s.id });
    t = Math.max(t, s.end);
  }
  if (p.vet.shift.end - t >= 45) out.push({ from: t, to: p.vet.shift.end });
  return out;
}

interface Props {
  mode: BoardMode;
  setMode: (m: BoardMode) => void;
  showMap: boolean;
  setShowMap: (v: boolean) => void;
  selVet: string | null;
  selVisit: string | null;
  flash?: Set<string>;
  onVisit: (id: string) => void;
  onVet: (id: string) => void;
  onAlert: (a: Alert) => void;
  onDrop: (visitId: string, toVet: string) => void;
}

export function TeamBoard({ mode, setMode, showMap, setShowMap, selVet, selVisit, flash, onVisit, onVet, onAlert, onDrop }: Props) {
  const { s, plans, alerts, offlineSince } = useApp();
  const w = s.world;
  const now = w.now;
  const win = boardWindow(mode, now);
  const x = (m: number) => ((Math.min(win.to, Math.max(win.from, m)) - win.from) / (win.to - win.from)) * 100;
  const wd = (a: number, b: number) => Math.max(0, x(b) - x(a));
  const hours: number[] = [];
  for (let h = Math.ceil(win.from / 60) * 60; h <= win.to; h += 60) hours.push(h);

  // ——— dragging (impact is known before the drop) ———
  const wrap = useRef<HTMLDivElement>(null);
  const start = useRef<{ id: string; vet: string; cx: number; cy: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null; from: string; sugs: Suggestion[] } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const local = (cx: number, cy: number) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    const scale = r.width / el.offsetWidth || 1;
    return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
  };
  const rowAt = (cx: number, cy: number) => (document.elementFromPoint(cx, cy)?.closest('[data-vetrow]') as HTMLElement | null)?.dataset.vetrow ?? null;
  const onDown = (e: React.PointerEvent, id: string, vet: string, movable: boolean) => {
    if (e.button !== 0) return;
    start.current = { id, vet, cx: e.clientX, cy: e.clientY, moved: false };
    if (movable) (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const st = start.current;
    if (!st) return;
    const v = w.visits[st.id];
    if (v.status !== 'planerad' || v.locked) return;
    if (!st.moved && Math.hypot(e.clientX - st.cx, e.clientY - st.cy) < 6) return;
    const first = !st.moved;
    st.moved = true;
    const p = local(e.clientX, e.clientY);
    setDrag((d) => ({ id: st.id, x: p.x, y: p.y, over: rowAt(e.clientX, e.clientY), from: st.vet, sugs: first || !d ? suggest(w, st.id) : d.sugs }));
  };
  const onUp = (e: React.PointerEvent) => {
    const st = start.current;
    start.current = null;
    if (!st) return;
    if (!st.moved) { onVisit(st.id); setDrag(null); return; }
    const over = rowAt(e.clientX, e.clientY);
    setDrag(null);
    if (over && over !== st.vet) onDrop(st.id, over);
  };
  const name = (id: string) => w.visits[id]?.patient.name ?? '';
  const dragSug = drag?.over && drag.over !== drag.from ? drag.sugs.find((g) => g.vetId === drag.over) : undefined;

  const ute = Object.values(plans).filter((p) => p.state !== 'ej-startat' && p.state !== 'dagen-klar').length;

  return (
    <section className="board" ref={wrap} aria-label="Dagens team">
      <div className="b-head">
        <div className="b-title"><h2>Team</h2><span className="muted">{ute} av {VETS.length} ute</span></div>
        <div className="seg small" role="radiogroup" aria-label="Tidsfönster">
          <button role="radio" aria-checked={mode === 'nu'} className={mode === 'nu' ? 'on' : ''} onClick={() => setMode('nu')}>Från nu</button>
          <button role="radio" aria-checked={mode === 'dag'} className={mode === 'dag' ? 'on' : ''} onClick={() => setMode('dag')}>Hela dagen</button>
        </div>
        <div className="b-legend" aria-hidden="true"><span><i className="lg now" />Pågår</span><span><i className="lg late" />Blir sen</span><span><i className="lg free" />Ledigt</span></div>
        {!showMap && <button className="btn ghost sm b-map" aria-pressed={false} onClick={() => setShowMap(true)}><LuMap size={15} />Visa karta</button>}
      </div>

      <div className="b-axis">
        <span />
        <div className="b-scale">
          {hours.map((h) => <span key={h} style={{ left: `${x(h)}%` }}>{String(h / 60).padStart(2, '0')}</span>)}
          {now > win.from && now < win.to && <b className="b-nowlbl" style={{ left: `${x(now)}%` }}>Nu {hhmm(now)}</b>}
        </div>
      </div>

      {VETS.map((vet) => {
        const p = plans[vet.id];
        const stale = offlineSince != null && vet.id === w.manualVet;
        const cap = capacityOf(p, now);
        const gaps = freeGaps(p, now);
        const worst = [...p.stops].filter((st) => st.state !== 'klar' && st.late > LATE_TOL).sort((a, b) => b.late - a.late)[0];
        const issue = worst ? alerts.find((a) => a.kind === 'risk' && a.visitId === worst.id && !a.quiet) : undefined;
        const clinical = alerts.find((a) => a.vetId === vet.id && !a.quiet && a.cat === 'klinisk');
        const waiting = alerts.find((a) => a.vetId === vet.id && a.quiet && a.kind === 'ack');
        const behind = p.delay > 5 && p.state !== 'dagen-klar';
        const driving = p.current?.state === 'påväg' ? p.current : null;
        const comm = driving ? s.eta[driving.id] : undefined;
                const after = p.stops.filter((st) => st.start >= win.to).length;
        const chainFrom = hover ? p.stops.findIndex((st) => st.id === hover) : -1;
        const chain = new Set(chainFrom >= 0 ? p.stops.slice(chainFrom + 1).filter((st) => st.state !== 'klar' && st.delay > 5).map((st) => st.id) : []);
        const over = drag && drag.over === vet.id && drag.from !== vet.id;
        const tone = stale ? 'stale' : clinical ? 'crit' : worst || behind ? 'warn' : '';
        return (
          <div key={vet.id} className={`brow${tone ? ` t-${tone}` : ''}${selVet === vet.id ? ' sel' : ''}${selVet && selVet !== vet.id ? ' dim' : ''}${over ? ' drop' : ''}`} data-vetrow={vet.id}>
            <button className="bhead" onClick={() => onVet(vet.id)} aria-label={`${vet.name}: ${teamLine(p, w.visits)}`}>
              <Avatar vet={vet} size={30} />
              <span className="bh-name"><b>{vet.first}</b><span className="tnum">{p.done} av {p.total} klara</span></span>
              <span className="bprog" aria-hidden="true">{p.stops.map((st) => <i key={st.id} className={st.state === 'klar' ? 'd' : st.state === 'kommande' ? (st.late > LATE_TOL ? 'l' : '') : 'n'} />)}</span>
            </button>
            <div className="blane">
              <div className="bline">
                {stale ? <span className="muted"><LuWifiOff size={13} /> Ingen kontakt sedan {hhmm(offlineSince!)} · senast kända läge</span> : <span>{teamLine(p, w.visits)}</span>}
                {!stale && worst && (issue
                  ? <button className="b-dev warn" onClick={() => onAlert(issue)}><LuTriangleAlert size={13} />{name(worst.id)} blir {worst.late} min sen<LuChevronRight size={13} /></button>
                  : <span className="b-dev warn quiet">{name(worst.id)} {worst.late} min sen, ägaren har fått ny tid</span>)}
                {!stale && !worst && behind && <span className="b-dev warn quiet">{p.delay} min efter plan</span>}
                {!stale && !worst && !behind && p.state !== 'ej-startat' && p.state !== 'dagen-klar' && <span className="muted">· enligt plan</span>}
                {clinical && <button className="b-dev crit" onClick={() => onAlert(clinical)}><LuSiren size={13} />{clinical.title}<LuChevronRight size={13} /></button>}
                {waiting && <span className="b-chip">{waiting.title}</span>}
                {comm && !stale && (
                  <span className={`b-chip comm ${comm.state}`} data-demo={`vc-comm-${vet.id}`}>
                    {comm.state === 'sent' ? <LuCheck size={12} /> : comm.state === 'pending' ? <span className="spin" aria-hidden="true" /> : <LuTriangleAlert size={12} />}
                    {comm.state === 'pending' ? 'Skickar till ägaren…' : comm.state === 'failed' ? 'Kundmeddelandet kunde inte skickas' : comm.state === 'blocked' ? `${w.visits[driving!.id].owner.first} tar inte emot sms` : comm.via === 'telefon' ? 'Ägaren informerad per telefon' : comm.type === 'VETERINARIAN_ON_THE_WAY' ? `Ägaren informerad via Provet ✓ · ${hhmm(comm.from)}–${hhmm(comm.to)}` : `Ny ankomsttid skickad ✓ · ${hhmm(comm.from)}–${hhmm(comm.to)}`}
                  </span>
                )}
                {!stale && cap.urgentSlots > 0 && gaps[0] && <span className="b-chip free">Plats för akut · {dur(gaps[0].to - gaps[0].from)} ledigt från {hhmm(gaps[0].from)}</span>}
                {after > 0 && mode === 'nu' && <button className="b-more" onClick={() => setMode('dag')} title="Visa hela dagen">+{after} senare</button>}
              </div>
              <div className="btrack">
                <div className="b-past" style={{ width: `${x(now)}%` }} />
                {vet.shift.start > win.from && <div className="b-off" style={{ left: 0, width: `${x(vet.shift.start)}%` }} />}
                {vet.shift.end < win.to && <div className="b-off" style={{ left: `${x(vet.shift.end)}%`, right: 0 }} />}
                {hours.map((h) => <span key={h} className="b-grid" style={{ left: `${x(h)}%` }} />)}
                {gaps.filter((g) => g.to > win.from && g.from < win.to).map((g) => (
                  <div key={g.from} className="b-gap" style={{ left: `${x(g.from)}%`, width: `${wd(g.from, g.to)}%` }} title={`Ledigt ${hhmm(g.from)}–${hhmm(g.to)}`}><span>{dur(g.to - g.from)} ledigt</span></div>
                ))}
                {p.stops.map((st) => <Block key={st.id} st={st} v={w.visits[st.id]} vetId={vet.id} x={x} wd={wd} win={win}
                  cls={`${selVisit === st.id ? ' sel' : ''}${flash?.has(st.id) ? ' flash' : ''}${drag?.id === st.id ? ' dragging' : ''}${chain.has(st.id) ? ' chain' : ''}`}
                  onDown={onDown} onMove={onMove} onUp={onUp} onVisit={onVisit} onHover={setHover} />)}
                {now > win.from && now < win.to && <span className="b-now" style={{ left: `${x(now)}%` }} />}
                {over && (
                  <div className={`b-drophint${dragSug && !dragSug.ok ? ' bad' : ''}`}>
                    {dragSug ? (dragSug.ok ? <>Till {vet.first} · framme {hhmm(dragSug.arrive)} · {impactLine(dragSug, name)}</> : <>Går inte: {dragSug.reason}</>) : `Släpp för att se påverkan för ${vet.first}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {drag && (
        <div className="tl-dragghost" style={{ left: drag.x + 14, top: drag.y + 16 }}>
          {w.visits[drag.id].patient.name}
          <span>{drag.over && drag.over !== drag.from ? `→ ${vetById(drag.over).first}` : 'Dra till ett annat team'}</span>
        </div>
      )}
    </section>
  );
}

function Block({ st, v, vetId, x, wd, win, cls, onDown, onMove, onUp, onVisit, onHover }: {
  st: Stop; v: Visit; vetId: string; x: (m: number) => number; wd: (a: number, b: number) => number; win: { from: number; to: number }; cls: string;
  onDown: (e: React.PointerEvent, id: string, vet: string, movable: boolean) => void; onMove: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void;
  onVisit: (id: string) => void; onHover: (id: string | null) => void;
}) {
  if (st.end <= win.from || st.start >= win.to) return null;
  const late = st.late > LATE_TOL;
  const width = wd(st.start, st.end);
  const ghost = st.state === 'kommande' && v.plannedArrive != null && st.arrive - v.plannedArrive > 5;
  const movable = v.status === 'planerad' && !v.locked;
  const driveFrom = Math.max(st.departAt, win.from);
  return (
    <>
      {ghost && <div className="b-ghost" style={{ left: `${x(v.plannedArrive!)}%`, width: `${wd(v.plannedArrive!, v.plannedArrive! + v.duration)}%` }} title={`Planerat ${hhmm(v.plannedArrive!)}`} />}
      {st.drive > 0 && st.arrive > win.from && <div className={`b-drive${st.state === 'påväg' ? ' active' : st.state === 'klar' ? ' done' : ''}`} style={{ left: `${x(driveFrom)}%`, width: `${wd(driveFrom, st.arrive)}%` }} title={`Körning ${st.drive} min`} />}
      <div
        className={`b-visit st-${st.state}${late ? ' late' : ''}${v.priority === 'akut' ? ' akut' : ''}${v.isNew ? ' new' : ''}${v.locked ? ' locked' : ''}${width < 6 ? ' narrow' : ''}${cls}`}
        style={{ left: `${x(st.start)}%`, width: `${width}%` }}
        onPointerDown={(e) => onDown(e, st.id, vetId, movable)}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerEnter={() => onHover(st.id)}
        onPointerLeave={() => onHover(null)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVisit(st.id); } }}
        title={`${v.patient.name} · ${hhmm(st.start)}–${hhmm(st.end)} · ${v.address.area}${late ? ` · ${st.late} min sen` : ''}${v.locked ? ' · låst tid' : ''}`}
        data-visit={st.id}
      >
        {width >= 11 && (st.state === 'klar' ? <LuCheck size={12} /> : v.locked ? <LuLock size={11} className="lk" aria-label="Låst" /> : late ? null : <SpeciesIcon s={v.patient.species} size={12} />)}
        <span className="bv-name">{v.patient.name}</span>
        {late && width >= 9 ? <span className="bv-late">+{st.late}</span> : width >= 18 ? <span className="bv-time">{hhmm(st.start)}</span> : null}
      </div>
    </>
  );
}

/** What happens in the next hour, all teams in one short list. */
export function NextHour({ onVisit }: { onVisit: (id: string) => void }) {
  const { s, plans } = useApp();
  const now = s.world.now;
  const until = now + 75;
  const items = useMemo(() => {
    const out: { at: number; vet: string; text: string; tone?: 'warn' | 'free'; id?: string }[] = [];
    for (const p of Object.values(plans)) {
      const first = p.vet.first;
      for (const st of p.stops) {
        const n = s.world.visits[st.id]?.patient.name;
        const late = st.late > LATE_TOL ? 'warn' as const : undefined;
        if ((st.state === 'pågår' || st.state === 'framme') && st.end > now && st.end <= until) out.push({ at: st.end, vet: first, text: `klar hos ${n}`, id: st.id });
        if ((st.state === 'kommande' || st.state === 'påväg') && st.arrive > now && st.arrive <= until) out.push({ at: st.arrive, vet: first, text: `framme hos ${n}${late ? ` · +${st.late}` : ''}`, tone: late, id: st.id });
      }
      for (const g of freeGaps(p, now)) if (g.from >= now - 1 && g.from <= until) out.push({ at: Math.max(g.from, now), vet: first, text: `ledig ${dur(g.to - g.from)}`, tone: 'free' });
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 6);
  }, [plans, s.world.visits, now, until]);
  return (
    <div className="nexthour" aria-label="Nästa timme">
      {items.length === 0 && <p className="muted small">Inget planerat den närmaste timmen.</p>}
      {items.map((it, i) => (
        <button key={i} className={`nh-row${it.tone ? ` ${it.tone}` : ''}`} onClick={() => it.id && onVisit(it.id)} disabled={!it.id}>
          <span className="tnum">{hhmm(it.at)}</span>
          <span><b>{it.vet}</b> {it.text}</span>
        </button>
      ))}
    </div>
  );
}
