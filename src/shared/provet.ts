// The boundary between FieldVet and Provet (the clinic's practice system, master for owners, patients, bookings,
// journal and communication preferences). FieldVet runs today's field work and *asks* Provet to do things;
// it never becomes a second customer register, sms system or medical record.
//
// The UI never sees these adapters directly: the store calls them, and in production the same calls run
// server-side with the clinic's Provet credentials (never in the browser). Everything here is a deterministic
// mock so the demo behaves the same every time.
import { buildVisits, t, type Visit } from './data';

/* ——————————————— Shared availability (demo switch "Provet slutar svara") ——————————————— */
export const provetStatus = { up: true };

/* ——————————————— Customer communication ——————————————— */

/** Structured communication events. FieldVet decides *when* one is useful; Provet decides *whether and how* it is sent. */
export type CommEventType =
  | 'VETERINARIAN_ON_THE_WAY'
  | 'ETA_UPDATED'
  | 'VETERINARIAN_DELAYED'
  | 'ARRIVAL_WINDOW_UPDATED'
  | 'VISIT_CANCELLED_OR_MOVED'
  | 'CLINIC_APPOINTMENT_BOOKED';

/** pending = Skickar…, sent = Ägaren informerad ✓, failed = Kunde inte skickas, blocked = not allowed per Provet preferences. */
export type CommState = 'pending' | 'sent' | 'failed' | 'blocked';

export interface CommEvent {
  /** Stable idempotency key: the same operational fact always produces the same key. */
  key: string;
  visitId: string;
  type: CommEventType;
  window: { from: number; to: number };
  arrive: number;
  createdAt: number;
  state: CommState;
  attempts: number;
  /** Provet's message reference once sent. */
  ref?: string;
  /** Plain-language reason for failed/blocked. Never a raw API error. */
  reason?: string;
  /** How the owner was informed: through Provet, or by phone from the coordinator. */
  via?: 'provet' | 'telefon';
}

/** Business rules for updated ETAs. Configurable here, not buried in UI components. */
export const COMM_RULES = {
  /** A new time is only sent if the arrival moves at least this much. */
  etaChangeMin: 10,
  /** After an update, wait this long before the next one … */
  quietMin: 10,
  /** … unless the change is at least this big. */
  bigChangeMin: 20,
  /** Arrival window length shown to the owner. */
  windowMin: 15,
};

export const COMM_LABEL: Record<CommEventType, string> = {
  VETERINARIAN_ON_THE_WAY: 'På väg',
  ETA_UPDATED: 'Ny ankomsttid',
  VETERINARIAN_DELAYED: 'Försenad',
  ARRIVAL_WINDOW_UPDATED: 'Ny tid',
  VISIT_CANCELLED_OR_MOVED: 'Besöket flyttat',
  CLINIC_APPOINTMENT_BOOKED: 'Tid på kliniken',
};

/** Idempotency key. "On the way" is tied to the departure; time messages to the window the owner would see. */
export function commKey(visitId: string, type: CommEventType, win: { from: number; to: number }, departedAt?: number): string {
  if (type === 'VETERINARIAN_ON_THE_WAY') return `${visitId}:ON_THE_WAY:${departedAt ?? win.from}`;
  return `${visitId}:${type}:${win.from}-${win.to}`;
}

/** Should a driving vet's owner get a new time? Small changes and rapid recalculations do not trigger messages. */
export function shouldUpdateEta(last: { arrive: number; sentAt: number } | undefined, arrive: number, now: number, rules = COMM_RULES): boolean {
  if (!last) return false;
  const change = Math.abs(arrive - last.arrive);
  if (change < rules.etaChangeMin) return false;
  return now - last.sentAt >= rules.quietMin || change >= rules.bigChangeMin;
}

/** Ledger check before creating an outbound event: an identical event that is pending or sent is a duplicate. */
export function isDuplicate(ledger: CommEvent[], key: string): boolean {
  return ledger.some((e) => e.key === key && (e.state === 'pending' || e.state === 'sent'));
}

export type SendResult = { ok: true; ref: string; duplicate?: boolean } | { ok: false; reason: string };

export interface ProvetMessagingAdapter {
  /** Ask Provet to send the clinic's template for this event. Idempotent on `key`. */
  send(e: CommEvent, owner: { first: string }, vetFirst: string): Promise<SendResult>;
  stats(): { delivered: number; duplicatesIgnored: number; failed: number };
  reset(): void;
}

/* ——————————————— Patient context and preferences ——————————————— */

export interface CommPreference { sms: boolean; reason?: string }
export interface ProvetPatientAdapter {
  /** Communication preference as recorded in Provet. FieldVet has no consent model of its own. */
  commPreference(visitId: string): CommPreference;
}

/* ——————————————— Clinical history (read-only, on demand) ——————————————— */

