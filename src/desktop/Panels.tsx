import { useState, type ReactNode } from 'react';
import { LuArrowLeft, LuBell, LuCircleCheck, LuInfo, LuKeyRound, LuMapPin, LuMessageSquare, LuPhone, LuTriangleAlert, LuClock, LuPackage, LuFileText, LuUserRoundCheck, LuCalendarX, LuArrowRightLeft, LuChevronRight, LuChevronDown, LuShieldCheck, LuMic, LuReceipt, LuFlag, LuCheck, LuLock, LuLockOpen, LuWifiOff, LuFileUp, LuSiren, LuMessageSquareText, LuX, LuHospital, LuBellRing, LuHistory, LuEllipsis } from 'react-icons/lu';
import { KIND, VETS, type Visit } from '../shared/data';
import { hhmm, LATE_TOL, vetById } from '../shared/engine';
import { Avatar, Flags, PatientBadge, SpeciesIcon, StopChip, StatusSteps } from '../ui';
import { capacityOf, capacityWords, nearestArea, TEAM_LABEL, teamLine, teamStatus } from '../shared/ops';
import { useApp, type Alert, type CustomerEta } from '../store';
import { COMM_LABEL } from '../shared/provet';

/* ——— Behöver åtgärdas: the one place for things that need a decision ——— */
const KICKER: Record<Alert['cat'], string> = { klinisk: 'Akut patient', drift: 'Planering', info: 'Meddelande' };
export function AlertCard({ a, onAction }: { a: Alert; onAction: (a: Alert) => void }) {
  const icon = a.kind === 'comm' ? <LuMessageSquareText size={16} /> : a.kind === 'handoff' ? <LuHospital size={16} /> : a.kind === 'urgent' ? <LuSiren size={16} /> : a.kind === 'ack' ? <LuBellRing size={16} />
    : a.kind === 'offline' ? <LuWifiOff size={16} /> : a.kind === 'journal' ? <LuFileText size={16} /> : a.kind === 'cancel' ? <LuCalendarX size={16} />
    : a.kind === 'message' ? <LuMessageSquare size={16} /> : a.kind === 'gap' ? <LuInfo size={16} /> : a.kind === 'import' ? <LuFileUp size={16} />
    : a.kind === 'eta' ? <LuMessageSquareText size={16} /> : a.kind === 'request' ? <LuArrowRightLeft size={16} /> : <LuClock size={16} />;
  return (
    <div className={`alert tone-${a.tone} cat-${a.cat}`} data-kind={a.kind}>
      <span className="alert-ic">{icon}</span>
      <div className="alert-body">
        <span className="alert-kicker">{a.kind === 'offline' ? 'Anslutning' : KICKER[a.cat]}</span>
        <div className="alert-title">{a.title}</div>
        <div className="alert-sub">{a.sub}</div>
      </div>
      <button className="btn sm alert-btn" onClick={() => onAction(a)}>{a.action}</button>
    </div>
  );
}

export function AlertList({ alerts, onAction, limit }: { alerts: Alert[]; onAction: (a: Alert) => void; limit?: number }) {
  const [all, setAll] = useState(false);
  if (!alerts.length)
    return (
      <div className="calm">
        <LuCircleCheck size={18} />
        <div>
          <b>Allt ser bra ut just nu</b>
          <span>Inga förseningar eller ärenden som väntar på dig.</span>
        </div>
      </div>
    );
  const shown = limit && !all ? alerts.slice(0, limit) : alerts;
  return (
    <div className="alerts">
      {shown.map((a) => <AlertCard key={a.id} a={a} onAction={onAction} />)}
      {limit && alerts.length > limit && (
        <button className="link more-alerts" onClick={() => setAll(!all)} aria-expanded={all}>
          {all ? 'Visa färre' : `Visa ${alerts.length - limit} till`}<LuChevronDown size={14} className={all ? 'flip' : ''} />
        </button>
      )}
    </div>
  );
}

/** A team in one quiet line when all is well; the extra context appears only when something deviates. */

