// "Importera bokningar": read an export file in the browser, map columns, check rows, plan and approve the day.
// Nothing leaves the browser. In production the same steps run on bookings fetched from the practice system's API.
import { useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuCheck, LuCircleAlert, LuCircleCheck, LuFileSpreadsheet, LuFileUp, LuShieldCheck, LuTriangleAlert, LuUpload, LuUsers, LuWandSparkles, LuX } from 'react-icons/lu';
import { VETS } from '../shared/data';
import { hhmm } from '../shared/engine';
import { AREAS, buildRows, decodeText, EXAMPLE_CSV, EXAMPLE_NAME, FIELDS, guessMapping, parseTable, planImported, type Mapping } from '../shared/importer';
import { readXlsx } from '../lib/xlsx';
import { useApp } from '../store';

type Step = 'file' | 'map' | 'check';

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { act, toast } = useApp();
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [keepVets, setKeepVets] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = (name: string, rows: string[][]) => {
    if (rows.length < 2) { setError('Filen innehåller inga bokningar. Första raden ska vara kolumnrubriker och resten en bokning per rad.'); return; }
    setError(''); setFileName(name); setTable(rows); setMapping(guessMapping(rows[0])); setFixes({}); setStep('map');
  };
  const readFile = async (f: File) => {
    setBusy(true); setError('');
    try {
      if (/\.xls$/i.test(f.name)) throw new Error('Äldre Excel-filer (.xls) stöds inte. Spara som .xlsx eller CSV och försök igen.');
      const buf = await f.arrayBuffer();
      const rows = /\.xlsx$/i.test(f.name) ? await readXlsx(buf) : parseTable(decodeText(new Uint8Array(buf)));
      load(f.name, rows);
    } catch (e) {
      setError((e as Error).message || 'Filen gick inte att läsa. Prova att spara den som CSV.');
    } finally { setBusy(false); }
  };

  const headers = table[0] ?? [];
  const sample = table[1] ?? [];
  const missing = mapping ? FIELDS.filter((f) => f.required && mapping[f.key] < 0) : [];
  const built = useMemo(() => (mapping && step === 'check' ? buildRows(table, mapping, fixes) : null), [mapping, step, table, fixes]);
  const ok = built?.rows.filter((r) => r.visit) ?? [];
  const bad = built?.rows.filter((r) => !r.visit) ?? [];
  const warn = ok.filter((r) => r.issues.length);
  const byFV = ok.filter((r) => !keepVets || !r.vetFromFile).length;

  const plan = () => {
    setBusy(true);
    // Let the button show its busy state before the (short) planning run.
    setTimeout(() => {
      const res = planImported(ok.map((r) => r.visit!), { keepVets });
      act.importDay(res.world, { count: res.count, source: fileName, byFieldVet: res.assignedByFieldVet, skipped: bad.length });
      toast(`Dagens plan importerad ✓ · ${res.count} besök fördelade · veterinärerna ser sina rutter i appen`);
      onDone();
    }, 30);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal import" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" aria-labelledby="imp-h">
        <div className="modal-head">
          <span className="mh-ic"><LuFileUp size={18} /></span>
          <div>
            <h3 id="imp-h">Importera bokningar</h3>
            <p className="muted">{step === 'file' ? 'Om Provet-kopplingen inte är aktiv: dagens hembesök från en export ur Provet, som Excel eller CSV.' : step === 'map' ? `${fileName} · ${table.length - 1} rader. Kontrollera vilken kolumn som är vad.` : 'FieldVet har kontrollerat raderna. Rätta det som behövs och planera dagen.'}</p>
          </div>
          <div className="steps" aria-hidden="true"><i className="on" /><i className={step !== 'file' ? 'on' : ''} /><i className={step === 'check' ? 'on' : ''} /></div>
          <button className="iconbtn" onClick={onClose} aria-label="Stäng"><LuX size={18} /></button>
        </div>

        {step === 'file' && (
          <div className="imp-body">
            <div
              className={`dropzone${drag ? ' on' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
            >
              <span className="dz-ic"><LuUpload size={26} /></span>
              <b>Dra in filen här</b>
              <span className="muted">Excel (.xlsx) eller CSV. En bokning per rad, rubriker på första raden.</span>
              <div className="row gap8">
                <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}><LuFileSpreadsheet size={16} />Välj fil</button>
                <button className="btn ghost" onClick={() => load(EXAMPLE_NAME, parseTable(EXAMPLE_CSV))} disabled={busy}>Använd exempelfil</button>
              </div>
              <input ref={input} id="imp-file" type="file" accept=".csv,.txt,.tsv,.xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
            </div>
            {error && <p className="imp-err" role="alert"><LuCircleAlert size={16} />{error}</p>}
            <div className="imp-info">
              <div><b>Kolumner FieldVet letar efter</b><span className="muted">Tid, djurets namn och adress krävs. Veterinär, besökstyp, ort, postnummer, telefon och anteckning används om de finns.</span></div>
              <div><LuShieldCheck size={16} /><span className="muted">Filen läses bara i din webbläsare och skickas ingenstans. Använd påhittade personuppgifter i demon.</span></div>
            </div>
          </div>
        )}

        {step === 'map' && mapping && (
          <div className="imp-body">
            <div className="map-grid">
              {FIELDS.map((f) => (
                <label key={f.key} className={`field map-row${f.required && mapping[f.key] < 0 ? ' missing' : ''}`}>
                  <span>{f.label}{f.required && <i> krävs</i>}</span>
                  <select id={`map-${f.key}`} value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: +e.target.value } as Mapping)}>
                    <option value={-1}>Används inte</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Kolumn ${i + 1}`}{sample[i] ? ` (${sample[i].slice(0, 22)})` : ''}</option>)}
                  </select>
                  <em>{f.hint}</em>
                </label>
              ))}
            </div>
            <div className="imp-vets">
              <span className="lbl"><LuUsers size={14} />Veterinärer</span>
              <div className="seg" role="radiogroup" aria-label="Fördelning">
                <button type="button" role="radio" aria-checked={keepVets} className={keepVets ? 'on' : ''} onClick={() => setKeepVets(true)}>Behåll veterinär från filen</button>
                <button type="button" role="radio" aria-checked={!keepVets} className={!keepVets ? 'on' : ''} onClick={() => setKeepVets(false)}><LuWandSparkles size={14} />Låt FieldVet fördela alla</button>
              </div>
              <span className="muted">{keepVets ? 'Rader utan veterinär, eller med fel utrustning, fördelas av FieldVet.' : 'FieldVet fördelar efter plats, tidsfönster, kompetens och utrustning i bilen.'}</span>
            </div>
          </div>
        )}

        {step === 'check' && built && (
          <div className="imp-body">
            <div className="imp-sum">
              <span className="sum ok"><LuCircleCheck size={15} />{ok.length} klara att planera</span>
              {warn.length > 0 && <span className="sum warn"><LuTriangleAlert size={15} />{warn.length} med antaganden</span>}
              {bad.length > 0 && <span className="sum bad"><LuCircleAlert size={15} />{bad.length} kan inte tas med</span>}
              {built.dateLabel && <span className="muted">Datum i filen: {built.dateLabel}. Visas som idag i demon.</span>}
            </div>
            <div className="imp-rows" role="list">
              {built.rows.map((r) => {
                const place = r.issues.find((i) => i.field === 'street' && i.level === 'fel');
                const vet = keepVets && r.vetFromFile ? VETS.find((v) => v.id === r.vetFromFile)!.first : 'FieldVet fördelar';
                return (
                  <div key={r.line} role="listitem" className={`imp-row ${r.visit ? (r.issues.length ? 'warn' : 'ok') : 'bad'}`}>
                    <span className="ir-ic">{r.visit ? (r.issues.length ? <LuTriangleAlert size={15} /> : <LuCheck size={15} />) : <LuCircleAlert size={15} />}</span>
                    <span className="ir-time tnum">{r.visit ? hhmm(r.visit.window.from) : r.raw.time || '–'}</span>
                    <span className="ir-main">
                      <b>{r.raw.patient || 'Namn saknas'}</b>
                      <span className="muted">{[r.raw.kind, r.visit ? r.visit.address.area : r.raw.area || r.raw.street].filter(Boolean).join(' · ')}</span>
                      {r.issues.map((i) => <span key={i.text} className={`ir-issue ${i.level}`}>{i.text}</span>)}
                    </span>
                    <span className="ir-vet">{r.visit ? vet : `Rad ${r.line}`}</span>
                    {place && (
                      <select className="ir-fix" aria-label={`Välj stadsdel för ${r.raw.patient}`} value={fixes[r.line] ?? ''} onChange={(e) => setFixes({ ...fixes, [r.line]: e.target.value })}>
                        <option value="">Välj stadsdel…</option>
                        {AREAS.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-foot">
          {step === 'map' && <button className="btn ghost" onClick={() => setStep('file')}><LuArrowLeft size={15} />Annan fil</button>}
          {step === 'check' && <button className="btn ghost" onClick={() => setStep('map')}><LuArrowLeft size={15} />Ändra kolumner</button>}
          {step === 'map' && (
            <>
              {missing.length > 0 && <span className="foot-note">Välj kolumn för {missing.map((f) => f.label.toLowerCase()).join(', ')}</span>}
              <button className="btn primary" disabled={missing.length > 0} onClick={() => setStep('check')}>Kontrollera {table.length - 1} rader</button>
            </>
          )}
          {step === 'check' && (
            <>
              <span className="foot-note">{byFV ? `FieldVet fördelar ${byFV} besök. ` : ''}Planen blir version 1 för dagen.</span>
              <button className="btn primary" disabled={!ok.length || busy} onClick={plan}><LuWandSparkles size={15} />{busy ? 'Planerar…' : `Planera och godkänn ${ok.length} besök`}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