export interface HistoryEntry {
  id: string;
  date: string;
  type: string;
  vet: string;
  summary: string;
  diagnoses?: string[];
  medications?: string[];
  procedures?: string[];
  /** Full note text. Only fetched when the vet asks for it ("Visa hela anteckningen"). */
  fullNote?: string;
}
export interface HistoryResult { ok: true; entries: HistoryEntry[]; fetchedAt: number }
export type HistoryResponse = HistoryResult | { ok: false; reason: 'nekad' | 'offline' | 'provet' };

export interface ProvetClinicalHistoryAdapter {
  /** Called by the FieldVet backend after its own authorization check. Returns a concise, read-only list. */
  fetch(patientRef: string, now: number): Promise<HistoryResponse>;
  /** Full note for one entry, fetched separately (progressive disclosure). */
  fullNote(patientRef: string, entryId: string): Promise<string | null>;
}

/* ——————————————— Bookings and journal ——————————————— */

export interface ProvetBookingAdapter {
  /** Today's home-visit bookings from Provet (the file import is the fallback when the API is not connected). */
  todaysHomeVisits(): Visit[];
}
export interface SignedNotePayload { visitId: string; signedBy: string; signedAt: number; atgarder: string[]; lakemedel: { name: string; dose: string }[]; text: string }
export type WriteResult = { ok: true; ref: string; duplicate?: boolean } | { ok: false; error: string };
export interface ProvetJournalWritebackAdapter {
  /** Write a signed note. Idempotent on visit + signing time, so a retry never creates a second note. */
  writeSignedNote(p: SignedNotePayload): Promise<WriteResult>;
  stats(): { written: number; duplicatesIgnored: number };
  reset(): void;
}

/* ═══════════════════════ Mock implementations ═══════════════════════ */

const DELAY = { send: 700, history: 650, note: 300, journal: 1400 };

class MockMessaging implements ProvetMessagingAdapter {
  private sent = new Map<string, string>();
  private n = { delivered: 0, duplicatesIgnored: 0, failed: 0 };
  private seq = 4100;
  send(e: CommEvent): Promise<SendResult> {
    return new Promise((res) => setTimeout(() => {
      if (!provetStatus.up) { this.n.failed++; res({ ok: false, reason: 'Provet svarar inte just nu' }); return; }
      const prev = this.sent.get(e.key);
      if (prev) { this.n.duplicatesIgnored++; res({ ok: true, ref: prev, duplicate: true }); return; }
      const ref = `PV-MSG-${++this.seq}`;
      this.sent.set(e.key, ref);
      this.n.delivered++;
      res({ ok: true, ref });
    }, DELAY.send));
  }
  stats() { return { ...this.n }; }
  reset() { this.sent.clear(); this.n = { delivered: 0, duplicatesIgnored: 0, failed: 0 }; this.seq = 4100; }
}

/** Owners whose Provet record says no sms (e.g. landline only). */
const NO_SMS: Record<string, string> = { 'v-frasse': 'Fast telefon, tar inte emot sms', 'v-sigge': 'Fast telefon, tar inte emot sms' };
const MockPatient: ProvetPatientAdapter = {
  commPreference: (visitId) => (NO_SMS[visitId] ? { sms: false, reason: NO_SMS[visitId] } : { sms: true }),
};

