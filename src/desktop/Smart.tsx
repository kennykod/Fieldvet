import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuArrowLeft, LuCar, LuCheck, LuClock, LuChevronDown, LuMessageSquare, LuSparkles, LuTriangleAlert, LuX, LuArrowRight, LuSiren, LuMapPin, LuCircleAlert, LuWandSparkles, LuLock, LuRefreshCw, LuBan, LuUsers,
} from 'react-icons/lu';
import { ADDRESS_BOOK, KIND, URGENT_PRESET, VETS, type Species, type Visit, type VisitKind } from '../shared/data';
import { AREAS, jitter, placeAddress, type Placement } from '../shared/importer';
import {
  dur, fixesFor, hhmm, LATE_TOL, optimizeDay, planAll, planVet, suggest, vetById,
  type Proposal, type Suggestion, type VetPlan, type World,
} from '../shared/engine';
import { Avatar, Checks, CloseBtn, Delta, PatientBadge } from '../ui';
import { capacityOf, etaWindow, FIT_LABEL, fitOf, impactLine, nearestArea, TEAM_LABEL, teamStatus } from '../shared/ops';
import { useApp, type Alert } from '../store';
import { CityMap, type MapRoute } from '../map';

export interface MapPreview {
  plans: Record<string, VetPlan>;
  visits: Record<string, Visit>;
  vets: string[];
  ghost?: Record<string, VetPlan>;
  pin?: { loc: { lat: number; lng: number }; label: string };
}

export function previewFromSuggestion(w: World, visitId: string, sug: Suggestion, visits = w.visits): MapPreview {
  const from = visits[visitId].vetId;
  const vs = { ...visits, [visitId]: { ...visits[visitId], vetId: sug.vetId } };
  for (const [id, win] of Object.entries(sug.windows)) vs[id] = { ...vs[id], window: win };
  const routes = { ...w.routes, [sug.vetId]: sug.route };
  if (from && from !== sug.vetId) routes[from] = w.routes[from].filter((x) => x !== visitId);
  const plans = planAll({ ...w, visits: vs, routes });
  const ghost = planAll({ ...w, visits });
  return { plans, visits: vs, vets: [...new Set([sug.vetId, from].filter(Boolean))], ghost };
}

/** Preview only: shows what a proposal would do without validating or approving it. */
export function previewWorld(w: World, p: Proposal): World {
  const visits = { ...w.visits };
  for (const [vid, to] of Object.entries(p.reassign)) if (visits[vid]) visits[vid] = { ...visits[vid], vetId: to };
  for (const [vid, win] of Object.entries(p.windows)) if (visits[vid]) visits[vid] = { ...visits[vid], window: win };
  return { ...w, visits, routes: { ...p.routes } };
}
export function previewFromProposal(w: World, p: Proposal): MapPreview {
  const w2 = previewWorld(w, p);
  return { plans: planAll(w2), visits: w2.visits, vets: p.focusVets, ghost: planAll(w) };
}

/** Shown when the approved plan changed after a proposal was computed. */
export function StaleNote({ onRecalc }: { onRecalc: () => void }) {
  return (
    <div className="why warn stale">
      <p><b>Planen har ändrats sedan förslaget togs fram.</b> Räkna om innan du godkänner.</p>
      <button className="btn sm soft" onClick={onRecalc}><LuRefreshCw size={14} />Räkna om</button>
    </div>
  );
}

