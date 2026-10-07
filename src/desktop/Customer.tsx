// Owner-facing ETA preview: what the sms and the link page would show. No app for the owner, no clinical content.
import { LuCheck, LuLink, LuMessageSquareText, LuPhone, LuShieldCheck, LuSend } from 'react-icons/lu';
import { hhmm, vetById } from '../shared/engine';
import { etaWindow } from '../shared/ops';
import { useApp } from '../store';
import { COMM_LABEL } from '../shared/provet';
import { CloseBtn, Logo } from '../ui';

const code = (id: string) => {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 1679616;
  return h.toString(36).toUpperCase().padStart(4, '7');
};

export function CustomerEtaModal({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const { s, plans, act, toast } = useApp();
  const v = s.world.visits[visitId];
  if (!v) return null;
  const vet = vetById(v.vetId);
  const eta = s.eta[visitId];
  const st = plans[v.vetId]?.stops.find((x) => x.id === visitId);
  const handoff = s.handoffs.find((h) => h.visitId === visitId && h.status === 'bekraftad');
  const clinicAt = eta?.kind === 'klinik' ? eta.clinicAt : handoff?.outcome?.at;
  const link = `eta.fieldvet.example/${code(visitId)}`;

  // Only first name, time window and status leave the system.
  let head: string;
  let big: string | null = null;
  let bigLabel = `${vet.first} kommer cirka`;
  if (clinicAt != null) { head = 'Besöket fortsätter på kliniken'; big = hhmm(clinicAt); bigLabel = handoff?.outcome?.kind === 'akut' ? 'Kör in till kliniken, beräknat' : 'Er tid på kliniken'; }
  else if (v.status === 'klar') head = 'Besöket är klart. Tack!';
  else if (v.status === 'pågår') head = `${vet.first} är hos er nu`;
  else if (v.status === 'framme') head = `${vet.first} är framme`;
  else if (v.status === 'påväg') head = 'Veterinären är på väg';
  else head = 'Ert hembesök idag';
  if (clinicAt == null && eta && (v.status === 'planerad' || v.status === 'påväg')) big = `${hhmm(eta.from)}–${hhmm(eta.to)}`;
  const stepIdx = clinicAt != null ? 3 : v.status === 'klar' ? 3 : v.status === 'pågår' || v.status === 'framme' ? 2 : v.status === 'påväg' ? 1 : 0;
  const steps = ['Bokat', 'På väg', 'Framme', clinicAt != null ? 'Klinik' : 'Klart'];
  const sms = !eta ? null
    : eta.kind === 'klinik' ? `Kliniken: Hej ${v.owner.first}! ${v.patient.name} fortsätter på kliniken ${hhmm(eta.clinicAt ?? eta.arrive)}. Mer info: ${link}`
    : eta.kind === 'påväg' ? `Kliniken: Hej ${v.owner.first}! ${vet.first} är på väg och är hos er ca ${hhmm(eta.from)}–${hhmm(eta.to)}. Följ här: ${link}`
    : eta.kind === 'akut' ? `Kliniken: Hej ${v.owner.first}! ${vet.first} kommer till ${v.patient.name} ca ${hhmm(eta.from)}–${hhmm(eta.to)}. Följ här: ${link}`
    : `Kliniken: Ny tid för ${v.patient.name}: ${vet.first} är hos er ca ${hhmm(eta.from)}–${hhmm(eta.to)}. Följ här: ${link}`;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal customer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Kundens vy" data-demo="customer-modal">
        <div className="modal-head">
          <span className="mh-ic"><LuMessageSquareText size={18} /></span>
          <div>
            <h3>Meddelande till {v.owner.first}</h3>
            <p className="muted">Skickat av Provet med klinikens mall. Ägaren behöver ingen app eller inloggning.</p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="cust-body">
          <div className="cust-info">
            {eta ? (
              <ul className="cust-facts">
                <li><LuCheck size={15} /><span><b>{eta.state === 'sent' ? (eta.via === 'telefon' ? `Informerad per telefon` : `Skickat via Provet ${hhmm(eta.sentAt)}`) : eta.state === 'pending' ? 'Skickas via Provet…' : eta.state === 'failed' ? 'Kunde inte skickas, Provet svarar inte' : 'Inget sms: ägaren tar inte emot sms enligt Provet'}</b> {COMM_LABEL[eta.type].toLowerCase()}, {eta.kind === 'påväg' ? 'när veterinären började köra' : eta.kind === 'klinik' ? 'när kliniktiden bekräftades' : eta.kind === 'akut' ? 'när akutbesöket tilldelades' : 'när planen ändrades'}</span></li>
                {eta.count > 1 && <li><LuSend size={15} /><span>Tiden har uppdaterats {eta.count - 1} {eta.count === 2 ? 'gång' : 'gånger'}. Senaste tiden gäller.</span></li>}
                <li><LuLink size={15} /><span>Länken visar alltid läget just nu och slutar gälla när besöket är klart.</span></li>
              </ul>
            ) : (
              <div className="cust-none">
                <b>Ägaren har inte fått någon tid än</b>
                <span className="muted">Provet skickar automatiskt när {vet.first} börjar köra. Du kan också skicka tiden nu.</span>
                {st && st.state !== 'klar' && (
                  <button className="btn soft" onClick={() => { act.sendEta(visitId, st.arrive); const w = etaWindow(st.arrive); toast(`Ankomsttid ${hhmm(w.from)}–${hhmm(w.to)} skickas via Provet till ${v.owner.first}`); }}><LuSend size={15} />Skicka ankomsttid</button>
                )}
              </div>
            )}
            <p className="privacy"><LuShieldCheck size={14} />Bara förnamn, tid och status. Ingen anledning, journal, exakt position eller andra besök.</p>
            <p className="muted small">Förhandsvisning. Provet är simulerat i prototypen och inget sms skickas.</p>
          </div>
          <div className="cust-phone" aria-label="Kundens telefon">
            {sms && eta?.state !== 'blocked' && <div className="cust-sms"><span>{sms}</span></div>}
            <div className="cust-page">
              <div className="cp-brand"><Logo size={20} word={false} /><b>Hembesök</b><span className="muted">{v.patient.name}</span></div>
              <h4>{head}</h4>
              {big && <div className="cp-eta"><span className="muted">{bigLabel}</span><b className="tnum">{big}</b></div>}
              {eta && eta.count > 1 && clinicAt == null && v.status !== 'klar' && <p className="cp-updated">Tiden är uppdaterad {hhmm(eta.sentAt)}</p>}
              <ol className="cp-steps">
                {steps.map((label, i) => <li key={label} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}><i>{i < stepIdx ? <LuCheck size={11} /> : null}</i>{label}</li>)}
              </ol>
              <div className="cp-contact">
                <span>Blir {v.patient.name} sämre eller har ni frågor?</span>
                <span className="cp-call"><LuPhone size={15} />Ring kliniken</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
