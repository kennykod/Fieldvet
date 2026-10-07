// Slack-trådar i samordnarens dashboard. Simulerad koppling: inga anrop lämnar prototypen.
// FieldVet postar bara operativa händelser (plan, avbokning, akutbesök) – aldrig journal eller kliniska uppgifter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowUpRight, LuHash, LuMessageSquareReply, LuPlus, LuSend, LuShieldCheck, LuCircleCheck } from 'react-icons/lu';
import { VETS } from '../shared/data';
import { hhmm } from '../shared/engine';
import { useApp, type SlackMsg, type SlackThread } from '../store';
import { Logo } from '../ui';

const CHANNELS = [
  { id: 'hembesok-stockholm', about: 'Hembesöksteamet: plan och dagens läge' },
  { id: 'reception', about: 'Receptionen: nya förfrågningar från djurägare' },
  { id: 'klinik-stockholm', about: 'Kliniken: resurser och info' },
];

export function isUnread(th: SlackThread, now: number) {
  return [th.root, ...th.replies].some((m) => m.at <= now && m.at > th.readAt && !m.mine);
}
export function slackUnread(threads: SlackThread[], now: number) {
  return threads.filter((th) => th.root.at <= now && isUnread(th, now)).length;
}

function Who({ m, size = 32 }: { m: SlackMsg; size?: number }) {
  if (m.bot) return <span className="sk-av bot" style={{ width: size, height: size }}><Logo size={size - 8} word={false} /></span>;
  const vet = VETS.find((v) => v.name === m.author);
  const ini = m.author.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return <span className="sk-av" style={{ width: size, height: size, background: vet?.color ?? (m.mine ? 'var(--nav)' : '#8a6d3b') }}>{ini}</span>;
}

function Message({ m }: { m: SlackMsg }) {
  return (
    <div className={`sk-msg${m.bot ? ' bot' : ''}`}>
      <Who m={m} />
      <div>
        <div className="sk-meta"><b>{m.author}</b>{m.bot && <span className="sk-app">APP</span>}{m.title && <span className="muted">{m.title}</span>}<time className="tnum">{hhmm(m.at)}</time></div>
        <p>{m.text}</p>
      </div>
    </div>
  );
}

export function SlackView({ onOpenVisit, onCreateVisit }: { onOpenVisit: (visitId: string) => void; onCreateVisit: (threadId: string) => void }) {
  const { s, act } = useApp();
  const now = s.world.now;
  const [channel, setChannel] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => s.slack
    .filter((th) => th.root.at <= now && (!channel || th.channel === channel))
    .map((th) => ({ th, last: Math.max(th.root.at, ...th.replies.filter((r) => r.at <= now).map((r) => r.at)) }))
    .sort((a, b) => b.last - a.last), [s.slack, now, channel]);

  const cur = s.slack.find((th) => th.id === sel) ?? visible[0]?.th ?? null;
  const replies = cur ? cur.replies.filter((r) => r.at <= now) : [];

  useEffect(() => {
    if (cur && isUnread(cur, now)) act.slackRead(cur.id);
    end.current?.scrollIntoView({ block: 'end' });
  }, [cur?.id, replies.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => { if (!cur || !text.trim()) return; act.slackReply(cur.id, text.trim()); setText(''); };
  const visit = cur?.visitId ? s.world.visits[cur.visitId] : undefined;
  const open = s.slack.filter((th) => th.root.at <= now && th.request && !th.handled).length;

  return (
    <div className="slackview">
      <aside className="sk-side">
        <div className="sk-ws">
          <b>Klinikens Slack</b>
          <span className="pill mock" title="Ingen riktig Slack-koppling i prototypen">Simulerad</span>
        </div>
        <button className={`sk-ch${channel == null ? ' on' : ''}`} onClick={() => setChannel(null)}>
          <LuMessageSquareReply size={15} />Alla trådar
          {open > 0 && <span className="sk-count req" title="Förfrågningar som väntar">{open}</span>}
        </button>
        {CHANNELS.map((c) => {
          const n = slackUnread(s.slack.filter((th) => th.channel === c.id), now);
          return (
            <button key={c.id} className={`sk-ch${channel === c.id ? ' on' : ''}${n ? ' unread' : ''}`} onClick={() => setChannel(c.id)} title={c.about}>
              <LuHash size={15} />{c.id}
              {n > 0 && <span className="sk-count">{n}</span>}
            </button>
          );
        })}
        <div className="sk-list" role="list">
          {visible.length === 0 && <p className="muted sk-empty">Inga trådar i kanalen ännu.</p>}
          {visible.map(({ th, last }) => {
            const n = th.replies.filter((r) => r.at <= now).length;
            return (
              <button key={th.id} role="listitem" className={`sk-item${cur?.id === th.id ? ' on' : ''}${isUnread(th, now) ? ' unread' : ''}`} onClick={() => setSel(th.id)}>
                <span className="sk-item-top"><span className="muted">#{th.channel}</span><time className="tnum">{hhmm(last)}</time></span>
                <span className="sk-item-who"><b>{th.root.author}</b>{th.request && !th.handled && <span className="sk-tag req">Förfrågan</span>}{th.handled && <span className="sk-tag ok">Bokad</span>}</span>
                <span className="sk-snip">{th.root.text}</span>
                {n > 0 && <span className="sk-n">{n} {n === 1 ? 'svar' : 'svar'}</span>}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="sk-thread">
        {!cur ? <div className="sk-none muted">Välj en tråd</div> : (
          <>
            <header className="sk-head">
              <span><LuHash size={16} /><b>{cur.channel}</b></span>
              <span className="muted">Tråd</span>
              <div className="sk-actions">
                {visit && (
                  <button className="btn ghost sm" onClick={() => onOpenVisit(visit.id)}>
                    <LuArrowUpRight size={15} />Öppna {visit.patient.name} i FieldVet
                  </button>
                )}
                {cur.request === 'hembesok' && !cur.handled && (
                  <button className="btn primary sm" onClick={() => onCreateVisit(cur.id)}><LuPlus size={15} />Skapa hembesök</button>
                )}
                {cur.handled && <span className="sk-tag ok big"><LuCircleCheck size={14} />Bokad i FieldVet</span>}
              </div>
            </header>
            <div className="sk-body">
              <Message m={cur.root} />
              {replies.length > 0 && <div className="sk-divider"><span>{replies.length} svar</span></div>}
              {replies.map((m) => <Message key={m.id} m={m} />)}
              <div ref={end} />
            </div>
            <div className="sk-compose">
              <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Svara i tråden i #${cur.channel}`} aria-label="Svar i Slack-tråd" />
                <button className="btn primary" type="submit" disabled={!text.trim()} aria-label="Skicka svar"><LuSend size={16} /></button>
              </form>
              <p className="sk-note"><LuShieldCheck size={13} />FieldVet postar bara plan, tider och område. Journal, flaggor och ägarens telefon delas aldrig i Slack.</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