export function VetDetail({ vetId, onBack, onVisit, selVisit, onAlert }: { vetId: string; onBack: () => void; onVisit: (id: string) => void; selVisit: string | null; onAlert: (a: Alert) => void }) {
  const { plans, s, toast, act, alerts } = useApp();
  const mine = alerts.filter((a) => a.vetId === vetId && !a.quiet && a.kind !== 'message');
  const p = plans[vetId];
  const vet = p.vet;
  const w = s.world;
  const behind = p.delay > 5 && p.state !== 'dagen-klar';
  return (
    <div className="panel">
      <div className="panel-head">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={18} /></button>
        <Avatar vet={vet} size={36} />
        <div className="ph-title">
          <b>{vet.name}</b>
          <span className="muted">{teamLine(p, w.visits)}{behind ? ` · ${p.delay} min efter` : ''}</span>
        </div>
      </div>
      <div className="vd-sum">
        <span><b className="tnum">{p.done} av {p.total}</b> klara</span>
        <span>Slutar ca <b className={`tnum${p.overtime > 5 ? ' warn-t' : ''}`}>{hhmm(p.endAt)}</b></span>
        <span className="vd-act">
          <button className="btn sm ghost" onClick={() => toast(`Samtal till ${vet.first} öppnas i telefonen (demo)`, 'info')}><LuPhone size={14} />Ring</button>
          <button className="btn sm ghost" onClick={() => { act.send(vet.id, 'samordnare', 'Hur går det? Hör av dig om du behöver hjälp.'); toast(`Meddelande skickat till ${vet.first}`); }}><LuMessageSquare size={14} />Meddelande</button>
        </span>
      </div>
      {mine.map((a) => (
        <button key={a.id} className={`ctx-alert cat-${a.cat}`} onClick={() => onAlert(a)}>
          {a.cat === 'klinisk' ? <LuSiren size={14} /> : <LuClock size={14} />}
          <span>{a.title}</span>
          <b>{a.action}<LuChevronRight size={14} /></b>
        </button>
      ))}
      <div className="stoplist">
        {p.stops.map((st, i) => {
          const v = w.visits[st.id];
          const ho = s.handoffs.find((h) => h.visitId === v.id);
          return (
            <button key={st.id} className={`stop${selVisit === st.id ? ' sel' : ''} st-${st.state}`} onClick={() => onVisit(st.id)}>
              <span className="stop-rail" style={{ ['--vc' as string]: vet.color }}>
                <i>{st.state === 'klar' ? '✓' : i + 1}</i>
              </span>
              <span className="stop-body">
                <span className="stop-top">
                  <b>{v.patient.name}</b>
                  <span className="muted">{v.address.area}</span>
                </span>
                <span className="stop-meta">
                  <span className="tnum">{st.state === 'klar' ? `klart ${hhmm(st.end)}` : `framme ${hhmm(st.arrive)}`}</span>
                  {v.priority === 'akut' && st.state !== 'klar' && <span className="tag t-akut"><LuSiren size={11} />Akut</span>}
                  {v.isNew && <span className="tag t-new">Ny</span>}
                  {v.movedFrom && <span className="tag t-moved">Från {vetById(v.movedFrom).first}</span>}
                  {v.locked && st.state === 'kommande' && <span className="tag t-lock"><LuLock size={11} />Låst tid</span>}
                  {ho && <span className="tag t-clinic"><LuHospital size={11} />{ho.status === 'bekraftad' && ho.outcome?.at != null ? `Klinik ${hhmm(ho.outcome.at)}` : 'Till klinik'}</span>}
                </span>
              </span>
              <StopChip state={st.state} late={st.late} />
            </button>
          );
        })}
        {!p.stops.length && <div className="muted pad">Inga besök.</div>}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="dsec">
      <h4>{icon}{title}</h4>
      {children}
    </section>
  );
}

