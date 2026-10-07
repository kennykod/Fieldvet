import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuCalendarDays, LuChartColumn, LuCircleCheck, LuFileText, LuLayoutDashboard, LuList, LuMessagesSquare, LuSearch,
  LuShieldCheck, LuTriangleAlert, LuWandSparkles, LuSend, LuCar, LuRoute, LuStethoscope, LuClock, LuServerCog, LuHistory, LuHash, LuFileUp, LuEllipsis, LuSiren, LuMapPinOff,
} from 'react-icons/lu';
import { COORDINATOR, DAY_LABEL, KIND, VETS, type Visit } from '../shared/data';
import { dur, hhmm, LATE_TOL, optimizeDay, vetById, type Proposal } from '../shared/engine';
import { useApp, type Alert } from '../store';
import { CityMap, type MapRoute } from '../map';
import { Avatar, Logo, SpeciesIcon, StopChip } from '../ui';
import { NextHour, TeamBoard, type BoardMode } from './Board';
import { AlertList, HistoryPanel, JournalTag, TeamMapCard, VetDetail, VisitDrawer } from './Panels';
import { AssignPanel, FixPanel, ProposalModal, UrgentModal, type MapPreview } from './Smart';
import { SystemView } from './System';
import { opsSummary } from '../shared/ops';
import { SlackView, slackUnread } from './Slack';
import { ImportModal } from './Import';
import { CustomerEtaModal } from './Customer';
import { HandoffPanel } from './Handoff';
import { VoiceBubble } from '../mobile/Voice';

type View = 'idag' | 'lista' | 'meddelanden' | 'slack' | 'rapport' | 'system';
type Side =
  | { t: 'overview' }
  | { t: 'vet'; id: string }
  | { t: 'visit'; id: string; from?: Side }
  | { t: 'assign'; id: string; target?: string; from?: Side }
  | { t: 'fix'; alert: Alert }
  | { t: 'handoff'; id: string }
  | { t: 'history' };

