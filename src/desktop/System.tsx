// Honest system status: which integrations are mocked, which role sees what, and the audit trail.
import { LuCircleCheck, LuCircleX, LuHistory, LuLock, LuPlug, LuShieldCheck, LuTriangleAlert } from 'react-icons/lu';
import { GRANTS, PERMISSION_LABEL, type Permission, type Role } from '../shared/access';
import { INTEGRATIONS } from '../shared/integrations';
import { provet } from '../shared/provet';
import { hhmm } from '../shared/engine';
import { useApp } from '../store';

const ROLES: [Role, string][] = [['samordnare', 'Samordnare'], ['veterinar', 'Veterinär'], ['admin', 'Admin']];
const PERMS = Object.keys(PERMISSION_LABEL) as Permission[];

export function SystemView() {
  const { s, access, can } = useApp();
  const audit = [...s.audit].reverse();
  return (
    <div className="report sysview">
      <div className="rep-card">
        <div className="rep-head">
          <h2><LuPlug size={18} />Integrationer</h2>
          <span className="muted">Inget i prototypen är kopplat till riktiga system. Allt nedan är simulerat.</span>
        </div>
        <div className="integ">
          {INTEGRATIONS.map((i) => {
            const down = i.key.startsWith('provet') && s.provetDown;
            return (
              <div key={i.key} className="integ-card">
                <div className="integ-top">
                  <b>{i.name}</b>
                  <span className={`pill ${down ? 'bad' : 'mock'}`}>{down ? 'Svarar inte (demo)' : 'Simulerad'}</span>
                </div>
                <span className="muted small">{i.example}</span>
                <p>{i.purpose}</p>
                <p className="prod"><b>För produktion:</b> {i.production}</p>
              </div>
            );
          })}
        </div>
      </div>

      <ProvetSync />

      <div className="rep-row">
        <div className="rep-card">
          <div className="rep-head">
            <h2><LuShieldCheck size={18} />Vem ser vad</h2>
            <span className="muted">Du är inloggad som <b>{access.name}</b>, samordnare (demo)</span>
          </div>
          <div className="tablewrap">
            <table className="perm">
              <thead><tr><th>Behörighet</th>{ROLES.map(([r, l]) => <th key={r}>{l}</th>)}</tr></thead>
              <tbody>
                {PERMS.map((p) => (
                  <tr key={p}>
                    <td>{PERMISSION_LABEL[p]}</td>
                    {ROLES.map(([r]) => (
                      <td key={r} className="c">{GRANTS[r].includes(p) ? <LuCircleCheck size={16} className="yes" aria-label="Ja" /> : <LuCircleX size={16} className="no" aria-label="Nej" />}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Behörigheterna tillämpas där data lämnar lagret, inte bara i knapparna: samordnarens vy får aldrig journaltext, allergier, läkemedel eller tidigare anteckningar. Okänd roll ger ingen data.</p>
          {!can('config:write') && <p className="note-lock"><LuLock size={14} />Ändringar av team, arbetstider och integrationer kräver rollen Admin.</p>}
        </div>

        <div className="rep-card">
          <div className="rep-head">
            <h2><LuHistory size={18} />Granskningslogg</h2>
            <span className="muted">{audit.length} händelser idag</span>
          </div>
          <ol className="auditlog">
            {audit.slice(0, 40).map((e) => (
              <li key={e.id} className={e.outcome ?? 'ok'}>
                <span className="tnum">{hhmm(e.at)}</span>
                <span className="who">{e.actor}<em>{e.role === 'system' ? 'system' : e.role === 'veterinar' ? 'veterinär' : e.role}</em></span>
                <span className="what">{e.outcome === 'nekad' || e.outcome === 'fel' ? <LuTriangleAlert size={13} /> : null}{e.action}{e.target ? <b> · {e.target}</b> : null}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">Loggen innehåller vem, vad och när. Aldrig journaltext, kontaktuppgifter eller inloggningsuppgifter.</p>
        </div>
      </div>

      <div className="rep-card privacy-card">
        <div className="rep-head"><h2><LuShieldCheck size={18} />Produktionskrav som inte finns i prototypen</h2></div>
        <ul className="reqs">
          <li><b>Inloggning och sessioner.</b> Prototypen har ingen inloggning. Rollen väljs i demolisten.</li>
          <li><b>Behörighetskontroll på servern.</b> Reglerna finns i koden men körs i webbläsaren. I produktion körs samma regler på servern.</li>
          <li><b>Kryptering och lagring.</b> All data ligger i webbläsarens minne och försvinner vid omladdning. Produktion kräver krypterad överföring och lagring.</li>
          <li><b>Position.</b> Visas bara för samordnare under aktivt pass. Sparas inte. Produktion behöver en fastställd lagringstid.</li>
          <li><b>Hemligheter.</b> Inga API-nycklar finns i koden. Riktiga nycklar hanteras på servern, aldrig i appen.</li>
          <li><b>GDPR.</b> Registerförteckning, personuppgiftsbiträdesavtal med leverantörer och rutin för radering och export.</li>
        </ul>
      </div>
    </div>
  );
}

/** What went to and from Provet today. Operational counts only: no message bodies, no clinical text, no tokens. */
function ProvetSync() {
  const { s } = useApp();
  const m = provet.messaging.stats();
  const j = provet.journal.stats();
  const by = (st: string) => s.comms.filter((e) => e.state === st).length;
  const reads = s.audit.filter((a) => a.action === 'Läste patienthistorik från Provet').length;
  const denied = s.audit.filter((a) => a.action === 'Nekad: läsa patienthistorik').length;
  const rows: [string, string][] = [
    ['Kundmeddelanden skickade av Provet', String(m.delivered)],
    ['Väntar på svar från Provet', String(by('pending'))],
    ['Kunde inte skickas', String(by('failed'))],
    ['Inte skickade enligt ägarens val i Provet', String(by('blocked'))],
    ['Dubbletter stoppade', `${s.commDupes} i FieldVet · ${m.duplicatesIgnored} hos Provet`],
    ['Journaler sparade i Provet', `${j.written}${j.duplicatesIgnored ? ` · ${j.duplicatesIgnored} dubbletter stoppade` : ''}`],
    ['Historik läst av veterinär', `${reads}${denied ? ` · ${denied} nekade` : ''}`],
  ];
  return (
    <div className="rep-card">
      <div className="rep-head">
        <h2><LuPlug size={18} />Provet idag</h2>
        <span className="muted">{s.provetDown ? 'Provet svarar inte (demo). Ändringar köas och skickas när Provet svarar igen.' : 'Simulerad koppling. Varje händelse har en fast nyckel, så ett nytt försök skickar aldrig två gånger.'}</span>
      </div>
      <table className="perm provet-sync"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="c tnum"><b>{v}</b></td></tr>)}</tbody></table>
    </div>
  );
}