/* ———————————————— Reassign / Smart förslag ———————————————— */
export function AssignPanel({ visitId, target, onClose, onPreview, onDone }: { visitId: string; target?: string; onClose: () => void; onPreview: (p: MapPreview | null) => void; onDone?: (vetId: string, visitId: string) => void }) {
  const { s, act, toast, plans } = useApp();
  const w = s.world;
  const v = w.visits[visitId];
  const sugs = useMemo(() => suggest(w, visitId, undefined, v.vetId), [w, visitId, v.vetId]);
  const firstOk = sugs.find((x) => x.ok);
  const targetSug = target ? sugs.find((x) => x.vetId === target) : undefined;
  const [sel, setSel] = useState<string | undefined>(targetSug?.ok ? target : firstOk?.vetId);
  const chosen = sugs.find((x) => x.vetId === sel);

  // effect on source vet
  const src = plans[v.vetId];
  const srcAfter = planVet(src.vet, w.routes[v.vetId].filter((x) => x !== visitId), w.visits, w.now);

  const pick = (id: string) => {
    setSel(id);
    const sug = sugs.find((x) => x.vetId === id);
    onPreview(sug && sug.ok ? previewFromSuggestion(w, visitId, sug) : null);
  };
  useEffect(() => { if (chosen?.ok) onPreview(previewFromSuggestion(w, visitId, chosen)); else onPreview(null); /* eslint-disable-next-line */ }, [visitId]);

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="iconbtn" onClick={onClose} aria-label="Tillbaka"><LuArrowLeft size={18} /></button>
        <PatientBadge v={v} size={36} />
        <div className="ph-title">
          <b>Flytta {v.patient.name}</b>
          <span className="muted tnum">{hhmm(v.window.from)}–{hhmm(v.window.to)} · {v.address.area} · nu hos {vetById(v.vetId).first}</span>
        </div>
      </div>
      <div className="panel-scroll">
        {v.locked && (
          <div className="why lockinfo"><p><LuLock size={14} /> <b>Tiden är låst.</b> {v.locked.reason}. Lås upp den under Mer i besöket om det verkligen ska flyttas.</p></div>
        )}
        {targetSug && !targetSug.ok && !v.locked && (
          <div className="why warn"><p><b>{vetById(targetSug.vetId).first} kan inte ta besöket.</b> {targetSug.reason}. Bästa alternativet är förvalt nedan.</p></div>
        )}
        {!firstOk && !v.locked && (
          <div className="why warn"><p><b>Inget annat team kan ta besöket just nu.</b> {sugs[0]?.reason ?? ''}. Behåll planen och skicka ny tid till ägaren, eller ring {vetById(v.vetId).first}.</p></div>
        )}
        <h5 className="eyebrow"><LuUsers size={13} />Föreslagna team</h5>
        <div className="sugs">
          {sugs.map((sug, i) => (
            <SuggestionRow key={sug.vetId} sug={sug} best={sug === firstOk} selected={sel === sug.vetId} onClick={() => sug.ok && pick(sug.vetId)} rank={i} />
          ))}
        </div>
        <FitNote />
        {chosen?.ok && (
          <div className="impact">
            <span className={`reco-check${chosen.checks.filter((c) => c.hard).every((c) => c.ok) ? '' : ' bad'}`}><LuCheck size={13} />Behörighet, utrustning och arbetstid stämmer</span>
            <h5 className="eyebrow">Så påverkas dagen</h5>
            <div className="impact-grid">
              <div className="impact-col">
                <div className="row gap8"><Avatar vet={vetById(chosen.vetId)} size={24} /><b>{vetById(chosen.vetId).first}</b></div>
                <ul>
                  <li><LuCar size={14} />{chosen.extraDrive > 0 ? `+${chosen.extraDrive} min körning` : 'Ingen extra körning'}</li>
                  <li><LuMapPin size={14} />Framme {hhmm(chosen.arrive)}</li>
                  <li>{chosen.addedLate > 0 ? <LuTriangleAlert size={14} /> : <LuCheck size={14} />}{chosen.addedLate > 0 ? `${chosen.addedLate} min försening för andra` : chosen.affected ? `${chosen.affected} besök skjuts, inom fönster` : 'Övriga besök påverkas inte'}</li>
                </ul>
              </div>
              <div className="impact-col">
                <div className="row gap8"><Avatar vet={src.vet} size={24} /><b>{src.vet.first}</b></div>
                <ul>
                  <li><LuCar size={14} />{src.driveMin - srcAfter.driveMin > 0 ? `−${src.driveMin - srcAfter.driveMin} min körning` : 'Samma körning'}</li>
                  <li><LuClock size={14} />Klar {hhmm(srcAfter.endAt)} i stället för {hhmm(src.endAt)}</li>
                  <li><LuCheck size={14} />{srcAfter.lateSum < src.lateSum ? `${src.lateStops.length} sena besök löses` : 'Övriga besök hålls i tid'}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="panel-foot">
        <button className="btn ghost" onClick={onClose}>Avbryt</button>
        <button
          className="btn primary"
          disabled={!chosen?.ok}
          onClick={() => {
            const to = vetById(chosen!.vetId).first;
            const at = hhmm(chosen!.arrive);
            const calm = chosen!.addedLate === 0;
            if (!act.reassign(visitId, chosen!)) return;
            toast(`${v.patient.name} flyttad till ${to} ✓ · ${to} är framme ca ${at} · ${calm ? 'Övriga besök påverkas inte' : `${chosen!.affected} besök blir senare`} · Ägaren informeras via Provet`, 'ok', { label: 'Ångra', run: act.undo });
            onPreview(null);
            if (onDone) onDone(chosen!.vetId, visitId); else onClose();
          }}
        >
          <LuCheck size={15} />{chosen?.ok ? `Bekräfta flytt till ${vetById(chosen.vetId).first}` : 'Välj ett team'}
        </button>
      </div>
    </div>
  );
}

export function SuggestionRow({ sug, best, selected, onClick, rank }: { sug: Suggestion; best: boolean; selected: boolean; onClick: () => void; rank: number }) {
  const vet = vetById(sug.vetId);
  const { plans, s } = useApp();
  const p = plans[sug.vetId];
  const cap = p ? capacityOf(p, s.world.now) : null;
  const fit = fitOf(sug, best);
  const win = etaWindow(sug.arrive);
  const name = (id: string) => s.world.visits[id]?.patient.name ?? 'nästa besök';
  return (
    <button className={`sug fit-${fit}${selected ? ' sel' : ''}${sug.ok ? '' : ' blocked'}`} onClick={onClick} disabled={!sug.ok} style={{ animationDelay: `${rank * 60}ms` }} aria-label={`${vet.first}: ${FIT_LABEL[fit]}`}>
      <Avatar vet={vet} size={34} />
      <span className="sug-body">
        <span className="sug-top">
          <b>{vet.first}</b>
          <span className={`tag fit fit-${fit}`}>{FIT_LABEL[fit]}</span>
        </span>
        <span className="sug-why">{impactLine(sug, name)}</span>
        {cap && p && <span className="sug-cap"><span className="muted">{TEAM_LABEL[teamStatus(p)]} · {nearestArea(p.pos)} · {cap.remaining} besök kvar{cap.level === 'hog' ? ' · fullbokad' : cap.urgentSlots ? ' · har plats' : ''}</span></span>}
      </span>
      {sug.ok && (
        <span className="sug-eta">
          <span className="muted">Framme ca</span>
          <b className="tnum">{hhmm(win.from)}–{hhmm(win.to)}</b>
        </span>
      )}
    </button>
  );
}

/** Suggestions rank teams on place, time, workload and equipment. Said once, plainly, under every list. */
export function FitNote() {
  return <p className="fit-note">Förslagen bygger på plats, tid, arbetstid, belastning och utrustning. De är ingen medicinsk bedömning.</p>;
}

/* ———————————————— Fix panel: one recommendation first ———————————————— */
/** Plain-language outcome of a proposal, e.g. "Erik är framme 10:28. Inga andra besök blir sena." */
export function proposalOutcome(w: World, p: Proposal): { title: string; line: string; toast: string } {
  const after = planAll(previewWorld(w, p));
  const move = p.changes.find((c) => c.kind === 'flytt' && c.visitId && c.to);
  const retimed = p.changes.filter((c) => c.kind === 'tid').length;
  const late = p.after.lateCount;
  const rest = late === 0 ? 'Inga andra besök blir sena.' : `${late} besök blir fortfarande sena.`;
  const owners = retimed ? ` ${retimed} ${retimed === 1 ? 'ägare får' : 'ägare får'} ny tid.` : '';
  if (move) {
    const v = w.visits[move.visitId!];
    const to = vetById(move.to!);
    const st = after[to.id]?.stops.find((x) => x.id === move.visitId);
    const at = st ? hhmm(st.arrive) : '';
    return {
      title: `Flytta ${v.patient.name} till ${to.first}`,
      line: `${to.first} är framme ${at}. ${rest}${owners}`,
      toast: `${v.patient.name} flyttad till ${to.first} ✓ · ${to.first} är framme ca ${at} · ${late === 0 ? 'Övriga besök påverkas inte' : `${late} besök fortfarande sena`} · Ägaren informeras via Provet`,
    };
  }
  return { title: p.title, line: `${rest}${owners}`, toast: `${p.title} ✓ · ${late === 0 ? 'Alla besök hålls i tid' : `${late} besök fortfarande sena`}${retimed ? ' · Ägarna har informerats' : ''}` };
}

export function FixPanel({ alert, onClose, onPreview, onOpenProposal, onAssign, onEtaSent, onApproved }: { alert: Alert; onClose: () => void; onPreview: (p: MapPreview | null) => void; onOpenProposal: (p: Proposal) => void; onAssign?: (visitId: string, vetId: string) => void; onEtaSent?: (visitId: string) => void; onApproved?: (visitIds: string[]) => void }) {
  const { s, plans, act, toast } = useApp();
  const w = s.world;
  const [calc, setCalc] = useState(0);
  const options = useMemo<Proposal[]>(() => {
    if (alert.kind === 'risk' && alert.visitId) return fixesFor(w, alert.visitId);
    if (alert.kind === 'request' && s.request) return [s.request.proposal];
    const p = optimizeDay(w, { title: 'Ny ordning för dagen' });
    return p.changes.length ? [p] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id, calc]);
  const [sel, setSel] = useState(0);
  const [alts, setAlts] = useState(false);
  const cur = options[sel];
  const isStale = !!cur && cur.baseVersion !== w.planVersion;
  useEffect(() => { setSel(0); onPreview(options[0] ? previewFromProposal(w, options[0]) : null); /* eslint-disable-next-line */ }, [options]);

  const v = alert.visitId ? w.visits[alert.visitId] : null;
  const vp = alert.vetId ? plans[alert.vetId] : null;
  const st = v && vp ? vp.stops.find((x) => x.id === v.id) : undefined;
  const cause = vp?.stops.find((x) => x.state === 'pågår' && w.visits[x.id].extension > 0);
  const others = useMemo(() => (alert.kind === 'risk' && alert.visitId ? suggest(w, alert.visitId, undefined, alert.vetId).slice(0, 3) : []), [alert.id, calc]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = options[0];
  const bestOut = best ? proposalOutcome(w, best) : null;
  const keepIdx = options.length;
  const win = st ? etaWindow(st.arrive) : null;
  const hardOk = (p: Proposal) => p.checks.filter((c) => c.hard).every((c) => c.ok);

  const approve = (p: Proposal) => {
    const out = proposalOutcome(w, p);
    if (!act.apply(p)) return;
    toast(out.toast, 'ok', { label: 'Ångra', run: act.undo });
    onPreview(null);
    onApproved?.(p.changes.map((c) => c.visitId).filter(Boolean) as string[]);
    onClose();
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="iconbtn" onClick={onClose} aria-label="Tillbaka"><LuArrowLeft size={18} /></button>
        <span className={`alert-ic tone-${alert.tone}`}><LuClock size={16} /></span>
        <div className="ph-title">
          <b>{alert.kind === 'request' ? `${vetById(alert.vetId!).first} föreslår en ny rutt` : alert.title}</b>
          <span className="muted">{alert.sub}</span>
        </div>
      </div>
      <div className="panel-scroll">
        {v && st && (
          <p className="why-line">
            {v.patient.name} har bokad tid <b className="tnum">{hhmm(v.window.from)}–{hhmm(v.window.to)}</b> men {vp?.vet.first} beräknas vara framme <b className="tnum warn-t">{hhmm(st.arrive)}</b>.
            {cause && <> {w.visits[cause.id].patient.name}s besök drog över.</>}
          </p>
        )}
        {alert.kind === 'overtime' && vp && (
          <p className="why-line">{vp.vet.first} beräknas klar <b className="tnum warn-t">{hhmm(vp.endAt)}</b>, passet slutar <b className="tnum">{hhmm(vp.vet.shift.end)}</b>.</p>
        )}
        {v && v.status === 'avbokad' && <div className="calm"><LuCheck size={18} /><div><b>{v.patient.name} är avbokad</b><span>Risken finns inte längre.</span></div></div>}
        {isStale && v?.status !== 'avbokad' && <StaleNote onRecalc={() => setCalc((c) => c + 1)} />}

        {best && bestOut ? (
          <div className={`reco${sel === 0 ? ' sel' : ''}`} data-demo="reco" onClick={() => { setSel(0); onPreview(previewFromProposal(w, best)); }}>
            <span className="reco-eyebrow"><LuSparkles size={13} />Förslag</span>
            <b className="reco-title">{bestOut.title}</b>
            <p>{bestOut.line}</p>
            <span className={`reco-check${hardOk(best) ? '' : ' bad'}`}>{hardOk(best) ? <><LuCheck size={13} />Behörighet, utrustning och arbetstid stämmer</> : <><LuTriangleAlert size={13} />{best.checks.filter((c) => c.hard && !c.ok).map((c) => c.label).join(', ')}</>}</span>
          </div>
        ) : (
          !v || v.status !== 'avbokad' ? <div className="calm"><LuCheck size={18} /><div><b>Inget bättre förslag just nu</b><span>{v ? 'Behåll planen och meddela ägaren den nya tiden.' : 'Planen är redan den bästa.'}</span></div></div> : null
        )}

        {(options.length > 1 || v || others.length > 0) && (
          <button className="link alt-toggle" onClick={() => setAlts(!alts)} aria-expanded={alts} data-demo="alts">
            {alts ? 'Dölj andra alternativ' : 'Visa andra alternativ'}<LuChevronDown size={14} className={alts ? 'flip' : ''} />
          </button>
        )}
        {alts && (
          <div className="alts">
            {options.slice(1).map((p, i) => {
              const o = proposalOutcome(w, p);
              return (
                <button key={p.id} className={`fix${sel === i + 1 ? ' sel' : ''}`} onClick={() => { setSel(i + 1); onPreview(previewFromProposal(w, p)); }}>
                  <span className="fix-top"><b>{o.title}</b></span>
                  <span className="fix-why">{o.line}</span>
                </button>
              );
            })}
            {v && (
              <button data-demo="keep-plan" className={`fix${sel === keepIdx ? ' sel' : ''}`} onClick={() => { setSel(keepIdx); onPreview(null); }}>
                <span className="fix-top"><b>Behåll planen, meddela ägaren</b></span>
                <span className="fix-why">{v.owner.first} får ny tid {win ? `${hhmm(win.from)}–${hhmm(win.to)}` : ''} via sms. (Simuleras i prototypen.)</span>
              </button>
            )}
            {alert.kind === 'risk' && v && v.status === 'planerad' && !v.locked && onAssign && others.length > 0 && (
              <>
                <h5 className="eyebrow"><LuUsers size={13} />Välj team själv</h5>
                <div className="sugs">
                  {others.map((sug, i) => (
                    <SuggestionRow key={sug.vetId} sug={sug} best={sug === others.find((x) => x.ok)} selected={false} rank={i} onClick={() => sug.ok && onAssign(v.id, sug.vetId)} />
                  ))}
                </div>
                <FitNote />
              </>
            )}
            {cur && <button className="link" onClick={() => onOpenProposal(cur)}>Jämför före och efter</button>}
          </div>
        )}
      </div>
      <div className="panel-foot">
        {sel < options.length ? (
          <>
            {alert.kind === 'request'
              ? <button className="btn ghost danger" onClick={() => { act.rejectRequest(); toast(`Förslaget avvisat. ${vetById(alert.vetId!).first} har fått besked.`, 'info'); onPreview(null); onClose(); }}><LuBan size={15} />Avvisa</button>
              : <button className="btn ghost" onClick={onClose}>Avbryt</button>}
            <button className="btn primary" data-demo="approve" disabled={!cur.valid || isStale} title={!cur.valid ? 'Förslaget bryter mot ett villkor' : isStale ? 'Räkna om först' : undefined} onClick={() => approve(cur)}>
              <LuCheck size={15} />Godkänn
            </button>
          </>
        ) : v ? (
          <>
            <button className="btn ghost" onClick={onClose}>Avbryt</button>
            <button
              className="btn primary"
              data-demo="send-eta"
              onClick={() => {
                if (st) { act.sendEta(v.id, st.arrive); toast(`Ny tid skickas via Provet ✓ · ${v.owner.first} får veta att ${vetById(v.vetId).first} kommer ca ${hhmm(win!.from)}–${hhmm(win!.to)}`); }
                if (alert.kind === 'request') act.rejectRequest();
                onPreview(null);
                if (onEtaSent) onEtaSent(v.id); else onClose();
              }}
            >
              <LuMessageSquare size={15} />Skicka ny tid
            </button>
          </>
        ) : <button className="btn ghost" onClick={onClose}>Stäng</button>}
      </div>
    </div>
  );
}

/* ———————————————— Before / after modal ———————————————— */
export function ProposalModal({ proposal, onClose, onApprove, onReject, approveLabel = 'Godkänn ändring' }: { proposal: Proposal; onClose: () => void; onApprove: () => void; onReject?: () => void; approveLabel?: string }) {
  const { s } = useApp();
  const w = s.world;
  const after = useMemo(() => previewWorld(w, proposal), [w, proposal]);
  const isStale = proposal.baseVersion !== w.planVersion;
  const beforePlans = useMemo(() => planAll(w), [w]);
  const afterPlans = useMemo(() => planAll(after), [after]);
  const vets = proposal.focusVets.length ? proposal.focusVets : VETS.map((v) => v.id);
  const pts = vets.flatMap((id) => [...beforePlans[id].stops, ...afterPlans[id].stops].filter((x) => x.state !== 'klar').map((x) => w.visits[x.id].loc).concat([beforePlans[id].pos]));
  const toRoutes = (plans: Record<string, VetPlan>): MapRoute[] => vets.map((id) => ({ vetId: id, color: vetById(id).color, plan: plans[id] }));
  const changedIds = new Set(proposal.changes.map((c) => c.visitId).filter(Boolean) as string[]);
  const reorderVets = new Set(proposal.changes.filter((c) => c.kind === 'ordning').map((c) => c.vetId));

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={proposal.title}>
        <div className="modal-head">
          <span className="mh-ic"><LuWandSparkles size={18} /></span>
          <div>
            <h3>{proposal.title}</h3>
            <p className="muted">{proposal.why}</p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="ba-metrics">
          <div><span className="muted">Körtid, alla</span><Delta before={proposal.before.drive} after={proposal.after.drive} fmt={dur} /></div>
          <div><span className="muted">Sena besök</span><Delta before={proposal.before.lateCount} after={proposal.after.lateCount} fmt={(n) => String(n)} /></div>
          <div><span className="muted">Övertid</span><Delta before={proposal.before.overtime} after={proposal.after.overtime} /></div>
          {Object.entries(proposal.ends).slice(0, 1).map(([id, e]) => (
            <div key={id}><span className="muted">{vetById(id).first} klar</span><Delta before={e.before} after={e.after} fmt={hhmm} /></div>
          ))}
        </div>
        {!proposal.changes.length ? (
          <div className="nochange">
            <LuCheck size={20} />
            <div><b>Ingen ändring behövs</b><span>Alla besök hålls redan inom sina tidsfönster. Den lediga tiden syns i tidslinjen och kan användas för akuta besök.</span></div>
          </div>
        ) : (<>
        <div className="ba-checks"><Checks checks={proposal.checks} />{isStale && <span className="stale-tag">Planen har ändrats sedan förslaget togs fram</span>}</div>
        <div className="ba-maps">
          <figure>
            <figcaption><span className="tag t-before">Före</span></figcaption>
            <CityMap routes={toRoutes(beforePlans)} visits={w.visits} focus={pts} focusKey="b" compact controls={false} padPx={30} />
          </figure>
          <figure>
            <figcaption><span className="tag t-after">Efter</span></figcaption>
            <CityMap routes={toRoutes(afterPlans)} visits={after.visits} focus={pts} focusKey="a" compact controls={false} padPx={30} />
          </figure>
        </div>
        <div className="ba-lists">
          {vets.map((id) => {
            const bp = beforePlans[id];
            const ap = afterPlans[id];
            const removed = bp.stops.filter((x) => x.state === 'kommande' && !ap.stops.some((y) => y.id === x.id));
            return (
              <div key={id} className="ba-col">
                <div className="row gap8 ba-col-head">
                  <Avatar vet={vetById(id)} size={24} />
                  <b>{vetById(id).first}</b>
                  <span className="muted tnum">klar {hhmm(bp.endAt)} → <b className={ap.endAt < bp.endAt ? 'good-t' : ''}>{hhmm(ap.endAt)}</b></span>
                  {reorderVets.has(id) && <span className="tag t-moved">Ny ordning</span>}
                </div>
                <ol className="ba-stops">
                  {ap.stops.filter((x) => x.state !== 'klar').map((x) => {
                    const v = after.visits[x.id];
                    const b = bp.stops.find((y) => y.id === x.id);
                    const moved = changedIds.has(x.id);
                    return (
                      <li key={x.id} className={moved ? 'changed' : ''}>
                        <span className="tnum">{hhmm(x.arrive)}</span>
                        <b>{v.patient.name}</b>
                        <span className="muted">{v.address.area}</span>
                        {!b && <span className="tag t-new">Flyttas hit</span>}
                        {b && Math.abs(b.arrive - x.arrive) >= 5 && <span className="tag t-time">var {hhmm(b.arrive)}</span>}
                        {x.late > LATE_TOL && <span className="tag t-late">{x.late} min sent</span>}
                      </li>
                    );
                  })}
                  {removed.map((x) => (
                    <li key={x.id} className="removed">
                      <span className="tnum">{hhmm(x.arrive)}</span>
                      <b>{w.visits[x.id].patient.name}</b>
                      <span className="tag t-gone">Flyttas till {vetById(proposal.reassign[x.id] ?? id).first}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        </>)}
        {proposal.changes.some((c) => c.kind === 'tid') && (
          <p className="ba-note"><LuMessageSquare size={14} />Ägare med ny tid får ett sms när ändringen godkänns (simuleras i prototypen).</p>
        )}
        <div className="modal-foot">
          {!proposal.changes.length ? (
            <button className="btn primary" onClick={onReject ?? onClose}>Stäng</button>
          ) : (<>
          {onReject ? <button className="btn ghost danger" onClick={onReject}><LuBan size={15} />Avvisa förslaget</button> : <button className="btn ghost" onClick={onClose}>Avbryt</button>}
          <button className="btn primary" onClick={onApprove} disabled={!proposal.changes.length || !proposal.valid || isStale} title={isStale ? 'Räkna om förslaget först' : !proposal.valid ? 'Förslaget bryter mot ett villkor' : undefined}><LuCheck size={15} />{approveLabel}</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

/* ———————————————— Akutbesök / nytt hembesök ———————————————— */
let newSeq = 1;
const SPECIES: Species[] = ['Katt', 'Hund', 'Kanin'];
const KINDS: VisitKind[] = ['akut-mage', 'andning', 'hälta', 'aptit', 'sår', 'vaccination', 'hud', 'urin'];
export type Urgency = '30' | '60' | '120' | 'idag';
const URGENCY: [Urgency, string][] = [['30', 'Inom 30 min'], ['60', 'Inom 1 h'], ['120', 'Inom 2 h'], ['idag', 'Idag']];
export const urgencyLabel = (v: Visit) => {
  if (v.priority !== 'akut') return 'Idag';
  const span = v.window.to - v.window.from;
  return span <= 30 ? 'Inom 30 min' : span <= 60 ? 'Inom 1 h' : 'Inom 2 h';
};

type UrgentForm = { name: string; species: Species; breed: string; age: string; owner: string; phone: string; street: string; place: string; areaFix: string; access: string; reason: string; kind: VisitKind; duration: number; urg: Urgency; note: string; example: boolean };
const EMPTY_FORM: UrgentForm = { name: '', species: 'Hund', breed: '', age: '', owner: '', phone: '', street: '', place: '', areaFix: '', access: '', reason: '', kind: 'aptit', duration: 30, urg: '120', note: '', example: false };
const EXAMPLE_FORM: UrgentForm = {
  name: URGENT_PRESET.patient.name, species: URGENT_PRESET.patient.species as Species, breed: URGENT_PRESET.patient.breed, age: URGENT_PRESET.patient.age,
  owner: `${URGENT_PRESET.owner.first} ${URGENT_PRESET.owner.last}`, phone: URGENT_PRESET.owner.phone,
  street: URGENT_PRESET.address.street, place: `${URGENT_PRESET.address.postal} ${URGENT_PRESET.address.area}`, areaFix: '', access: URGENT_PRESET.access.join(', '),
  reason: URGENT_PRESET.reason, kind: URGENT_PRESET.kind as VisitKind, duration: URGENT_PRESET.duration, urg: '120', note: '', example: true,
};
const lc = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();

/** Where the typed address lands on the map. Known address first, then district or postcode, else the coordinator picks a district. */
function locate(f: UrgentForm): (Placement & { fixed?: boolean }) | null {
  if (!f.street.trim()) return null;
  if (f.areaFix) { const a = AREAS.find((x) => x.name === f.areaFix)!; return { loc: jitter(a.loc, f.street), area: a.name, how: 'stadsdel', fixed: true }; }
  const postal = (f.place.match(/\d{3}\s?\d{2}/) ?? [''])[0];
  return placeAddress(f.street, postal, f.place.replace(postal, '').trim());
}

export function UrgentModal({ onClose, onAssigned, draft: initial, fromRequest, prefill }: { onClose: () => void; onAssigned: (vetId: string, visitId: string, arrive: number) => void; draft?: Visit; fromRequest?: boolean; prefill?: boolean }) {
  const { s, act, toast } = useApp();
  const w = s.world;
  const [step, setStep] = useState<'form' | 'suggest'>(initial ? 'suggest' : 'form');
  const [f, setF] = useState<UrgentForm>(prefill ? EXAMPLE_FORM : EMPTY_FORM);
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const [addrFocus, setAddrFocus] = useState(false);
  const blurT = useRef<number | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<Visit | null>(initial ?? null);
  const [sel, setSel] = useState<string | null>(null);
  const akut = f.urg !== 'idag';
  const place = locate(f);

  // Addresses we already know (today's customers and earlier visits), offered while typing.
  const known = useMemo(() => {
    const m = new Map<string, { street: string; postal: string; area: string; who?: string }>();
    for (const v of Object.values(w.visits)) m.set(lc(v.address.street), { street: v.address.street, postal: v.address.postal, area: v.address.area, who: `${v.owner.first} ${v.owner.last}`.trim() });
    for (const a of ADDRESS_BOOK) if (!m.has(lc(a.street))) m.set(lc(a.street), { street: a.street, postal: a.postal, area: a.area });
    return [...m.values()];
  }, [w.visits]);
  const q = lc(f.street);
  const matches = addrFocus && q.length >= 2 ? known.filter((k) => lc(k.street).includes(q) && lc(k.street) !== q).slice(0, 4) : [];

  const missing = [!f.street.trim() && 'adress', f.street.trim() && !place && 'stadsdel', !f.reason.trim() && 'anledning'].filter(Boolean) as string[];

  const build = (): Visit => {
    const pl = place!;
    const [first, ...rest] = f.owner.trim().split(' ');
    const postal = (f.place.match(/\d{3}\s?\d{2}/) ?? [''])[0];
    const window = akut ? { from: w.now, to: w.now + Number(f.urg) } : { from: w.now + 60, to: w.now + 240 };
    const access = f.access.split(',').map((x) => x.trim()).filter(Boolean);
    return {
      id: draft?.id ?? `v-new-${newSeq++}`,
      patient: { ...URGENT_PRESET.patient, name: f.name.trim() || 'Okänt djur', species: f.species, breed: f.breed.trim() || f.species, age: f.age.trim(), sex: f.example ? URGENT_PRESET.patient.sex : '', weight: f.example ? URGENT_PRESET.patient.weight : '' },
      owner: { first: first || 'Ägare', last: rest.join(' '), phone: f.phone.trim() },
      address: { street: f.street.trim(), area: pl.area, postal }, loc: pl.loc,
      reason: f.reason.trim(), kind: f.kind, duration: f.duration, note: f.note.trim() || undefined,
      window, priority: akut ? 'akut' : 'normal', vetId: '', status: 'planerad', actual: {}, extension: 0,
      flags: f.example ? URGENT_PRESET.flags : {}, access: access.length ? access : ['Ring ägaren vid ankomst'],
      flexible: !akut, flexWindow: !akut ? window : undefined,
    };
  };
  const visits = draft ? { ...w.visits, [draft.id]: draft } : w.visits;
  // Recompute when the world changes (a vet may move on while the modal is open), so the suggestion is never stale.
  const sugs = useMemo(() => (draft ? suggest({ ...w, visits }, draft.id, visits) : []), [draft, w]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = sugs.find((x) => x.ok);
  const chosen = sugs.find((x) => x.vetId === (sel ?? best?.vetId));
  const prev = draft && chosen?.ok ? previewFromSuggestion({ ...w, visits }, draft.id, chosen, visits) : null;

  // Closing before assigning keeps the case under "Att hantera" (a reception request is already there).
  const close = () => {
    if (step === 'suggest' && draft && !fromRequest) { act.saveUrgentDraft(draft); toast(`${draft.patient.name} ligger kvar under Att hantera tills besöket är tilldelat`, 'info'); }
    onClose();
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal urgent" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nytt akutärende">
        <div className="modal-head">
          <span className={`mh-ic${akut ? ' crit' : ''}`}>{akut ? <LuSiren size={18} /> : <LuMapPin size={18} />}</span>
          <div>
            <h3>Nytt akutärende</h3>
            <p className="muted">{step === 'form' ? 'Bara det viktigaste. Vanliga bokningar görs i Provet.' : 'Inget läggs in förrän du väljer. Förslaget bygger på plats, tid och utrustning.'}</p>
          </div>
          <div className="steps" aria-hidden="true"><i className="on" /><i className={step === 'suggest' ? 'on' : ''} /></div>
          <CloseBtn onClick={close} />
        </div>

        {step === 'form' ? (
          <form className="uform" onSubmit={(e) => { e.preventDefault(); setTried(true); if (missing.length) return; const d = build(); setDraft(d); setSel(null); setShowAll(false); setStep('suggest'); }}>
            {!f.example && <button type="button" className="link demo-fill" onClick={() => setF(EXAMPLE_FORM)}>Fyll i exempel (demo)</button>}
            <div className="fgrid four">
              <label className="field"><span>Djurets namn</span><input id="u-name" value={f.name} placeholder="T.ex. Tessan" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
              <div className="field"><span>Djurslag</span>
                <div className="chips">
                  {SPECIES.map((sp) => <button type="button" key={sp} className={`chipbtn${f.species === sp ? ' on' : ''}`} onClick={() => setF({ ...f, species: sp })}>{sp}</button>)}
                </div>
              </div>
                <label className="field"><span>Ägare</span><input id="u-owner" value={f.owner} placeholder="För- och efternamn" onChange={(e) => setF({ ...f, owner: e.target.value })} /></label>
                <label className="field"><span>Telefon</span><input id="u-phone" value={f.phone} placeholder="07x-xxx xx xx" inputMode="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            </div>
            <div className="addr">
              <div className="fgrid addr-row">
                <div className="field addr-street"><span>Gatuadress</span>
                  <input id="u-street" value={f.street} placeholder="T.ex. Fleminggatan 97" autoComplete="off"
                    onFocus={() => { clearTimeout(blurT.current); setAddrFocus(true); }} onBlur={() => { blurT.current = window.setTimeout(() => setAddrFocus(false), 150); }}
                    onChange={(e) => { clearTimeout(blurT.current); setF({ ...f, street: e.target.value, areaFix: '' }); setAddrFocus(true); }} onKeyDown={(e) => { if (e.key === 'Escape') setAddrFocus(false); }} aria-invalid={tried && !f.street.trim()} />
                  {matches.length > 0 && (
                    <ul className="addr-sugg" role="listbox" aria-label="Kända adresser">
                      {matches.map((k) => (
                        <li key={k.street}><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { setF({ ...f, street: k.street, place: `${k.postal} ${k.area}`, areaFix: '' }); setAddrFocus(false); }}>
                          <LuMapPin size={14} /><b>{k.street}</b><span>{k.postal} {k.area}{k.who ? ` · ${k.who}` : ''}</span>
                        </button></li>
                      ))}
                    </ul>
                  )}
                </div>
                <label className="field"><span>Postnummer och ort</span><input id="u-place" value={f.place} placeholder="T.ex. 112 45 Stockholm" onChange={(e) => setF({ ...f, place: e.target.value, areaFix: '' })} /></label>
                <label className="field"><span>Portkod och åtkomst</span><input id="u-access" value={f.access} placeholder="T.ex. portkod 3408, 5 tr" onChange={(e) => setF({ ...f, access: e.target.value })} /></label>
              </div>
              {f.street.trim() && (place || tried || (f.place.trim() && !addrFocus)) && (place && !place.fixed
                ? <p className="addr-hit ok"><LuCheck size={14} />Hittad · {place.area}{place.how === 'känd adress' ? ' · känd adress' : ''}</p>
                : <div className={`addr-hit ${place ? 'ok' : 'warn'}`}>
                    {place ? <LuCheck size={14} /> : <LuCircleAlert size={14} />}
                    <span>{place ? 'Placerad i' : 'Hittar inte området. Skriv postnummer, eller välj stadsdel:'}</span>
                    <select aria-label="Välj stadsdel" value={f.areaFix} onChange={(e) => setF({ ...f, areaFix: e.target.value })}>
                      <option value="">Välj stadsdel…</option>
                      {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>)}
            </div>
            <div className="field"><span>Hur bråttom?</span>
              <div className="seg urg" role="radiogroup" aria-label="Hur bråttom">
                {URGENCY.map(([k, label]) => (
                  <button type="button" key={k} role="radio" aria-checked={f.urg === k} className={f.urg === k ? `on${k !== 'idag' ? ' crit' : ''}` : ''} onClick={() => setF({ ...f, urg: k })}>
                    {k === 'idag' ? <LuClock size={14} /> : <LuSiren size={14} />}{label}
                  </button>
                ))}
              </div>
              <em className="field-hint">Brådskan bedöms av receptionen eller veterinären. FieldVet planerar bara efter den.</em>
            </div>
            <div className="fgrid two">
              <label className="field"><span>Kort anledning</span><input id="u-reason" value={f.reason} placeholder="Vad har hänt? T.ex. kräks sedan i natt" onChange={(e) => setF({ ...f, reason: e.target.value })} aria-invalid={tried && !f.reason.trim()} /></label>
              <div className="field"><span>Typ av besök</span>
                <select id="u-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as VisitKind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{KIND[k].label}{KIND[k].needs ? ` (kräver ${KIND[k].needs!.join(', ').toLowerCase()})` : ''}</option>)}
                </select>
              </div>
            </div>
            <button type="button" className="link more-toggle" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Dölj fler uppgifter' : 'Ras, ålder, besökstid och notering'} (valfritt)<LuChevronDown size={14} className={more ? 'flip' : ''} /></button>
            {more && (
              <div className="fgrid">
                <label className="field"><span>Ras</span><input id="u-breed" value={f.breed} placeholder="T.ex. Labrador" onChange={(e) => setF({ ...f, breed: e.target.value })} /></label>
                <label className="field"><span>Ålder</span><input id="u-age" value={f.age} placeholder="T.ex. 12 år" onChange={(e) => setF({ ...f, age: e.target.value })} /></label>
                <div className="field"><span>Beräknad besökstid</span>
                  <div className="chips">
                    {[20, 30, 45, 60].map((d) => <button type="button" key={d} className={`chipbtn${f.duration === d ? ' on' : ''}`} onClick={() => setF({ ...f, duration: d })}>{d} min</button>)}
                  </div>
                </div>
                <label className="field span2"><span>Notering till veterinären</span><input id="u-note" value={f.note} placeholder="T.ex. hunden är rädd för främlingar" onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
              </div>
            )}
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={close}>Avbryt</button>
              {tried && missing.length > 0 && <span className="foot-miss">{missing.includes('stadsdel') && missing.length === 1 ? 'Välj stadsdel för adressen' : `Fyll i ${missing.map((m) => (m === 'stadsdel' ? 'stadsdel' : m)).join(' och ')}`}</span>}
              <button type="submit" className="btn primary" data-demo="find-team"><LuUsers size={15} />Hitta veterinär<LuArrowRight size={15} /></button>
            </div>
          </form>
        ) : (
          draft && (
            <div className="usuggest">
              <div className="us-left">
                <div className="us-case">
                  <PatientBadge v={draft} size={40} />
                  <div>
                    <b>{draft.patient.name} · {draft.patient.species.toLowerCase()}{draft.patient.age ? `, ${draft.patient.age}` : ''}</b>
                    <span className="muted">{draft.address.street}, {draft.address.area}</span>
                    <span className="muted">{draft.reason}</span>
                  </div>
                  <span className={`chip ${draft.priority === 'akut' ? 'st-crit' : 'st-plan'}`}>{draft.priority === 'akut' ? <LuCircleAlert size={13} /> : <LuClock size={13} />}{urgencyLabel(draft)}</span>
                </div>
                <h5 className="eyebrow"><LuSparkles size={13} />{best ? 'Förslag' : 'Inget team passar just nu'}</h5>
                <div className="sugs" data-demo="suggest-list">
                  {sugs.filter((sug) => showAll || !best || sug === best || sug.vetId === sel).map((sug, i) => (
                    <SuggestionRow key={sug.vetId} sug={sug} rank={i} best={sug === best} selected={chosen?.vetId === sug.vetId} onClick={() => setSel(sug.vetId)} />
                  ))}
                </div>
                {best && sugs.length > 1 && (
                  <button className="link alt-toggle" data-demo="other-teams" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? 'Dölj andra team' : `Visa andra team (${sugs.length - 1})`}<LuChevronDown size={14} className={showAll ? 'flip' : ''} /></button>
                )}
                <FitNote />
                {!best && <div className="why warn"><p><b>Inget team kan ta besöket inom vald tid.</b> Välj en längre tid under Hur bråttom, eller be ägaren komma in till kliniken.</p></div>}
              </div>
              <div className="us-right">
                {prev ? (
                  <CityMap
                    routes={VETS.map((v) => ({ vetId: v.id, color: v.color, plan: prev.plans[v.id], dim: v.id !== chosen!.vetId }))}
                    visits={prev.visits}
                    focus={[draft.loc, prev.plans[chosen!.vetId].pos, ...prev.plans[chosen!.vetId].stops.filter((x) => x.state !== 'klar').slice(0, 4).map((x) => prev.visits[x.id].loc)]}
                    focusKey={chosen!.vetId}
                    selectedVisit={draft.id}
                    compact
                    padPx={40}
                    controls={false}
                  />
                ) : (
                  <div className="map-empty">Inget team har kapacitet just nu.</div>
                )}
                {chosen?.ok && (
                  <div className="us-impact">
                    <b>{vetById(chosen.vetId).first}s dag efter ändringen</b>
                    <ol>
                      {prev!.plans[chosen.vetId].stops.filter((x) => x.state !== 'klar').slice(0, 5).map((x) => (
                        <li key={x.id} className={x.id === draft.id ? 'new' : ''}>
                          <span className="tnum">{hhmm(x.arrive)}</span>
                          {prev!.visits[x.id].patient.name}
                          {x.id === draft.id && <span className="tag t-new">Nytt</span>}
                          {chosen.windows[x.id] && <span className="tag t-time">ny tid</span>}
                          {x.id !== draft.id && x.late > LATE_TOL && <span className="tag t-late">{x.late} min sent</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <div className="modal-foot">
                <button className="btn ghost" onClick={() => setStep('form')}><LuArrowLeft size={15} />Ändra uppgifter</button>
                <button
                  className="btn primary"
                  data-demo="assign-urgent"
                  disabled={!chosen?.ok}
                  onClick={() => {
                    if (!act.addUrgent(draft, chosen!)) return;
                    const win = etaWindow(chosen!.arrive);
                    toast(`${draft.patient.name} tilldelad ${vetById(chosen!.vetId).first} ✓ · Framme ca ${hhmm(win.from)}–${hhmm(win.to)} · ${chosen!.addedLate === 0 ? 'Övriga besök påverkas inte' : 'Några besök blir senare'} · Ägaren informeras via Provet`, 'ok', { label: 'Ångra', run: act.undo });
                    onAssigned(chosen!.vetId, draft.id, chosen!.arrive);
                  }}
                >
                  <LuCheck size={15} />Tilldela {chosen ? vetById(chosen.vetId).first : ''}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export { LuX };
