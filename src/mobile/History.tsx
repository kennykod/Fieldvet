// "Visa historik": read-only clinical context from Provet, fetched on demand for the vet's own patient.
// Opens on top of the current screen so the visit underneath keeps its place and scroll position.
import { useEffect, useState } from 'react';
import { LuArrowLeft, LuCloudOff, LuExternalLink, LuFileText, LuLock, LuPill, LuRefreshCw, LuStethoscope, LuSyringe } from 'react-icons/lu';
import { hhmm } from '../shared/engine';
import type { HistoryResponse } from '../shared/provet';
import { useApp } from '../store';
import { PatientBadge } from '../ui';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const date = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

export function HistoryOverlay({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const { s, act, toast } = useApp();
  const v = s.world.visits[visitId];
  const [res, setRes] = useState<(HistoryResponse & { cached?: boolean }) | null>(null);
  const [nonce, setNonce] = useState(0);
  const [notes, setNotes] = useState<Record<string, string | 'loading' | 'error'>>({});

  useEffect(() => {
    let alive = true;
    setRes(null);
    act.readHistory(visitId).then((r) => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, [visitId, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return null;
  const openNote = (id: string) => {
    if (notes[id] && notes[id] !== 'error') { const n = { ...notes }; delete n[id]; setNotes(n); return; }
    setNotes({ ...notes, [id]: 'loading' });
    act.readFullNote(visitId, id).then((t) => setNotes((x) => ({ ...x, [id]: t ?? 'error' })));
  };

  return (
    <div className="mhist" role="dialog" aria-modal="true" aria-label={`Historik för ${v.patient.name}`}>
      <div className="mtop">
        <button className="iconbtn" data-demo="history-back" onClick={onClose} aria-label="Tillbaka till besöket"><LuArrowLeft size={20} /></button>
        <span>Historik</span>
        <span />
      </div>
      <div className="hist-head">
        <PatientBadge v={v} size={44} />
        <div><b>{v.patient.name}</b><span className="muted">{[v.patient.breed || v.patient.species, v.patient.age].filter(Boolean).join(' · ')}</span></div>
      </div>

      {!res && (
        <div className="phist-list" aria-busy="true" aria-label="Hämtar historik från Provet">
          <p className="hist-src"><span className="spin" aria-hidden="true" />Hämtar från Provet…</p>
          {[0, 1, 2].map((i) => <div key={i} className="hist-skel"><i /><i /><i /></div>)}
        </div>
      )}

      {res && !res.ok && (
        <div className="hist-empty" role="status">
          {res.reason === 'offline' ? <LuCloudOff size={26} /> : res.reason === 'nekad' ? <LuLock size={26} /> : <LuRefreshCw size={26} />}
          <b>{res.reason === 'offline' ? 'Historiken kan inte hämtas utan täckning' : res.reason === 'nekad' ? 'Du har inte tillgång till den här patientens historik' : 'Provet svarar inte just nu'}</b>
          <span className="muted">{res.reason === 'nekad' ? 'Historik visas bara för dina egna patienter idag.' : 'Det viktigaste inför besöket finns kvar på besökskortet. Du kan fortsätta som vanligt.'}</span>
          {res.reason === 'provet' && <button className="mbtn ghost" onClick={() => setNonce(nonce + 1)}><LuRefreshCw size={16} />Försök igen</button>}
        </div>
      )}

      {res && res.ok && (
        <>
          <p className="hist-src">
            <LuLock size={13} />
            {res.cached ? <span>Sparad sammanfattning från {hhmm(res.fetchedAt)} · offline · raderas när passet slutar</span> : <span>Hämtat från Provet · uppdaterat {hhmm(res.fetchedAt)} · endast läsning</span>}
          </p>
          <ol className="phist-list" data-demo="history-list">
            {res.entries.map((e) => {
              const n = notes[e.id];
              return (
                <li key={e.id} className="hist-item">
                  <div className="hi-top"><b>{e.type}</b><span className="tnum">{date(e.date)}</span></div>
                  <p>{e.summary}</p>
                  {(e.diagnoses || e.medications || e.procedures) && (
                    <ul className="hi-tags">
                      {e.diagnoses?.map((d) => <li key={d} className="dx"><LuStethoscope size={12} />{d}</li>)}
                      {e.medications?.map((m) => <li key={m} className="rx"><LuPill size={12} />{m}</li>)}
                      {e.procedures?.map((p) => <li key={p}><LuSyringe size={12} />{p}</li>)}
                    </ul>
                  )}
                  <div className="hi-foot">
                    <span className="muted">{e.vet}</span>
                    {!res.cached && <button className="link" onClick={() => openNote(e.id)} aria-expanded={!!n && n !== 'error'}><LuFileText size={13} />{n && n !== 'error' ? 'Dölj anteckningen' : 'Visa hela anteckningen'}</button>}
                  </div>
                  {n === 'loading' && <p className="hi-note muted"><span className="spin" aria-hidden="true" />Hämtar anteckningen…</p>}
                  {n === 'error' && <p className="hi-note muted">Anteckningen kunde inte hämtas just nu.</p>}
                  {n && n !== 'loading' && n !== 'error' && <p className="hi-note">{n}</p>}
                </li>
              );
            })}
          </ol>
          <div className="hist-provet">
            <span className="muted">Historiken kan inte ändras här. Ändringar görs i Provet.</span>
            <button className="mbtn ghost sm" onClick={() => toast('Provet öppnas i en ny flik (demo)', 'info')}><LuExternalLink size={15} />Öppna i Provet</button>
          </div>
        </>
      )}
    </div>
  );
}
