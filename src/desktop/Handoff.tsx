// Coordinator side of "continue at the clinic": an operational handoff with a clear next step.
import { useMemo, useState } from 'react';
import { LuChevronDown, LuSparkles } from 'react-icons/lu';
import { LuArrowLeft, LuCheck, LuHospital, LuPhone, LuSiren } from 'react-icons/lu';
import { hhmm, vetById } from '../shared/engine';
import { integrations } from '../shared/integrations';
import { useApp } from '../store';
import { Avatar, PatientBadge } from '../ui';

const WHEN = { akut: 'nu', idag: 'idag', planerad: 'senare' } as const;

export function HandoffPanel({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: (visitId: string) => void }) {
  const { s, act, toast } = useApp();
  const w = s.world;
  const h = s.handoffs.find((x) => x.id === id);
  const v = h ? w.visits[h.visitId] : undefined;
  // The owner needs time to get there: earliest clinic slot is 40 minutes from now.
  const slots = useMemo(() => integrations.clinic.nextSlots(w.now + 40, 2), [w.now]);
  const options = useMemo(() => {
    const o: { key: string; kind: 'slot' | 'akut' | 'avvakta'; at?: number; title: string; sub: string; label: string }[] = [];
    slots.forEach((x, i) => o.push({ key: `slot-${x.at}`, kind: 'slot', at: x.at, title: i === 0 ? `Nästa lediga tid: ${hhmm(x.at)}` : `Senare tid: ${hhmm(x.at)}`, sub: `${x.label} · kliniken`, label: hhmm(x.at) }));
    const arr = Math.ceil((w.now + 25) / 5) * 5;
    o.push({ key: 'akut', kind: 'akut', at: arr, title: 'Akut ankomst nu', sub: `Kliniken förbereds. Ägaren kör in direkt, framme ca ${hhmm(arr)}.`, label: `akut ${hhmm(arr)}` });
    o.push({ key: 'avvakta', kind: 'avvakta', title: 'Avvakta', sub: 'Du ringer ägaren först. Ärendet ligger kvar under Att hantera.', label: 'avvakta' });
    return o;
  }, [slots, w.now]);
  const recoKey = h?.priority === 'akut' ? 'akut' : options[0].key;
  const [sel, setSel] = useState<string>(recoKey);
  const [alts, setAlts] = useState(false);
  if (!h || !v) return null;
  const vet = vetById(h.vetId);
  const chosen = options.find((o) => o.key === sel) ?? options[0];

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="iconbtn" onClick={onClose} aria-label="Tillbaka"><LuArrowLeft size={18} /></button>
        <PatientBadge v={v} size={36} />
        <div className="ph-title">
          <b>{v.patient.name} behöver klinik {WHEN[h.priority]}</b>
          <span className="muted">{v.patient.species} · {v.address.area} · från {vet.first} {hhmm(h.at)}</span>
        </div>
      </div>
      <div className="panel-scroll">
        <div className="ho-card">
          <div className="row gap8"><Avatar vet={vet} size={24} /><b>{h.reason}</b></div>
          {h.note && <p className="ho-note">”{h.note}”</p>}
          <p className="muted small">Veterinärens bedömning. Den kliniska delen skrivs i journalen som vanligt.</p>
        </div>
        {(() => {
          const o = options.find((x) => x.key === recoKey)!;
          return (
            <div className={`reco${sel === o.key ? ' sel' : ''}`} data-demo="handoff-slot" onClick={() => setSel(o.key)}>
              <span className="reco-eyebrow"><LuSparkles size={13} />Förslag</span>
              <b className="reco-title">{o.kind === 'akut' ? 'Akut ankomst till kliniken' : `Boka ${o.label} på kliniken`}</b>
              <p>{o.sub}</p>
            </div>
          );
        })()}
        <button className="link alt-toggle" onClick={() => setAlts(!alts)} aria-expanded={alts}>{alts ? 'Dölj andra alternativ' : 'Visa andra alternativ'}<LuChevronDown size={14} className={alts ? 'flip' : ''} /></button>
        {alts && (
          <div className="fixes">
            {options.filter((o) => o.key !== recoKey).map((o) => (
              <button key={o.key} className={`fix${sel === o.key ? ' sel' : ''}`} onClick={() => setSel(o.key)}>
                <span className="fix-top">
                  {o.kind === 'akut' ? <LuSiren size={15} /> : o.kind === 'avvakta' ? <LuPhone size={15} /> : <LuHospital size={15} />}
                  <b>{o.title}</b>
                </span>
                <span className="fix-why">{o.sub}</span>
              </button>
            ))}
          </div>
        )}
        <p className="muted small ho-after">När du bekräftar får {vet.first}, ägaren och kliniken besked (simulerat).</p>
      </div>
      <div className="panel-foot">
        <button className="btn ghost" onClick={onClose}>Avbryt</button>
        <button
          className="btn primary"
          data-demo="handoff-confirm"
          onClick={() => {
            if (!act.decideHandoff(h.id, { kind: chosen.kind, at: chosen.at, label: chosen.label })) return;
            toast(chosen.kind === 'avvakta' ? `${v.patient.name} ligger kvar tills du har pratat med ägaren` : `${v.patient.name} till kliniken ${chosen.label} ✓ · ${vet.first}, ägaren och kliniken har fått besked`, 'ok', { label: 'Ångra', run: act.undo });
            onDone(v.id);
          }}
        >
          <LuCheck size={15} />{chosen.kind === 'avvakta' ? 'Avvakta' : 'Bekräfta'}
        </button>
      </div>
    </div>
  );
}
