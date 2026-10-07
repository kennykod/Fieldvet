// "Fråga FieldVet" — ask anything by voice, get a spoken answer.
// AI: Claude via the artifact's `sample` capability (viewer consents; runs on the viewer's Claude account),
// with read-only tools over the vet's own plan. Offline or without AI: keyword answers from the same tools.
import { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuMic, LuSend, LuSparkles, LuSquare, LuVolume2, LuVolumeX, LuWifiOff, LuPencil, LuShieldCheck } from 'react-icons/lu';
import { COORDINATOR } from '../shared/data';
import { vetById } from '../shared/engine';
import { ASSISTANT_RULES, dayOverview, delayStatus, localAnswer, nextVisit, visitDetails, type AssistantCtx } from '../shared/assistant';
import { canSpeak, speak, stopSpeaking } from '../shared/speech';
import { useApp } from '../store';

type Sample = ((input: unknown, opts?: unknown) => Promise<{ text: string }>) & { limits?: () => Promise<{ tools?: unknown }> };
interface Turn { id: number; q: string; a: string; mode: 'ai' | 'lokal' | 'fel'; status: 'thinking' | 'done'; draft?: string; sent?: boolean }

const SUGGESTIONS = ['Hur lång tid tar det till nästa kund?', 'Vad är portkoden till nästa besök?', 'Ligger jag efter plan?', 'Vilken utrustning behöver jag till nästa?', 'När är jag klar idag?', 'Säg till Maria att jag är 10 minuter sen'];
let seq = 0;

function useSample(): { sample: Sample | null; ready: boolean } {
  const [state, setState] = useState<{ sample: Sample | null; ready: boolean }>({ sample: null, ready: false });
  useEffect(() => {
    let alive = true;
    const c = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    if (!c?.use) { setState({ sample: null, ready: true }); return; }
    c.use('sample').then((s) => { if (alive) setState({ sample: (s as Sample) ?? null, ready: true }); }).catch(() => alive && setState({ sample: null, ready: true }));
    return () => { alive = false; };
  }, []);
  return state;
}

