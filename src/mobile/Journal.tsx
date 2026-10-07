import { useEffect, useRef, useState } from 'react';
import { LuWifiOff, LuBan } from 'react-icons/lu';
import {
  LuArrowLeft, LuCheck, LuChevronDown, LuCircleCheck, LuMic, LuPencil, LuPill, LuShieldCheck, LuSparkles,
  LuTriangleAlert, LuFlag, LuRefreshCw, LuSquare,
} from 'react-icons/lu';
import { hhmm, vetById } from '../shared/engine';
import { draftFor, requirements, type Journal } from '../shared/journal';
import { useApp } from '../store';
import { PatientBadge } from '../ui';

type Phase = 'intro' | 'recording' | 'processing' | 'draft' | 'signed';

export function JournalScreen({ visitId, onBack }: { visitId: string; onBack: () => void }) {
  const { s, act, toast, offlineSince, access, can } = useApp();
  const v = s.world.visits[visitId];
  const vet = vetById(v.vetId);
  const existing = v.journal;
  const [phase, setPhase] = useState<Phase>(existing?.state === 'signerad' ? 'signed' : existing ? 'draft' : 'intro');
  const [j, setJ] = useState<Journal>(() => existing ?? draftFor(v, s.world.now));
  const [heard, setHeard] = useState('');
  const [secs, setSecs] = useState(0);
  const [showRaw, setShowRaw] = useState(false);
  const [signing, setSigning] = useState(false);
  const tick = useRef<number>(0);
  const words = useRef<number>(0);

  useEffect(() => () => { clearInterval(tick.current); }, []);
  // Access to clinical content is checked (and audited) by the store, not just by hiding this screen.
  const allowed = can('journal:clinical') && v?.vetId === access.vetId;
  useEffect(() => { act.openJournal(visitId); }, [visitId]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep local copy in sync after signing (sync status arrives async)
  useEffect(() => { if (existing?.state === 'signerad') setJ(existing); }, [existing]);

  const all = j.transcript.split(' ');
  const record = () => {
    setPhase('recording'); setHeard(''); setSecs(0); words.current = 0;
    let t = 0;
    clearInterval(tick.current);
    tick.current = window.setInterval(() => {
      t += 1;
      if (t % 10 === 0) setSecs((x) => x + 1);
      if (t % 2 === 0 && words.current < all.length) { words.current += 1; setHeard(all.slice(0, words.current).join(' ')); }
    }, 55);
  };
  const stop = () => {
    clearInterval(tick.current);
    setHeard(j.transcript);
    setPhase('processing');
    setTimeout(() => { setPhase('draft'); act.saveJournal(visitId, j); }, 1400);
  };
  const writeSelf = () => {
    const blank: Journal = { ...j, transcript: '', anamnes: '', status: '', bedomning: '', lakemedel: [], rad: '', uppfoljning: undefined, flags: [], atgarder: [] };
    setJ(blank); setPhase('draft'); act.saveJournal(visitId, blank);
  };
  const upd = (patch: Partial<Journal>) => setJ((x) => { const n = { ...x, ...patch }; act.saveJournal(visitId, n); return n; });
  const resolve = (id: string, value?: string) => {
    let meds = j.lakemedel;
    if (id === 'batch' && value) meds = meds.map((m, k) => (k === 0 ? { ...m, strength: `${m.strength} · batch ${value}` } : m));
    if (id === 'dose' && value) meds = meds.map((m) => (m.dose ? m : { ...m, dose: value }));
    upd({ lakemedel: meds, flags: j.flags.map((f) => (f.id === id ? { ...f, resolved: true, value: value ?? f.value } : f)) });
  };

  const reqs = requirements(j);
  const open = j.flags.filter((f) => !f.resolved);
  const ready = reqs.every((r) => r.ok);

  return (
    <div className="mscreen journal">
      <div className="mtop">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={20} /></button>
        <span>Journal</span>
        <span className="muted tnum">{hhmm(v.actual.startedAt ?? s.world.now)}</span>
      </div>
      <div className="iv-head">
        <PatientBadge v={v} size={44} />
        <div><b>{v.patient.name}</b><span className="muted">{v.patient.species} · {v.patient.breed} · {v.owner.first} {v.owner.last}</span></div>
      </div>

      {!allowed && (
        <section className="mcard calm-m offline"><LuBan size={20} /><div><b>Ingen behörighet</b><span className="muted">Bara den behandlande veterinären kan läsa och signera journalen.</span></div></section>
      )}
      {allowed && phase === 'intro' && (
        <section className="jr-intro">
          <button className="jr-mic" onClick={record} aria-label="Börja diktera"><LuMic size={40} /></button>
          <h2>Berätta om besöket</h2>
          <p>Prata som du skulle skriva. AI gör om det till ett journalutkast som du granskar och signerar.</p>
          <button className="link" onClick={writeSelf}><LuPencil size={14} />Skriv själv i stället</button>
          <p className="jr-fine"><LuShieldCheck size={14} />Ljudet sparas inte. Bara du kan signera. I prototypen simuleras inspelningen.</p>
        </section>
      )}

      {allowed && phase === 'recording' && (
        <section className="jr-rec">
          <div className="jr-rec-top">
            <span className="rec-dot" />Spelar in
            <span className="tnum">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
          </div>
          <div className="jr-wave" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 73) % 900}ms` }} />)}</div>
          <p className="jr-live">{heard}<span className="caret" /></p>
          <button className="jr-stop" onClick={stop} aria-label="Klar"><LuSquare size={22} /><span>Klar</span></button>
        </section>
      )}

      {allowed && phase === 'processing' && (
        <section className="jr-proc">
          <span className="jr-proc-ic"><LuSparkles size={24} /></span>
          <b>Skriver journalutkast</b>
          <span className="muted">Anamnes, status, bedömning, åtgärder och läkemedel</span>
          <div className="skel"><i /><i /><i style={{ width: '70%' }} /><i /><i style={{ width: '55%' }} /></div>
        </section>
      )}

      {allowed && phase === 'draft' && (
        <>
          <div className="jr-banner">
            <LuSparkles size={16} />
            <span><b>AI-utkast.</b> Kontrollera innan du signerar.{open.length ? ` ${open.length} markering att åtgärda.` : ''}</span>
          </div>
          <div className="jr-reqs" aria-label="Journalkrav">
            {reqs.map((r) => <span key={r.label} className={r.ok ? 'ok' : 'miss'}>{r.ok ? <LuCheck size={13} /> : <LuTriangleAlert size={13} />}{r.label}</span>)}
          </div>
          <Field label="Anamnes" value={j.anamnes} onChange={(x) => upd({ anamnes: x })} />
          <Field label="Status" value={j.status} onChange={(x) => upd({ status: x })} />
          <Field label="Bedömning" value={j.bedomning} onChange={(x) => upd({ bedomning: x })} />
          <section className="mcard jr-sec">
            <h3>Åtgärder</h3>
            <div className="tchips">{j.atgarder.map((a) => <span key={a} className="chipbtn on static"><LuCheck size={13} />{a}</span>)}{!j.atgarder.length && <span className="muted">Inga åtgärder</span>}</div>
          </section>
          {j.lakemedel.length > 0 && (
            <section className="mcard jr-sec">
              <h3><LuPill size={15} />Läkemedel</h3>
              {j.lakemedel.map((m, i) => {
                const firstNoDose = j.lakemedel.findIndex((x) => !x.dose);
                const flag = j.flags.find((f) => f.field === 'lakemedel' && !f.resolved && (f.id === 'dose' ? i === firstNoDose : i === 0));
                return (
                  <div key={i} className={`med${flag ? ' flagged' : ''}`}>
                    <b>{m.name}</b>
                    <dl>
                      <div><dt>Styrka</dt><dd>{m.strength || '–'}</dd></div>
                      <div><dt>Dos</dt><dd className={!m.dose ? 'missing' : ''}>{m.dose || 'Saknas'}</dd></div>
                      <div><dt>Väg</dt><dd>{m.route}</dd></div>
                      <div><dt>Tid</dt><dd>{m.duration}</dd></div>
                      <div><dt>Karens</dt><dd>{m.withdrawal}</dd></div>
                    </dl>
                    {flag && <FlagFix flag={flag} onFix={(val) => resolve(flag.id, val)} />}
                  </div>
                );
              })}
            </section>
          )}
          <Field label="Råd till ägaren" value={j.rad} onChange={(x) => upd({ rad: x })} />
          <section className="mcard toggle-row">
            <div><b><LuFlag size={15} />Uppföljning</b><span className="muted">{j.uppfoljning ?? 'Ingen uppföljning'}</span></div>
            <button className={`switch${j.uppfoljning ? ' on' : ''}`} role="switch" aria-checked={!!j.uppfoljning} onClick={() => upd({ uppfoljning: j.uppfoljning ? undefined : 'Återbesök vid behov.' })} aria-label="Uppföljning"><i /></button>
          </section>
          {j.transcript && (
            <section className="mcard jr-sec">
              <button className="jr-raw-toggle" onClick={() => setShowRaw(!showRaw)} aria-expanded={showRaw}>
                <span>Visa det du sa</span><LuChevronDown size={16} style={{ transform: showRaw ? 'rotate(180deg)' : undefined }} />
              </button>
              {showRaw && <p className="jr-raw">{j.transcript}</p>}
              <button className="link" onClick={record}><LuRefreshCw size={14} />Diktera om</button>
            </section>
          )}
          <div className="mcta">
            <button className="mbtn primary xl" disabled={!ready} onClick={() => setSigning(true)}>
              {ready ? <><LuCircleCheck size={20} />Signera journal</> : <>{open.length ? `Åtgärda ${open.length} markering först` : 'Fyll i det som saknas'}</>}
            </button>
          </div>
        </>
      )}

      {allowed && phase === 'signed' && (
        <>
          <section className="jr-done">
            <span className="cel-ic"><LuCheck size={26} /></span>
            <b>Journal signerad</b>
            <span className="muted tnum">{j.signedBy ?? vet.name} · {hhmm(j.signedAt ?? s.world.now)}</span>
            {j.syncedAt != null ? (
              <span className="sync ok"><LuCheck size={14} />Sparad i Provet</span>
            ) : j.syncError ? (
              <span className="sync bad"><LuTriangleAlert size={14} />{j.syncError}</span>
            ) : offlineSince != null ? (
              <span className="sync"><LuWifiOff size={14} />Sparad i telefonen, skickas vid täckning</span>
            ) : (
              <span className="sync"><span className="spin" />Skickas till Provet</span>
            )}
            {j.syncError && offlineSince == null && <button className="mbtn ghost sm" onClick={() => act.retrySync(visitId)}><LuRefreshCw size={14} />Försök igen</button>}
            <span className="jr-mock">Kopplingen till Provet är simulerad i prototypen.</span>
          </section>
          <section className="mcard jr-sec jr-read">
            <dl>
              <div><dt>Anamnes</dt><dd>{j.anamnes}</dd></div>
              <div><dt>Status</dt><dd>{j.status}</dd></div>
              <div><dt>Bedömning</dt><dd>{j.bedomning}</dd></div>
              <div><dt>Åtgärder</dt><dd>{j.atgarder.join(', ')}</dd></div>
              {j.lakemedel.map((m, i) => <div key={i}><dt>Läkemedel</dt><dd>{m.name}, {m.strength}, {m.dose}, {m.route}, {m.duration}</dd></div>)}
              <div><dt>Råd</dt><dd>{j.rad}</dd></div>
              {j.uppfoljning && <div><dt>Uppföljning</dt><dd>{j.uppfoljning}</dd></div>}
            </dl>
          </section>
          <p className="privacy m"><LuShieldCheck size={14} />I skarp drift låses journalen i Provet. Ändringar görs där, med datum och signatur.</p>
          <div className="mcta"><button className="mbtn ghost xl" onClick={onBack}>Tillbaka</button></div>
        </>
      )}

      {signing && (
        <div className="sheet-back" onClick={() => setSigning(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <span className="grabber" />
            <div className="sheet-ic"><LuShieldCheck size={22} /></div>
            <h3>Signera journalen för {v.patient.name}?</h3>
            <p className="muted">Signeras av <b>{vet.name}, legitimerad veterinär</b>. Journalen sparas i Provet och kan därefter bara ändras där.</p>
            <div className="sheet-actions">
              <button className="mbtn ghost" onClick={() => setSigning(false)}>Inte än</button>
              <button className="mbtn primary" onClick={() => {
                act.signJournal(visitId, j);
                setSigning(false);
                setPhase('signed');
                setJ({ ...j, state: 'signerad', signedAt: s.world.now, signedBy: vet.name });
                toast(`Journal för ${v.patient.name} signerad`);
              }}><LuCheck size={18} />Signera</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return (
    <section className="mcard jr-sec">
      <h3>{label}</h3>
      <textarea ref={ref} className="jr-field" rows={1} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} placeholder={`Skriv ${label.toLowerCase()}`} />
    </section>
  );
}

function FlagFix({ flag, onFix }: { flag: { id: string; msg: string; fix: string; placeholder?: string; value?: string }; onFix: (v?: string) => void }) {
  const [val, setVal] = useState(flag.value ?? '');
  return (
    <div className="flagfix">
      <span><LuTriangleAlert size={15} />{flag.msg}</span>
      {flag.placeholder ? (
        <div className="row gap8">
          <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={flag.placeholder} aria-label={flag.placeholder} />
          <button className="mbtn primary sm" disabled={!val.trim()} onClick={() => onFix(val.trim())}>Lägg till</button>
        </div>
      ) : (
        <button className="mbtn primary sm" onClick={() => onFix()}>{flag.fix}</button>
      )}
    </div>
  );
}