const VETNAME: Record<string, string> = { anna: 'Anna Lindqvist', johan: 'Johan Berg', sara: 'Sara Nyström', erik: 'Erik Holm', klinik: 'Kliniken' };
type Seed = Omit<HistoryEntry, 'id' | 'vet'> & { vet: keyof typeof VETNAME };
/** A few realistic entries per patient. Fictional. */
const HISTORY: Record<string, Seed[]> = {
  'v-bosse': [
    { date: '2025-09-30', type: 'Vaccination', vet: 'anna', summary: 'Årlig vaccination. Lindrig svullnad vid injektionsstället efter 20 min, gick över utan behandling.', procedures: ['Vaccination DHP + kennelhosta'], diagnoses: ['Lindrig vaccinreaktion'],
      fullNote: 'Anamnes: Pigg, äter och dricker normalt. Inga problem sedan förra besöket.\nStatus: AT ua. Vikt 33,5 kg. Hjärta och lungor ua.\nÅtgärd: Vaccination DHP + kennelhosta, vänster bröstkorgsvägg.\nEfter 20 min lätt svullnad vid injektionsstället, ca 2 cm. Ingen påverkan på andning eller allmäntillstånd. Gick tillbaka på 40 min.\nRåd: Observera 15–20 min efter nästa vaccination. Notera i journal.' },
    { date: '2025-06-12', type: 'Hud och klåda', vet: 'klinik', summary: 'Säsongsbunden klåda, tassar och buk. Startat Apoquel vid behov.', diagnoses: ['Atopisk dermatit, misstänkt'], medications: ['Apoquel 16 mg, 1 tablett dagligen vid behov'],
      fullNote: 'Anamnes: Slickar tassar sedan maj, värre efter promenader i gräs.\nStatus: Erytem interdigitalt och på buken. Inga sår.\nBedömning: Misstänkt atopi, säsongsbunden.\nBehandling: Apoquel 16 mg vid behov. Återbesök vid försämring.' },
    { date: '2024-09-25', type: 'Vaccination', vet: 'anna', summary: 'Vaccination utan anmärkning. Frisk.', procedures: ['Vaccination DHP'] },
  ],
  'v-luna': [
    { date: '2025-11-03', type: 'Allmän undersökning', vet: 'anna', summary: 'Tandsten grad 1. Vikt stabil. Ingen åtgärd.', diagnoses: ['Tandsten grad 1'] },
    { date: '2024-02-14', type: 'Akut', vet: 'klinik', summary: 'Kräkts efter att ha ätit snöre. Röntgen utan främmande kropp. Kom hem samma dag.', procedures: ['Röntgen buk'] },
  ],
  'v-milo': [
    { date: '2026-04-22', type: 'Öronundersökning', vet: 'johan', summary: 'Öroninflammation höger öra. Behandlat med örondroppar 10 dagar, bra effekt.', diagnoses: ['Otitis externa, höger'], medications: ['Surolan örondroppar 10 dagar'] },
  ],
  'v-sigge': [
    { date: '2026-03-10', type: 'Seniorkontroll', vet: 'anna', summary: 'Kreatinin 190. Startat Semintra. Kontroll var 6:e månad.', diagnoses: ['Kronisk njursjukdom, IRIS 2'], medications: ['Semintra 4 mg/ml dagligen'], procedures: ['Blodprov', 'Blodtryck'] },
    { date: '2025-09-08', type: 'Seniorkontroll', vet: 'anna', summary: 'Kreatinin 165, lätt förhöjt. Ny kontroll om 6 månader.', procedures: ['Blodprov'] },
  ],
};
function genericHistory(v: Visit): Seed[] {
  const out: Seed[] = [];
  if (v.lastNote) out.push({ date: '2026-03-18', type: 'Tidigare besök', vet: 'klinik', summary: v.lastNote, medications: v.flags.medication && v.flags.medication !== 'Ingen' ? [v.flags.medication] : undefined });
  out.push({ date: '2025-10-02', type: 'Hälsokontroll', vet: 'klinik', summary: 'Allmän hälsokontroll utan anmärkning.' });
  return out;
}
const VISITS = Object.fromEntries(buildVisits().map((v) => [v.id, v]));

const MockHistory: ProvetClinicalHistoryAdapter = {
  fetch: (ref, now) => new Promise((res) => setTimeout(() => {
    if (!provetStatus.up) { res({ ok: false, reason: 'provet' }); return; }
    const v = VISITS[ref];
    const seeds = HISTORY[ref] ?? (v ? genericHistory(v) : [{ date: '2025-10-02', type: 'Hälsokontroll', vet: 'klinik' as const, summary: 'Ingen tidigare historik på kliniken.' }]);
    // The list never carries full note bodies; those are fetched one at a time.
    res({ ok: true, fetchedAt: now, entries: seeds.map((s, i) => ({ ...s, id: `${ref}-${i}`, vet: VETNAME[s.vet], fullNote: undefined })) });
  }, DELAY.history)),
  fullNote: (ref, entryId) => new Promise((res) => setTimeout(() => {
    if (!provetStatus.up) { res(null); return; }
    const i = Number(entryId.split('-').pop());
    const s = (HISTORY[ref] ?? (VISITS[ref] ? genericHistory(VISITS[ref]) : []))[i];
    res(s ? s.fullNote ?? s.summary : null);
  }, DELAY.note)),
};

const MockBooking: ProvetBookingAdapter = { todaysHomeVisits: () => buildVisits() };

class MockJournal implements ProvetJournalWritebackAdapter {
  private written = new Map<string, string>();
  private n = { written: 0, duplicatesIgnored: 0 };
  private seq = 1000;
  writeSignedNote(p: SignedNotePayload): Promise<WriteResult> {
    const key = `${p.visitId}:${p.signedAt}`;
    return new Promise((res) => setTimeout(() => {
      if (!provetStatus.up) { res({ ok: false, error: 'Provet svarar inte' }); return; }
      const prev = this.written.get(key);
      if (prev) { this.n.duplicatesIgnored++; res({ ok: true, ref: prev, duplicate: true }); return; }
      const ref = `PV-JR-${++this.seq}`;
      this.written.set(key, ref);
      this.n.written++;
      res({ ok: true, ref });
    }, DELAY.journal));
  }
  stats() { return { ...this.n }; }
  reset() { this.written.clear(); this.n = { written: 0, duplicatesIgnored: 0 }; this.seq = 1000; }
}

export const provet = {
  booking: MockBooking,
  patient: MockPatient,
  history: MockHistory,
  messaging: new MockMessaging() as ProvetMessagingAdapter,
  journal: new MockJournal() as ProvetJournalWritebackAdapter,
  reset() { provetStatus.up = true; this.messaging.reset(); this.journal.reset(); },
};

/** Cached history on the phone: summaries only (no full notes), deleted when the shift ends. */
export interface CachedHistory { entries: HistoryEntry[]; fetchedAt: number; expiresAt: number }
export const HISTORY_CACHE_UNTIL = t('18:00');