/** Customer communication as one calm operational state. Provet sends; FieldVet shows what happened. */
function CommRow({ eta, v, vetFirst, onCustomer }: { eta?: CustomerEta; v: Visit; vetFirst: string; onCustomer?: () => void }) {
  const { act, toast } = useApp();
  const win = eta ? (eta.from === eta.to ? hhmm(eta.from) : `${hhmm(eta.from)}–${hhmm(eta.to)}`) : '';
  const call = () => toast(`Ring ${v.owner.first} ${v.owner.last} · ${v.owner.phone}`, 'info');
  if (!eta) return (
    <div className="dr-eta">
      <LuMessageSquareText size={16} />
      <span><b>Ingen tid skickad än</b><span className="muted">Provet skickar automatiskt när {vetFirst} börjar köra</span></span>
    </div>
  );
  if (eta.state === 'pending') return (
    <div className="dr-eta" role="status"><span className="spin" aria-hidden="true" /><span><b>Skickar via Provet…</b><span className="muted">{COMM_LABEL[eta.type]} · {win}</span></span>{onCustomer && <button className="link" data-demo="customer-view" onClick={onCustomer}>Visa meddelandet</button>}</div>
  );
  if (eta.state === 'failed') return (
    <div className="dr-eta failed" role="status">
      <LuTriangleAlert size={16} />
      <span><b>Kundmeddelandet kunde inte skickas</b><span className="muted">Provet svarar inte · {COMM_LABEL[eta.type]} {win}</span></span>
      <span className="dr-eta-acts"><button className="btn sm soft" onClick={() => act.retryComm(v.id)}>Försök igen</button><button className="link" onClick={call}>Kontakta ägaren</button></span>
    </div>
  );
  if (eta.state === 'blocked') return (
    <div className="dr-eta failed" role="status">
      <LuPhone size={16} />
      <span><b>{v.owner.first} tar inte emot sms</b><span className="muted">{eta.reason ?? 'Enligt Provet'} · ring {v.owner.phone}</span></span>
      <span className="dr-eta-acts"><button className="btn sm soft" onClick={() => { act.markOwnerInformed(v.id); toast(`${v.owner.first} är informerad ✓`); }}>Jag har ringt</button></span>
    </div>
  );
  const updated = eta.type === 'ETA_UPDATED' || eta.type === 'VETERINARIAN_DELAYED' || (eta.type === 'ARRIVAL_WINDOW_UPDATED' && eta.count > 1);
  return (
    <div className="dr-eta sent">
      <LuCheck size={16} />
      <span>
        <b>{eta.via === 'telefon' ? 'Ägaren informerad per telefon ✓' : updated ? 'Ny ankomsttid skickad via Provet ✓' : eta.kind === 'klinik' ? 'Ägaren har fått kliniktiden via Provet ✓' : 'Ägaren informerad via Provet ✓'}</b>
        <span className="muted">{eta.kind === 'klinik' ? `Tid på kliniken ${hhmm(eta.clinicAt ?? eta.arrive)}` : `${COMM_LABEL[eta.type]} · ${win}`} · skickat {hhmm(eta.sentAt)}</span>
      </span>
      {onCustomer && eta.via !== 'telefon' && <button className="link" data-demo="customer-view" onClick={onCustomer}>Visa skickat meddelande</button>}
    </div>
  );
}

