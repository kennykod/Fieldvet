// Voice messages: record → transcript → send. The artifact frame blocks the microphone, so recording is
// simulated with a context-aware transcript; in the real app MediaRecorder + speech-to-text replace it.
import { useEffect, useRef, useState } from 'react';
import { LuMic, LuPause, LuPlay, LuSend, LuSquare, LuTrash2 } from 'react-icons/lu';
import { hhmm, vetById } from '../shared/engine';
import { canSpeak, speak, stopSpeaking } from '../shared/speech';
import { COORDINATOR } from '../shared/data';
import type { Msg } from '../store';
import { useApp } from '../store';

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** What the vet would plausibly say right now, from the vet's own plan (operational, no clinical detail). */
function scriptedNote(ctx: ReturnType<typeof useApp>): string {
  const { s, plans } = ctx;
  const w = s.world;
  const p = plans[w.manualVet];
  const first = COORDINATOR.first;
  const cur = p.current ? w.visits[p.current.id] : null;
  const next = p.stops.find((x) => x.state === 'kommande');
  const nv = next ? w.visits[next.id] : null;
  if (p.current?.state === 'pågår' && cur && cur.extension > 0 && nv)
    return `Hej ${first}. Besöket hos ${cur.patient.name} drar över, jag behöver ungefär ${cur.extension} minuter till. Kan du meddela ${nv.owner.first} som har ${nv.patient.name} att jag blir lite sen? Tack.`;
  if (p.current?.state === 'påväg' && cur)
    return `Hej ${first}. Det är kö på vägen till ${cur.patient.name}, men jag räknar med att vara framme runt ${hhmm(p.current.arrive)}. Inget du behöver göra.`;
  if (p.current?.state === 'pågår' && cur)
    return `Hej ${first}. Jag är hos ${cur.patient.name} nu och allt går enligt plan. Hör av mig när jag är klar.`;
  if (nv) return `Hej ${first}. Jag är klar och åker mot ${nv.patient.name} i ${nv.address.area} nu. Allt enligt plan.`;
  return `Hej ${first}. Dagens sista besök är klart. Jag kör tillbaka till kliniken.`;
}

export function VoiceRecorder({ onClose }: { onClose: () => void }) {
  const ctx = useApp();
  const { act, s, toast, offlineSince } = ctx;
  const [phase, setPhase] = useState<'rec' | 'review'>('rec');
  const [sec, setSec] = useState(0);
  const [heard, setHeard] = useState('');
  const script = useRef(scriptedNote(ctx));
  const words = script.current.split(' ');
  const timer = useRef(0);

  useEffect(() => {
    let tick = 0;
    timer.current = window.setInterval(() => {
      tick += 1;
      if (tick % 4 === 0) setSec((x) => x + 1);
      const n = Math.min(words.length, Math.floor(tick / 1.2));
      setHeard(words.slice(0, n).join(' '));
    }, 110);
    return () => clearInterval(timer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => {
    clearInterval(timer.current);
    setHeard(script.current);
    setSec((x) => Math.max(x, Math.round(words.length / 2.6)));
    setPhase('review');
  };
  const send = () => {
    act.sendVoice(s.world.manualVet, script.current, sec);
    toast(offlineSince != null ? 'Röstmeddelandet skickas när du har täckning' : `Röstmeddelande skickat till ${COORDINATOR.first}`, offlineSince != null ? 'info' : 'ok');
    onClose();
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet voicesheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Röstmeddelande">
        <span className="grabber" />
        <div className="vs-top">
          <span className={`rec-dot${phase === 'rec' ? '' : ' off'}`} />
          <b>{phase === 'rec' ? 'Spelar in till ' + COORDINATOR.first : 'Lyssna igenom innan du skickar'}</b>
          <span className="tnum">{fmt(sec)}</span>
        </div>
        {phase === 'rec' && <div className="jr-wave" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 67) % 900}ms` }} />)}</div>}
        <div className="vs-transcript">
          <span className="lbl">Text till samordnaren</span>
          <p>{heard}{phase === 'rec' && <span className="caret" />}</p>
        </div>
        {phase === 'rec' ? (
          <button className="jr-stop" onClick={stop}><LuSquare size={20} /><span>Klar</span></button>
        ) : (
          <div className="sheet-actions">
            <button className="mbtn primary" onClick={send}><LuSend size={18} />Skicka röstmeddelande</button>
            <button className="mbtn ghost" onClick={onClose}><LuTrash2 size={17} />Ta bort</button>
          </div>
        )}
        <p className="jr-fine">Inspelningen simuleras i prototypen. Samordnaren får både ljud och text.</p>
      </div>
    </div>
  );
}

/** A voice bubble: play (speech synthesis stands in for the recording) + transcript. */
export function VoiceBubble({ m, mine }: { m: Msg; mine: boolean }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => { if (playing) stopSpeaking(); }, [playing]);
  const play = () => {
    if (playing) { stopSpeaking(); setPlaying(false); return; }
    setPlaying(true);
    if (!speak(m.text, () => setPlaying(false))) setTimeout(() => setPlaying(false), Math.min(4000, m.voice!.sec * 1000));
  };
  const who = m.from === 'vet' ? vetById(m.vetId).first : COORDINATOR.first;
  return (
    <div className={`bubble voice ${mine ? 'me' : 'them'}${m.pending ? ' pending' : ''}`}>
      <div className="vb-row">
        <button className="vb-play" onClick={play} aria-label={playing ? 'Pausa' : `Spela upp röstmeddelande från ${who}`}>
          {playing ? <LuPause size={16} /> : <LuPlay size={16} />}
        </button>
        <span className={`vb-wave${playing ? ' on' : ''}`} aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ height: `${6 + ((i * 37) % 17)}px` }} />)}</span>
        <span className="tnum vb-len">{fmt(m.voice!.sec)}</span>
      </div>
      <span className="vb-text">{m.text}</span>
      <time className="tnum">{m.pending ? 'Väntar på täckning' : hhmm(m.at)}</time>
      {!canSpeak() && null}
    </div>
  );
}

export function MicButton({ onClick, label = 'Spela in röstmeddelande' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="roundbtn mic-rec" onClick={onClick} aria-label={label} title={label}><LuMic size={19} /></button>;
}