export function AssistantScreen({ onBack }: { onBack: () => void }) {
  const { s, plans, act, toast, offlineSince } = useApp();
  const vetId = s.world.manualVet;
  const vet = vetById(vetId);
  const { sample, ready } = useSample();
  const [aiBlocked, setAiBlocked] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(canSpeak());
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AssistantCtx>({ world: s.world, plan: plans[vetId] });
  ctxRef.current = { world: s.world, plan: plans[vetId] };
  const aiAvailable = !!sample && !aiBlocked && offlineSince == null;
  const history = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [turns]);
  useEffect(() => () => { ctl.current?.abort(); stopSpeaking(); }, []);

  const patch = (id: number, p: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  const tools = useMemo(() => (turnId: number) => [
    { name: 'get_next_visit', description: 'Nästa besök: patient, adress, restid i minuter, ETA, när hen senast måste åka, och om det blir sent. Använd för frågor om nästa kund, restid och när hen är framme.', execute: () => nextVisit(ctxRef.current) },
    { name: 'get_day_overview', description: 'Hela dagens besök med tider och status, antal klara, beräknad sluttid och kvarvarande körtid.', execute: () => dayOverview(ctxRef.current) },
    {
      name: 'get_visit_details', description: 'Detaljer om ett av veterinärens egna besök: anledning, åtkomst (portkod, parkering), utrustning, allergi, medicin och varningar. Utan namn: nästa besök.',
      inputSchema: { type: 'object', properties: { patient_name: { type: 'string', description: 'Djurets namn, t.ex. Milo' } } },
      execute: (input: { patient_name?: unknown }) => visitDetails(ctxRef.current, input.patient_name ? String(input.patient_name) : undefined),
    },
    { name: 'get_delay_status', description: 'Hur många minuter efter plan veterinären ligger, vilka besök som riskerar att bli sena och eventuell övertid.', execute: () => delayStatus(ctxRef.current) },
    {
      name: 'draft_message_to_coordinator', description: `Skapar ett UTKAST till ett meddelande till samordnaren ${COORDINATOR.first}. Skickas inte förrän veterinären trycker Skicka.`,
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Meddelandet, kort och sakligt, på svenska' } }, required: ['text'] },
      execute: (input: { text?: unknown }) => { const d = String(input.text ?? '').slice(0, 300); patch(turnId, { draft: d }); return { draft_created: true, requires_user_confirmation: true }; },
    },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const answerLocal = (id: number, q: string, note?: string) => {
    let a: string;
    try { a = localAnswer(ctxRef.current, q); } catch (e) { a = (e as Error).message; }
    const m = /säg till|meddela|skicka.*(maria|samordnar)/i.exec(q);
    const draft = m ? q.replace(/^(säg till|meddela)\s+(maria|samordnaren)\s+(att\s+)?/i, '').replace(/^./, (c) => c.toUpperCase()) : undefined;
    const text2 = draft ? `Jag har gjort ett utkast till ${COORDINATOR.first}. Tryck Skicka om det stämmer.` : a;
    patch(id, { a: note ? `${text2}` : text2, mode: 'lokal', status: 'done', draft });
    if (voiceOn) speak(text2);
  };

  const ask = async (qRaw: string) => {
    const q = qRaw.trim();
    if (!q) return;
    setText('');
    stopSpeaking();
    const id = ++seq;
    setTurns((ts) => [...ts, { id, q, a: '', mode: aiAvailable ? 'ai' : 'lokal', status: 'thinking' }]);
    if (!aiAvailable) { setTimeout(() => answerLocal(id, q), 350); return; }
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    const turnsIn = [{ role: 'user' as const, content: ASSISTANT_RULES(vet.name, COORDINATOR.name) }, ...history.current.slice(-6), { role: 'user' as const, content: q }];
    try {
      const { text: answer } = await sample!(turnsIn, { tools: tools(id), modelTier: 'quick', signal: c.signal, onText: ({ text: t }: { text: string }) => patch(id, { a: t }) });
      const spoken = answer.split(/\n\s*\n/).pop()!.trim();
      patch(id, { a: spoken, status: 'done', mode: 'ai' });
      history.current.push({ role: 'user', content: q }, { role: 'assistant', content: spoken });
      if (voiceOn) speak(spoken);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'cancelled') { patch(id, { status: 'done', a: 'Avbrutet.' }); return; }
      if (code === 'not_granted' || code === 'sampling_disabled' || code === 'tools_unavailable' || code === 'capability_disabled' || code === 'not_declared') setAiBlocked(true);
      answerLocal(id, q);
      if (code === 'rate_limited') toast('AI:n är tillfälligt upptagen. Svaret kommer från din plan utan AI.', 'info');
    }
  };

  const mic = () => {
    // The artifact frame blocks the microphone. In the app: push-to-talk → speech-to-text → ask().
    if (listening) { setListening(false); return; }
    setListening(true);
  };

  return (
    <div className="mscreen assistant">
      <div className="mtop">
        <button className="iconbtn" onClick={onBack} aria-label="Tillbaka"><LuArrowLeft size={20} /></button>
        <span>Fråga FieldVet</span>
        <button className="iconbtn" onClick={() => { if (voiceOn) stopSpeaking(); setVoiceOn(!voiceOn); }} aria-label={voiceOn ? 'Stäng av uppläsning' : 'Slå på uppläsning'} aria-pressed={voiceOn} disabled={!canSpeak()}>
          {voiceOn ? <LuVolume2 size={20} /> : <LuVolumeX size={20} />}
        </button>
      </div>

      <div className={`as-mode ${offlineSince != null ? 'off' : aiAvailable ? 'ai' : 'lokal'}`}>
        {offlineSince != null ? <><LuWifiOff size={14} />Ingen täckning: enkla svar direkt från din sparade dag</>
          : aiAvailable ? <><LuSparkles size={14} />AI-svar från din plan. Första frågan ber om ditt godkännande.</>
          : ready ? <><LuShieldCheck size={14} />Svar direkt från din plan, utan AI</> : <>Startar…</>}
      </div>

      {turns.length === 0 && (
        <section className="as-empty">
          <span className="as-orb"><LuMic size={34} /></span>
          <h2>Fråga vad du vill om dagen</h2>
          <p>Svaret läses upp, så du kan hålla händerna på ratten.</p>
        </section>
      )}

      <div className="as-thread">
        {turns.map((t) => (
          <div key={t.id} className="as-turn">
            <div className="bubble me"><span>{t.q}</span></div>
            <div className={`bubble them as-a${t.status === 'thinking' ? ' thinking' : ''}`}>
              {t.status === 'thinking' && !t.a ? <span className="dots"><i /><i /><i /></span> : <span>{t.a}</span>}
              {t.status === 'done' && <span className={`as-tag ${t.mode}`}>{t.mode === 'ai' ? 'AI · från din plan' : 'Utan AI · från din plan'}</span>}
              {t.draft && (
                <div className="as-draft">
                  <span className="lbl">Utkast till {COORDINATOR.first}</span>
                  <p>{t.draft}</p>
                  {t.sent ? <span className="as-sent">Skickat</span> : (
                    <div className="row gap8">
                      <button className="mbtn primary sm" onClick={() => { act.send(vetId, 'vet', t.draft!); patch(t.id, { sent: true }); toast(`Skickat till ${COORDINATOR.first}`); }}><LuSend size={14} />Skicka</button>
                      <button className="mbtn ghost sm" onClick={() => patch(t.id, { draft: undefined })}>Släng</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="as-bottom">
        {(listening || turns.length === 0) && (
          <div className="as-sugs">
            {listening && <p className="as-listen"><span className="rec-dot" />Lyssnar… Mikrofonen simuleras här, välj det du skulle säga:</p>}
            <div className="tchips">
              {SUGGESTIONS.map((q) => <button key={q} className="chipbtn" onClick={() => { setListening(false); ask(q); }}>”{q}”</button>)}
            </div>
          </div>
        )}
        <form className="as-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
          <LuPencil size={16} className="muted" />
          <input id="as-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Eller skriv en fråga" aria-label="Fråga" />
          {turns.some((t) => t.status === 'thinking')
            ? <button type="button" className="roundbtn" onClick={() => ctl.current?.abort()} aria-label="Stoppa"><LuSquare size={16} /></button>
            : text.trim() ? <button type="submit" className="roundbtn primary" aria-label="Fråga"><LuSend size={17} /></button> : null}
        </form>
        <button className={`as-mic${listening ? ' on' : ''}`} onClick={mic} aria-label={listening ? 'Sluta lyssna' : 'Håll inne och prata'}>
          {listening ? <span className="wave"><i /><i /><i /><i /></span> : <LuMic size={28} />}
        </button>
      </div>
    </div>
  );
}