export function VisitDrawer({ visitId, onBack, onReassign, onCancel, backLabel, onCustomer, onHandoff, onFix }: { visitId: string; onBack: () => void; onReassign: () => void; onCancel: () => void; backLabel: string; onCustomer?: () => void; onHandoff?: (id: string) => void; onFix?: (a: Alert) => void }) {
  const { s, plans, toast, act, can, alerts } = useApp();
  const [more, setMore] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [history, setHistory] = useState(false);
  const v = s.world.visits[visitId];
  const vet = vetById(v.vetId);
  const st = plans[vet.id].stops.find((x) => x.id === visitId);
  const cancelled = v.status === 'avbokad';
  const eta = s.eta[visitId];
  const ho = s.handoffs.find((h) => h.visitId === visitId);
  const issue = alerts.find((a) => a.visitId === visitId && !a.quiet && (a.kind === 'risk' || a.kind === 'eta'));
  const late = st && st.state !== 'klar' ? st.late : 0;
  const needs = KIND[v.kind].needs ?? [];
  return (
    <div className="panel drawer">
      <div className="panel-head">
        <button className="iconbtn" onClick={onBack} aria-label={backLabel}><LuArrowLeft size={18} /></button>
        <PatientBadge v={v} size={40} />
        <div className="ph-title">
          <b>{v.patient.name}{v.priority === 'akut' && !cancelled && v.status !== 'klar' && <span className="tag t-akut"><LuSiren size={11} />Akut</span>}</b>
          <span className="muted">{[v.patient.breed || v.patient.species, v.address.area].filter(Boolean).join(' · ')}{v.locked ? ' · låst tid' : ''}</span>
        </div>
        {cancelled ? <span className="chip st-plan">Avbokat</span> : st && <StopChip state={st.state} late={st.late} />}
      </div>

      <div className="dr-when">
        <div>
          <span className="muted">Bokad tid</span>
          <b className="tnum">{hhmm(v.window.from)}–{hhmm(v.window.to)}</b>
        </div>
        <div>
          <span className="muted">{st?.state === 'klar' ? 'Kom fram' : 'Beräknad ankomst'}</span>
          <b className={`tnum${late > LATE_TOL ? ' warn-t' : ''}`}>{st ? hhmm(st.arrive) : '–'}{st && st.state !== 'klar' && <em className={late > LATE_TOL ? 'late' : 'ok'}>{late > LATE_TOL ? ` ${late} min sen` : ' i tid'}</em>}</b>
        </div>
      </div>

      {!cancelled && <div className="dr-steps"><StatusSteps status={v.status} times={[v.window.from, v.actual.departedAt, v.actual.arrivedAt, v.actual.startedAt, v.actual.finishedAt]} /></div>}

      {issue && onFix && (
        <button className="ctx-alert cat-drift dr-ctx" onClick={() => onFix(issue)}>
          <LuClock size={14} /><span>{issue.title}</span><b>{issue.action}<LuChevronRight size={14} /></b>
        </button>
      )}
      {ho && (
        <div className={`dr-handoff ${ho.status}`}>
          <LuHospital size={16} />
          <span>
            <b>{ho.status === 'ny' ? 'Ska vidare till kliniken' : ho.status === 'avvaktar' ? 'Kliniktid väntar' : ho.outcome?.kind === 'akut' ? `Akut till kliniken, ca ${ho.outcome.label.replace('akut ', '')}` : `Kliniken tar emot ${ho.outcome?.label ?? ''}`}</b>
            <span className="muted">{ho.reason}</span>
          </span>
          {ho.status !== 'bekraftad' && onHandoff && <button className="btn sm soft" onClick={() => onHandoff(ho.id)}>Ordna</button>}
        </div>
      )}
      {!cancelled && (v.status !== 'klar' || eta) && (
        <CommRow eta={eta} v={v} vetFirst={vet.first} onCustomer={onCustomer} />
      )}

      <button className="dr-vet" onClick={onReassign} disabled={v.status !== 'planerad'}>
        <Avatar vet={vet} size={28} />
        <span><span className="muted">Veterinär</span><b>{vet.name}</b></span>
        {v.status === 'planerad' && <span className="link">Flytta besök <LuChevronRight size={14} /></span>}
      </button>

      <div className="dr-scroll">
        <Section icon={<LuFileText size={15} />} title="Anledning">
          <p className="lead">{v.reason}</p>
          <div className="row gap6 wrap">
            <span className="tag t-kind">{KIND[v.kind].label} · {v.duration + v.extension} min</span>
            <Flags v={v} />
          </div>
        </Section>
        <Section icon={<LuUserRoundCheck size={15} />} title="Ägare">
          <div className="owner">
            <div>
              <b>{v.owner.first} {v.owner.last}</b>
              <span className="muted tnum">{v.owner.phone}</span>
            </div>
            <div className="row gap6">
              <button className="btn sm ghost" onClick={() => toast(`Samtal till ${v.owner.first} öppnas i telefonen (demo)`, 'info')}><LuPhone size={14} />Ring</button>
            </div>
          </div>
        </Section>
        <Section icon={<LuMapPin size={15} />} title="Adress och åtkomst">
          <p><b>{v.address.street}</b>, {v.address.postal} {v.address.area}</p>
          <ul className="access">
            {v.access.map((a) => (
              <li key={a}>{/kod/i.test(a) ? <LuKeyRound size={14} /> : <LuInfo size={14} />}<span>{a}</span></li>
            ))}
          </ul>
        </Section>
        {needs.length > 0 && (
          <Section icon={<LuPackage size={15} />} title="Särskild utrustning">
            <p>{needs.map((n) => (n === 'Dropp' ? 'Droppaggregat' : n === 'Syrgas' ? 'Bärbar syrgas' : 'Bärbart ultraljud')).join(', ')}</p>
          </Section>
        )}
        {(v.status === 'klar' || v.journal) && <JournalSection v={v} />}
        <button className="link dr-history" onClick={() => setHistory(!history)} aria-expanded={history}><LuHistory size={14} />{history ? 'Dölj händelser' : 'Visa händelser'}</button>
        {history && <VisitTimeline v={v} />}
        <p className="privacy"><LuShieldCheck size={14} />Operativ vy. Journal och patienthistorik finns i Provet, inte här.</p>
      </div>

      {v.status === 'planerad' && (
        <div className="panel-foot">
          {confirmCancel ? (
            <div className="confirm-row">
              <span>Avboka {v.patient.name} {hhmm(v.window.from)}?</span>
              <button className="btn ghost" onClick={() => setConfirmCancel(false)}>Nej</button>
              <button className="btn danger-solid" onClick={() => { setConfirmCancel(false); onCancel(); }}>Ja, avboka</button>
            </div>
          ) : (
            <>
              <div className="more-wrap">
                <button className="btn ghost" onClick={() => setMore(!more)} aria-expanded={more}><LuEllipsis size={16} />Mer</button>
                {more && (
                  <div className="menu up" role="menu">
                    {can('visit:lock') && (
                      <button role="menuitem" onClick={() => { setMore(false); if (act.setLock(v.id, !v.locked)) toast(v.locked ? `${v.patient.name}: tiden är upplåst` : `${v.patient.name}: tiden är låst och flyttas inte automatiskt`, 'info', { label: 'Ångra', run: act.undo }); }}>
                        {v.locked ? <LuLockOpen size={15} /> : <LuLock size={15} />}{v.locked ? 'Lås upp tiden' : 'Lås tiden'}
                      </button>
                    )}
                    <button role="menuitem" className="danger" onClick={() => { setMore(false); setConfirmCancel(true); }}><LuCalendarX size={15} />Avboka besöket</button>
                  </div>
                )}
              </div>
              <button className="btn primary" onClick={onReassign}><LuArrowRightLeft size={15} />Flytta besök</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Everything that happened to this visit today, from the audit trail and the visit's own timestamps. */
const STATUS_ACTIONS = new Set(['Startade navigering', 'Markerade framme', 'Startade besök', 'Avslutade besök', 'Öppnade journalmodulen', 'Sparade journalutkast']);
export const cleanAction = (t: string) => t.replace(/ \((PV-[A-Z]+-\d+)(, simulerad koppling)?\)/g, '').replace(/ \(sms simuleras\)/g, '').replace(/ ?\(plan v\d+\)/g, '').replace(/ ?\(manuellt val, plan v\d+\)/g, '').replace(/ \(simulerad koppling\)/g, '');
function VisitTimeline({ v }: { v: Visit }) {
  const { s } = useApp();
  const first = vetById(v.vetId).first;
  const ev: { at: number; text: string; who?: string; tone?: 'clinic' | 'future' }[] = [];
  if (v.actual.departedAt != null) ev.push({ at: v.actual.departedAt, text: 'På väg', who: first });
  if (v.actual.arrivedAt != null) ev.push({ at: v.actual.arrivedAt, text: 'Framme', who: first });
  if (v.actual.startedAt != null) ev.push({ at: v.actual.startedAt, text: 'Besöket startade', who: first });
  if (v.actual.finishedAt != null) ev.push({ at: v.actual.finishedAt, text: 'Hembesöket klart', who: first });
  for (const e of s.audit) {
    if (e.target !== v.patient.name || STATUS_ACTIONS.has(e.action)) continue;
    // One line per customer message: Provet's confirmation, not the request before it.
    if (/^Bad Provet skicka|^Provet: meddelandet var redan|^Läste patienthistorik|^Öppnade hel anteckning|^Nekad: läsa patienthistorik/.test(e.action)) continue;
    ev.push({ at: e.at, text: cleanAction(e.action), who: e.role === 'system' ? 'System' : e.actor.split(' ')[0], tone: /klinik/i.test(e.action) ? 'clinic' : undefined });
  }
  const ho = s.handoffs.find((h) => h.visitId === v.id && h.status === 'bekraftad' && h.outcome?.at != null);
  if (ho) ev.push({ at: ho.outcome!.at!, text: ho.outcome!.kind === 'akut' ? 'Akut ankomst till kliniken' : `Klinikbesök: ${ho.reason.toLowerCase()}`, who: 'Kliniken', tone: 'future' });
  if (!ev.length) return <p className="muted small">Inga händelser än.</p>;
  ev.sort((a, b) => a.at - b.at);
  return (
    <Section icon={<LuHistory size={15} />} title="Händelser idag">
      <ol className="vtl">
        {ev.map((e, i) => (
          <li key={i} className={e.tone ?? ''}>
            <span className="tnum">{hhmm(e.at)}</span>
            <span>{e.text}{e.who && <em>{e.who}</em>}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Today's history, out of the way until asked for. */
export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { s } = useApp();
  // Plan changes only: routine Provet traffic and technical events stay in the audit log under System.
  const rows = [...s.audit].reverse().filter((e) => e.outcome !== 'nekad' && !(e.role === 'system' && /Provet|Dubblett|patienthistorik/.test(e.action))).slice(0, 40);
  return (
    <div className="panel">
      <div className="panel-head">
        <button className="iconbtn" onClick={onClose} aria-label="Tillbaka"><LuArrowLeft size={18} /></button>
        <span className="ph-ic"><LuHistory size={18} /></span>
        <div className="ph-title"><b>Ändringar idag</b><span className="muted">Vem ändrade vad, och när</span></div>
      </div>
      <div className="panel-scroll">
        <ol className="hist-list">
          {rows.map((e) => (
            <li key={e.id}>
              <span className="tnum">{hhmm(e.at)}</span>
              <span>{cleanAction(e.action)}{e.target ? <b> · {e.target}</b> : null}<em>{e.role === 'system' ? 'system' : `av ${e.actor.split(' ')[0]}`}</em></span>
            </li>
          ))}
        </ol>
        <p className="muted small">Hela granskningsloggen finns under System.</p>
      </div>
    </div>
  );
}

export function JournalTag({ v }: { v: Visit }) {
  const j = v.journal;
  if (j?.state === 'signerad') return <span className="tag t-ok">{j.syncedAt != null ? 'Journal skickad' : 'Journal signerad'}</span>;
  if (j) return <span className="tag t-time">Journalutkast</span>;
  return <span className="tag t-late">Journal saknas</span>;
}

function JournalSection({ v }: { v: Visit }) {
  const { toast } = useApp();
  const j = v.journal;
  const vet = vetById(v.vetId);
  return (
    <section className="dsec jr-coord">
      <h4><LuFileText size={15} />Journal och underlag</h4>
      <div className={`jr-status ${j?.state === 'signerad' ? 'ok' : j ? 'draft' : 'missing'}`}>
        {j?.state === 'signerad' ? <LuCircleCheck size={18} /> : <LuMic size={18} />}
        <div>
          <b>{j?.state === 'signerad' ? `Signerad av ${j.signedBy?.split(' ')[0] ?? vet.first} ${hhmm(j.signedAt ?? 0)}` : j ? 'Utkast, inte signerat' : 'Inte påbörjad'}</b>
          <span>{j?.state === 'signerad'
            ? (j.syncedAt != null ? 'Sparad i Provet (simulerad koppling)' : j.syncError ? `Inte skickad: ${j.syncError.toLowerCase()}. Försöks igen automatiskt från appen.` : j.pendingSync ? 'Väntar på att skickas till Provet' : 'Skickas…')
            : `${vet.first} dikterar i appen efter besöket`}</span>
        </div>
      </div>
      {j?.state === 'signerad' && (
        <>
          <div className="jr-under">
            <span className="muted"><LuReceipt size={14} />Debiteringsunderlag</span>
            <ul>
              {j.atgarder.map((a) => <li key={a}><LuCheck size={13} />{a}</li>)}
              {j.lakemedel.map((m) => <li key={m.name}><LuCheck size={13} />{m.name}</li>)}
            </ul>
          </div>
          {j.uppfoljning && (
            <div className="jr-follow">
              <LuFlag size={16} />
              <span><b>Uppföljning</b>{j.uppfoljning}. Detaljer finns i journalen.</span>
              <button className="btn sm soft" onClick={() => toast(`Uppföljning för ${v.patient.name} lagd som uppgift (demo)`)}>Boka</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function SpeciesLine({ v }: { v: Visit }) {
  return (
    <span className="sline">
      <SpeciesIcon s={v.patient.species} size={14} />
      {v.patient.name} · {v.patient.breed}
    </span>
  );
}

export function Bell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button className="iconbtn bell" onClick={onClick} aria-label={`Avvikelser och händelser, ${count}`}>
      <LuBell size={18} />
      {count > 0 && <span className="badge">{count}</span>}
    </button>
  );
}

export const allVets = VETS;

/** Compact card shown on the map when a team marker is clicked. */
export function TeamMapCard({ vetId, onClose, onMessage, onOpenVisit }: { vetId: string; onClose: () => void; onMessage: () => void; onOpenVisit: (id: string) => void }) {
  const { plans, s } = useApp();
  const p = plans[vetId];
  const vet = p.vet;
  const status = teamStatus(p);
  const cap = capacityOf(p, s.world.now);
  const capText = capacityWords(cap);
  const target = p.current && p.current.state !== 'pågår' && p.current.state !== 'framme' ? p.current : p.next;
  const nv = target ? s.world.visits[target.id] : null;
  return (
    <div className="teamcard" role="dialog" aria-label={`${vet.name}, ${TEAM_LABEL[status]}`}>
      <div className="tc-head">
        <Avatar vet={vet} size={30} />
        <div className="tc-name"><b>{vet.name}</b><span className="muted">{teamLine(p, s.world.visits)}</span></div>
        <button className="iconbtn sm" onClick={onClose} aria-label="Stäng teamkortet"><LuX size={15} /></button>
      </div>
      {nv && target ? (
        <button className="tc-next" onClick={() => onOpenVisit(nv.id)}>
          <span className="muted">Nästa</span>
          <b>{nv.patient.name}</b>
          <span className="muted">{nv.address.area}</span>
          <span className="tc-eta"><span className="muted">Framme</span> <b className="tnum">{hhmm(target.arrive)}</b></span>
          <span className={`tc-dev${p.delay > 5 ? ' late' : ''}`}>{p.delay > 5 ? `${p.delay} min efter plan` : 'Enligt plan'}{s.eta[nv.id] ? ' · ägaren informerad' : ''}</span>
        </button>
      ) : <div className="tc-next muted">Inga fler besök idag</div>}
      <div className="tc-foot">
        <span className="muted">{capText ?? `${cap.remaining} besök kvar · ${nearestArea(p.pos)}`}</span>
        <button className="btn sm ghost" onClick={onMessage}><LuMessageSquare size={14} />Meddelande</button>
      </div>
    </div>
  );
}