export function Dashboard() {
  const { s, plans, alerts, act, toast, offlineSince } = useApp();
  const w = s.world;
  const [view, setView] = useState<View>('idag');
  const [side, setSide] = useState<Side>({ t: 'overview' });
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const [proposal, setProposal] = useState<{ p: Proposal; onApprove?: () => boolean; onReject?: () => void } | null>(null);
  const [urgent, setUrgent] = useState<null | { draft?: Visit; prefill?: boolean }>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [slackReq, setSlackReq] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [teamCard, setTeamCard] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [msgVet, setMsgVet] = useState('anna');
  const [mode, setMode] = useState<BoardMode>('nu');
  const [showMap, setShowMap] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const hoVisit = side.t === 'handoff' ? s.handoffs.find((h) => h.id === side.id)?.visitId ?? null : null;
  const selVet = side.t === 'vet' ? side.id : side.t === 'visit' || side.t === 'assign' ? w.visits[side.id]?.vetId ?? null : side.t === 'fix' ? side.alert.vetId ?? null : hoVisit ? w.visits[hoVisit]?.vetId ?? null : null;
  const selVisit = side.t === 'visit' || side.t === 'assign' ? side.id : side.t === 'fix' ? side.alert.visitId ?? null : hoVisit;

  useEffect(() => { if (side.t !== 'assign' && side.t !== 'fix') setPreview(null); }, [side]);
  /** Briefly highlight what changed after an approval. */
  const highlight = (ids: string[]) => { setFlash(new Set(ids)); setTimeout(() => setFlash(new Set()), 2600); };

  const attention = useMemo(() => alerts.filter((a) => !a.quiet), [alerts]);
  const lateIds = useMemo(() => new Set(Object.values(plans).flatMap((p) => p.stops.filter((x) => x.late > LATE_TOL && x.state !== 'klar').map((x) => x.id))), [plans]);

  // ——— map inputs ———
  const mapPlans = preview?.plans ?? plans;
  const mapVisits = preview?.visits ?? w.visits;
  const focusVets = preview?.vets ?? (selVet ? [selVet] : null);
  const routes: MapRoute[] = VETS.map((v) => ({ vetId: v.id, color: v.color, plan: mapPlans[v.id], dim: !!focusVets && !focusVets.includes(v.id), quiet: !focusVets }));
  if (preview?.ghost) for (const id of preview.vets) routes.unshift({ vetId: id, color: vetById(id).color, plan: preview.ghost[id], ghost: true });
  const focusPts = (() => {
    if (focusVets) return focusVets.flatMap((id) => [mapPlans[id].pos, ...mapPlans[id].stops.filter((x) => x.state !== 'klar').map((x) => mapVisits[x.id].loc)]);
    return [...Object.values(w.visits).filter((v) => v.status !== 'avbokad').map((v) => v.loc), ...VETS.map((v) => mapPlans[v.id].pos)];
  })();
  const focusKey = (focusVets ?? ['all']).join(',') + (preview ? ':p' : '') + '|' + (focusVets ?? []).map((id) => w.routes[id].join('.')).join('/');

  const onAlert = (a: Alert) => {
    setView('idag');
    if (a.kind === 'risk' || a.kind === 'overtime' || a.kind === 'request') setSide({ t: 'fix', alert: a });
    else if (a.kind === 'cancel') {
      const p = optimizeDay(w, { title: 'Ny rutt efter avbokning' });
      setProposal({
        p,
        onApprove: () => { if (!act.apply(p, 'Ny rutt efter avbokning')) return false; toast('Ny rutt godkänd ✓ · Berörda veterinärer har fått besked', 'ok', { label: 'Ångra', run: act.undo }); return true; },
        onReject: () => { act.rejectEvent(a.id); if (p.changes.length) toast('Planen är oförändrad.', 'info'); },
      });
    } else if (a.kind === 'message') { setView('meddelanden'); setMsgVet(a.vetId!); act.markRead(a.vetId!); }
    else if (a.kind === 'gap' && a.vetId) setSide({ t: 'vet', id: a.vetId });
    else if (a.kind === 'import') act.dismissImport();
    else if (a.kind === 'eta' && a.visitId) {
      const st = plans[a.vetId!]?.stops.find((x) => x.id === a.visitId);
      if (st) { act.sendEta(a.visitId, st.arrive); toast(`Ny tid skickas via Provet ✓ · ${w.visits[a.visitId].owner.first} får veta att ${vetById(a.vetId!).first} kommer ca ${hhmm(st.arrive)}`); }
    } else if (a.kind === 'comm' && a.visitId) {
      if (s.eta[a.visitId]?.state === 'failed') { act.retryComm(a.visitId); toast('Skickar igen via Provet (samma meddelande, ingen dubblett)', 'info'); }
      else setSide({ t: 'visit', id: a.visitId });
    } else if (a.kind === 'urgent') {
      const d = a.draftId ? s.pendingUrgent.find((x) => x.id === a.draftId) : undefined;
      if (d) { act.dropUrgentDraft(d.id); setSlackReq(null); setUrgent({ draft: d }); } else { setSlackReq(a.threadId ?? null); setUrgent({ prefill: true }); }
    } else if (a.kind === 'handoff' && a.handoffId) setSide({ t: 'handoff', id: a.handoffId });
    else if ((a.kind === 'ack' || a.kind === 'journal') && a.visitId) setSide({ t: 'visit', id: a.visitId });
    else if (a.kind === 'offline' && a.vetId) setSide({ t: 'vet', id: a.vetId });
  };

  const optimizeAll = () => setProposal({ p: optimizeDay(w, { title: 'Ny ordning för dagen' }) });

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return Object.values(w.visits).filter((v) =>
      [v.patient.name, v.owner.first, v.owner.last, v.address.street, v.address.area, v.patient.breed].some((x) => x.toLowerCase().includes(t)),
    ).slice(0, 6);
  }, [q, w.visits]);

  const ops = useMemo(() => opsSummary(plans, w), [plans, w]);
  const n = attention.length;
  const clinicalOpen = attention.some((a) => a.cat === 'klinisk');

  // Keyboard: N new urgent case, / search, Esc back to the overview, Ctrl/Cmd+Z undo. Never while typing or in a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.closest('.modal-back'))) return;
      if (document.querySelector('.modal-back')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); act.undo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setUrgent({}); }
      else if (e.key === '/') { e.preventDefault(); setView('idag'); searchRef.current?.focus(); }
      else if (e.key === 'Escape') setSide({ t: 'overview' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  return (
    <div className="dash" data-plan={w.planVersion}>
      <nav className="rail" aria-label="Huvudmeny">
        <Logo size={34} word={false} />
        <div className="rail-items">
          {([
            ['idag', <LuLayoutDashboard size={20} />, 'Idag'],
            ['lista', <LuList size={20} />, 'Besök'],
            ['meddelanden', <LuMessagesSquare size={20} />, 'Meddelanden'],
            ['slack', <LuHash size={20} />, 'Slack'],
            ['rapport', <LuChartColumn size={20} />, 'Rapport'],
            ['system', <LuServerCog size={20} />, 'System'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} className={`rail-btn${view === id ? ' on' : ''}${id === 'rapport' ? ' sep' : ''}${id === 'rapport' || id === 'system' ? ' minor' : ''}`} onClick={() => setView(id)} aria-current={view === id ? 'page' : undefined}>
              {icon}
              <span>{label}</span>
              {id === 'meddelanden' && s.messages.some((m) => m.from === 'vet' && !m.read) && <i className="dot" />}
              {id === 'slack' && slackUnread(s.slack, w.now) > 0 && <i className="dot" />}
            </button>
          ))}
        </div>
        <div className="rail-me" title={`${COORDINATOR.name}, ${COORDINATOR.role}. Inloggad som samordnare (demo)`}>
          <div className="rail-user">MA</div>
          <span className="rail-role">Samordnare</span>
        </div>
      </nav>

      <div className="dmain">
        <header className="topbar">
          <div className="tb-title">
            <h1>{view === 'idag' ? 'Idag' : view === 'lista' ? 'Alla besök' : view === 'meddelanden' ? 'Meddelanden' : view === 'slack' ? 'Slack-trådar' : view === 'system' ? 'System och behörigheter' : 'Rapport'}</h1>
            {view === 'idag' ? (
              <div className="daysum" aria-label="Dagen just nu">
                <button className={`ds-state ${clinicalOpen ? 'crit' : n ? 'warn' : 'ok'}`} onClick={() => setSide({ t: 'overview' })} data-demo="risk-summary">
                  {n ? <LuTriangleAlert size={14} /> : <LuCircleCheck size={14} />}
                  {n ? `${n} behöver din uppmärksamhet` : 'Allt ser bra ut'}
                </button>
                <span><b className="tnum">{ops.all}</b> besök idag</span>
                <span><b className="tnum">{ops.done}</b> klara</span>
                {ops.urgentSlots > 0 && <span><b className="tnum">{ops.urgentSlots}</b> {ops.urgentSlots === 1 ? 'möjlig akutlucka' : 'möjliga akutluckor'}</span>}
              </div>
            ) : <span className="muted"><LuCalendarDays size={14} />{DAY_LABEL}</span>}
          </div>
          <div className="search">
            <LuSearch size={16} />
            <input id="search" ref={searchRef} placeholder="Sök djur, ägare eller adress" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök" />
            {results.length > 0 && (
              <div className="search-res">
                {results.map((v) => (
                  <button key={v.id} onClick={() => { setQ(''); setView('idag'); setSide({ t: 'visit', id: v.id }); }}>
                    <SpeciesIcon s={v.patient.species} size={16} />
                    <span><b>{v.patient.name}</b> <span className="muted">· {v.owner.first} {v.owner.last} · {v.address.street}</span></span>
                    <span className="muted tnum">{hhmm(v.window.from)} · {vetById(v.vetId).first}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tb-right">
            <div className="more-wrap">
              <button className="btn ghost" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu"><LuEllipsis size={16} />Mer</button>
              {menu && (
                <div className="menu" role="menu" onClick={() => setMenu(false)}>
                  <button role="menuitem" onClick={() => { setView('idag'); optimizeAll(); }}><LuWandSparkles size={15} /><span><b>Se förslag för hela dagen</b><em>Bättre ordning och kortare körning</em></span></button>
                  <button role="menuitem" onClick={() => setImporting(true)}><LuFileUp size={15} /><span><b>Importera bokningar</b><em>Reservväg: Excel eller CSV från Provet</em></span></button>
                  <button role="menuitem" onClick={() => { setView('idag'); setSide({ t: 'history' }); }}><LuHistory size={15} /><span><b>Visa ändringar idag</b><em>Vem ändrade vad · plan v{w.planVersion}</em></span></button>
                </div>
              )}
            </div>
            <button className="btn primary" onClick={() => setUrgent({})} title="Nytt akutärende (N)"><LuSiren size={16} />Nytt akutärende</button>
          </div>
        </header>

        {view === 'idag' && (
          <div className="work v2">
            <div className="plancol">
              <TeamBoard
                mode={mode}
                setMode={setMode}
                showMap={showMap}
                setShowMap={setShowMap}
                selVet={selVet}
                selVisit={selVisit}
                flash={flash}
                onVisit={(id) => setSide({ t: 'visit', id })}
                onVet={(id) => setSide(selVet === id && side.t === 'vet' ? { t: 'overview' } : { t: 'vet', id })}
                onAlert={onAlert}
                onDrop={(visitId, toVet) => setSide({ t: 'assign', id: visitId, target: toVet })}
              />
              {(showMap || preview) && (
                <section className="mapcard" aria-label="Karta">
                <div className="mapcard-head">
                  <h2>Karta</h2>
                  {side.t === 'vet' && selVet ? (
                    <span className="mc-focus"><Avatar vet={vetById(selVet)} size={18} />{vetById(selVet).first}s rutt<button className="link" onClick={() => setSide({ t: 'overview' })}>Visa alla</button></span>
                  ) : <span className="muted">Var teamet är just nu</span>}
                  <div className="mc-legend" aria-hidden="true">
                    <span><i className="ml-vet" />Veterinär</span>
                    <span><i className="ml-next">1</i>Nästa besök</span>
                    <span><i className="ml-late" />Försenat</span>
                  </div>
                  {!preview && <button className="btn ghost sm" onClick={() => setShowMap(false)}><LuMapPinOff size={15} />Dölj karta</button>}
                </div>
                <div className="mapwrap below">
                  <CityMap
                    routes={routes}
                    visits={mapVisits}
                    focus={focusPts}
                    focusKey={focusKey}
                    selectedVisit={selVisit}
                    lateIds={lateIds}
                    staleVets={offlineSince != null ? new Set([w.manualVet]) : undefined}
                    padPx={{ t: 36, r: 56, b: 36, l: 40 }}
                    onVisitClick={(id) => setSide({ t: 'visit', id, from: side.t === 'vet' ? side : undefined })}
                    onVetClick={(id) => { setSide({ t: 'vet', id }); setTeamCard(id); }}
                    vetCard={teamCard && side.t === 'vet' && side.id === teamCard ? {
                      vetId: teamCard,
                      node: <TeamMapCard vetId={teamCard} onClose={() => setTeamCard(null)} onMessage={() => { setMsgVet(teamCard); setView('meddelanden'); }} onOpenVisit={(id) => { setTeamCard(null); setSide({ t: 'visit', id, from: side }); }} />,
                    } : null}
                    overlay={
                      <>
                        {preview && <div className="map-banner"><LuWandSparkles size={14} />Förhandsvisning · streckad linje visar nuvarande rutt</div>}
                      </>
                    }
                  />
                </div>
                </section>
              )}
            </div>
              <aside className="side">
                {side.t === 'overview' && (
                  <div className="panel">
                    <div className="side-sec attention">
                      <div className="sec-head"><h2>Behöver åtgärdas</h2>{n > 0 && <span className="count">{n}</span>}</div>
                      <AlertList alerts={attention} onAction={onAlert} limit={3} />
                    </div>
                    <div className="side-sec grow">
                      <div className="sec-head"><h2>Nästa timme</h2><span className="muted tnum">{hhmm(w.now)}–{hhmm(w.now + 75)}</span></div>
                      <NextHour onVisit={(id) => setSide({ t: 'visit', id })} />
                    </div>
                  </div>
                )}
                {side.t === 'vet' && (
                  <VetDetail vetId={side.id} selVisit={selVisit} onAlert={onAlert} onBack={() => setSide({ t: 'overview' })} onVisit={(id) => setSide({ t: 'visit', id, from: side })} />
                )}
                {side.t === 'visit' && (
                  <VisitDrawer
                    key={side.id}
                    visitId={side.id}
                    backLabel="Tillbaka"
                    onBack={() => setSide(side.from ?? { t: 'overview' })}
                    onReassign={() => setSide({ t: 'assign', id: side.id, from: side })}
                    onCancel={() => { const name = w.visits[side.id].patient.name; if (!act.cancel(side.id)) return; toast(`${name} avbokad ✓ · Ägaren och veterinären har fått besked`, 'ok', { label: 'Ångra', run: act.undo }); setSide({ t: 'overview' }); }}
                    onCustomer={() => setCustomer(side.id)}
                    onHandoff={(id) => setSide({ t: 'handoff', id })}
                    onFix={(a) => onAlert(a)}
                  />
                )}
                {side.t === 'assign' && (
                  <AssignPanel key={side.id + (side.target ?? '')} visitId={side.id} target={side.target} onPreview={setPreview} onDone={(_vetId, visitId) => { setPreview(null); setSide({ t: 'overview' }); highlight([visitId]); }} onClose={() => { setPreview(null); setSide(side.from ?? { t: 'overview' }); }} />
                )}
                {side.t === 'fix' && (
                  <FixPanel key={side.alert.id} alert={side.alert} onAssign={(id, target) => setSide({ t: 'assign', id, target, from: side })} onEtaSent={(id) => setSide({ t: 'visit', id })} onApproved={highlight} onPreview={setPreview} onClose={() => { setPreview(null); setSide({ t: 'overview' }); }} onOpenProposal={(p) => setProposal({ p, onApprove: () => { if (!act.apply(p)) return false; toast(`${p.title} ✓ · Berörda veterinärer har fått besked`, 'ok', { label: 'Ångra', run: act.undo }); setSide({ t: 'overview' }); return true; } })} />
                )}
                {side.t === 'handoff' && (
                  <HandoffPanel key={side.id} id={side.id} onClose={() => setSide({ t: 'overview' })} onDone={(visitId) => setSide({ t: 'visit', id: visitId })} />
                )}
                {side.t === 'history' && <HistoryPanel onClose={() => setSide({ t: 'overview' })} />}
              </aside>
          </div>
        )}

        {view === 'lista' && <ListView onOpen={(id) => { setView('idag'); setSide({ t: 'visit', id }); }} />}
        {view === 'meddelanden' && <MessagesView vetId={msgVet} setVetId={setMsgVet} />}
        {view === 'rapport' && <ReportView />}
        {view === 'slack' && <SlackView onOpenVisit={(id) => { setView('idag'); setSide({ t: 'visit', id }); }} onCreateVisit={(threadId) => { setSlackReq(threadId); setUrgent({ prefill: true }); }} />}
        {view === 'system' && <SystemView />}
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); act.dismissImport(); }} />}
      {urgent && (
        <UrgentModal
          draft={urgent.draft}
          prefill={urgent.prefill}
          fromRequest={!!slackReq}
          onClose={() => { setUrgent(null); setSlackReq(null); }}
          onAssigned={(vetId, visitId, arrive) => {
            if (slackReq) act.slackLinkVisit(slackReq, visitId, vetId, hhmm(arrive));
            setUrgent(null); setSlackReq(null); setView('idag'); setSide({ t: 'overview' }); highlight([visitId]);
          }}
        />
      )}
      {customer && <CustomerEtaModal visitId={customer} onClose={() => setCustomer(null)} />}
      {proposal && (
        <ProposalModal
          proposal={proposal.p}
          onClose={() => setProposal(null)}
          onReject={proposal.onReject ? () => { proposal.onReject!(); setProposal(null); } : undefined}
          onApprove={() => {
            const done = proposal.onApprove ? proposal.onApprove() : act.apply(proposal.p) && (toast(`${proposal.p.title} ✓ · Berörda veterinärer har fått besked`, 'ok', { label: 'Ångra', run: act.undo }), true);
            if (done) { highlight(proposal.p.changes.map((c) => c.visitId).filter(Boolean) as string[]); setProposal(null); }
          }}
        />
      )}
    </div>
  );
}

/* ——— Secondary list view ——— */
function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const { s, plans } = useApp();
  const rows = Object.values(plans).flatMap((p) => p.stops.map((st) => ({ st, v: s.world.visits[st.id], vet: p.vet })));
  const cancelled = Object.values(s.world.visits).filter((v) => v.status === 'avbokad');
  rows.sort((a, b) => a.st.arrive - b.st.arrive);
  return (
    <div className="listview">
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Tidsfönster</th><th>Djur</th><th>Anledning</th><th>Ägare</th><th>Område</th><th>Veterinär</th><th>ETA</th><th>Status</th><th>Journal</th></tr>
          </thead>
          <tbody>
            {rows.map(({ st, v, vet }) => (
              <tr key={v.id} onClick={() => onOpen(v.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(v.id)}>
                <td className="tnum">{hhmm(v.window.from)}–{hhmm(v.window.to)}</td>
                <td><span className="sline"><SpeciesIcon s={v.patient.species} size={15} /><b>{v.patient.name}</b><span className="muted">{v.patient.breed}</span></span></td>
                <td>{KIND[v.kind].label}{v.priority === 'akut' && <span className="tag t-late">Akut</span>}</td>
                <td>{v.owner.first} {v.owner.last}</td>
                <td>{v.address.area}</td>
                <td><span className="sline"><Avatar vet={vet} size={20} />{vet.first}</span></td>
                <td className="tnum">{hhmm(st.arrive)}</td>
                <td><StopChip state={st.state} late={st.late} /></td>
                <td>{st.state === 'klar' ? <JournalTag v={v} /> : <span className="muted">–</span>}</td>
              </tr>
            ))}
            {cancelled.map((v) => (
              <tr key={v.id} className="cancelled">
                <td className="tnum">{hhmm(v.window.from)}</td>
                <td><span className="sline"><SpeciesIcon s={v.patient.species} size={15} /><b>{v.patient.name}</b></span></td>
                <td>{KIND[v.kind].label}</td>
                <td>{v.owner.first} {v.owner.last}</td>
                <td>{v.address.area}</td>
                <td>{vetById(v.vetId).first}</td>
                <td>–</td>
                <td><span className="chip st-plan">Avbokat</span></td>
                <td>–</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ——— Messages ——— */
function MessagesView({ vetId, setVetId }: { vetId: string; setVetId: (id: string) => void }) {
  const { s, act } = useApp();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const thread = s.messages.filter((m) => m.vetId === vetId);
  useEffect(() => { act.markRead(vetId); end.current?.scrollIntoView({ block: 'end' }); }, [vetId, thread.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = (t: string) => { if (!t.trim()) return; act.send(vetId, 'samordnare', t.trim()); setText(''); };
  return (
    <div className="msgview">
      <div className="threads">
        {VETS.map((v) => {
          const last = [...s.messages].reverse().find((m) => m.vetId === v.id);
          const unread = s.messages.some((m) => m.vetId === v.id && m.from === 'vet' && !m.read);
          return (
            <button key={v.id} className={`thread${vetId === v.id ? ' on' : ''}`} onClick={() => setVetId(v.id)}>
              <Avatar vet={v} size={36} />
              <span>
                <b>{v.name}</b>
                <span className="muted">{last ? (last.voice ? `Röstmeddelande: ${last.text}` : last.text) : 'Inga meddelanden'}</span>
              </span>
              {unread && <i className="dot" />}
            </button>
          );
        })}
      </div>
      <div className="chat">
        <div className="chat-head"><Avatar vet={vetById(vetId)} size={32} /><b>{vetById(vetId).name}</b><span className="muted">{vetById(vetId).phone}</span></div>
        <div className="chat-body">
          {thread.map((m) => m.voice ? <VoiceBubble key={m.id} m={m} mine={m.from === 'samordnare'} /> : (
            <div key={m.id} className={`bubble ${m.from === 'samordnare' ? 'me' : m.from === 'system' ? 'sys' : 'them'}`}>
              <span>{m.text}</span>
              <time className="tnum">{hhmm(m.at)}</time>
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="quick">
          {['Uppfattat, tack!', 'Jag meddelar ägaren.', 'Ring mig när du kan.'].map((q) => <button key={q} className="chipbtn" onClick={() => send(q)}>{q}</button>)}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <input id="d-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Skriv till ${vetById(vetId).first}`} aria-label="Meddelande" />
          <button className="btn primary" type="submit"><LuSend size={15} />Skicka</button>
        </form>
      </div>
    </div>
  );
}

/* ——— End-of-day summary ——— */
function ReportView() {
  const { s, plans } = useApp();
  const ps = VETS.map((v) => plans[v.id]);
  const all = ps.reduce((a, p) => a + p.total, 0);
  const done = ps.reduce((a, p) => a + p.done, 0);
  const drive = ps.reduce((a, p) => a + p.driveMin, 0);
  const clinical = ps.reduce((a, p) => a + p.clinicalMin, 0);
  const km = ps.reduce((a, p) => a + p.km, 0);
  const lateVisits = ps.flatMap((p) => p.stops.filter((x) => x.late > LATE_TOL));
  const delayed = Object.values(s.world.visits).filter((v: Visit) => v.extension > 0 || (v.status === 'klar' && v.plannedArrive != null && (v.actual.arrivedAt ?? 0) - v.plannedArrive > LATE_TOL)).length;
  const cancelled = Object.values(s.world.visits).filter((v) => v.status === 'avbokad').length;
  const doneN = Object.values(s.world.visits).filter((v) => v.status === 'klar').length;
  const signed = Object.values(s.world.visits).filter((v) => v.status === 'klar' && v.journal?.state === 'signerad').length;
  const maxDay = Math.max(...ps.map((p) => p.vet.shift.end - p.vet.shift.start));
  return (
    <div className="report">
      <div className="rep-card summary">
        <div className="rep-head">
          <h2>Dagen i siffror</h2>
          <span className="muted">Prognos {DAY_LABEL.toLowerCase()}, uppdateras löpande. Klart hittills: {done} av {all} besök.</span>
        </div>
        <div className="kpis">
          <div><LuStethoscope size={18} /><b className="tnum">{all}</b><span>besök totalt</span></div>
          <div><LuCar size={18} /><b className="tnum">{dur(drive)}</b><span>körtid</span></div>
          <div><LuClock size={18} /><b className="tnum">{dur(clinical)}</b><span>klinisk tid</span></div>
          <div><LuRoute size={18} /><b className="tnum">{km.toFixed(0)} km</b><span>beräknad sträcka</span></div>
          <div className={lateVisits.length + delayed ? 'warn' : ''}><LuTriangleAlert size={18} /><b className="tnum">{lateVisits.length + delayed}</b><span>förseningar och överdrag</span></div>
          <div><LuFileText size={18} /><b className="tnum">{signed}<span className="of">/{doneN}</span></b><span>journaler signerade</span></div>
        </div>
        <p className="muted small">Klinisk tid utgör {Math.round((clinical / (clinical + drive)) * 100)} % av tiden ute i fält. {cancelled ? `${cancelled} avbokade besök.` : ''}</p>
      </div>
      <div className="rep-card">
        <div className="rep-head"><h2>Per veterinär</h2>
          <div className="tl-legend"><span><i className="lg-visit" />Klinisk tid</span><span><i className="lg-drive" />Körning</span><span><i className="lg-idle" />Ledigt</span></div>
        </div>
        <div className="bars">
          {ps.map((p) => {
            const len = p.vet.shift.end - p.vet.shift.start;
            const idle = Math.max(0, len - p.clinicalMin - p.driveMin);
            const W = (m: number) => `${(m / maxDay) * 100}%`;
            return (
              <div key={p.vet.id} className="barrow">
                <span className="sline"><Avatar vet={p.vet} size={24} /><b>{p.vet.first}</b></span>
                <div className="bar">
                  <i className="rb-clin" style={{ width: W(p.clinicalMin), background: p.vet.color }} title={`Klinisk tid ${dur(p.clinicalMin)}`} />
                  <i className="rb-drive" style={{ width: W(p.driveMin), color: p.vet.color }} title={`Körning ${dur(p.driveMin)}`} />
                  <i className="rb-idle" style={{ width: W(idle) }} title={`Ledigt ${dur(idle)}`} />
                </div>
                <span className="muted tnum">{p.total} besök · {dur(p.clinicalMin)} klinisk tid · {dur(p.driveMin)} körning · {p.km.toFixed(0)} km · klar {hhmm(p.endAt)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rep-row">
        <div className="rep-card">
          <div className="rep-head"><h2>Ändringar idag</h2></div>
          {s.history.length ? (
            <ul className="hist">{s.history.map((h, i) => <li key={i}><LuWandSparkles size={14} />{h}</li>)}</ul>
          ) : <p className="muted">Inga ändringar av morgonplanen ännu.</p>}
        </div>
        <div className="rep-card privacy-card">
          <div className="rep-head"><h2><LuShieldCheck size={18} />Data och integritet</h2></div>
          <p>Prototypen använder enbart fiktiva djur, ägare och adresser. Fältvyn visar bara det som behövs för besöket; journalen stannar i Provet och operativa anteckningar hålls åtskilda från kliniska.</p>
          <p className="muted">En produktionsversion kräver inloggning, rollbaserad åtkomst, loggning och spårbarhet, säkra integrationer mot boknings- och journalsystem samt en GDPR-granskning. Position visas bara för behöriga operativa roller under arbetstid.</p>
        </div>
      </div>
    </div>
  );
}
