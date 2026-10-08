// Single source of truth for the demo. Views never read raw state: CoordinatorScope and VetScope hand them
// a role-filtered copy (see shared/access.ts), and every action is checked against the actor's permissions.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COORDINATOR, t, VETS, type Visit } from './shared/data';
import { autoSigned } from './shared/journal';
import * as A from './shared/actions';
import {
  advance, fixesFor, hhmm, LATE_TOL, optimizeDay, planAll, planVet, vetById,
  type Proposal, type Suggestion, type VetPlan, type World,
} from './shared/engine';
import { initialWorld } from './shared/world';
import type { Journal } from './shared/journal';
import { etaWindow, riskLevel } from './shared/ops';
import { can, viewWorld, type Permission, type Role as AccessRole } from './shared/access';
import { COMM_LABEL, commKey, isDuplicate, provet, provetStatus, shouldUpdateEta, type CachedHistory, type CommEvent, type CommEventType, type CommState, type HistoryResponse, type SendResult } from './shared/provet';

export type Role = 'samordnare' | 'veterinar' | 'bada'; // demo view mode
export interface Msg {
  id: string; vetId: string; from: 'samordnare' | 'vet' | 'system'; text: string; at: number; read?: boolean;
  voice?: { sec: number }; // voice message: `text` is the transcript
  pending?: boolean; // sent from the phone while offline; delivered on reconnect
}
export interface FeedEvent { id: string; kind: 'avbokning'; visitId: string; vetId: string; at: number; handled?: boolean }
export interface VetRequest { id: string; vetId: string; visitId?: string; at: number; proposal: Proposal }
export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; text: string; tone?: 'ok' | 'info' | 'warn'; action?: ToastAction }
/** Slack (simulated adapter). FieldVet posts operational events only, never clinical content. */
export interface SlackMsg { id: string; at: number; author: string; title?: string; bot?: boolean; mine?: boolean; text: string }
export interface SlackThread { id: string; channel: string; root: SlackMsg; replies: SlackMsg[]; visitId?: string; request?: 'hembesok'; requestTitle?: string; handled?: boolean; readAt: number }
/** What the owner has been told (simulated sms + ETA link). No clinical content, only name, time and status. */
export interface CustomerEta {
  arrive: number; from: number; to: number; sentAt: number; kind: 'påväg' | 'ny tid' | 'akut' | 'klinik'; count: number; clinicAt?: number;
  /** The communication event behind it (sent through Provet) and its delivery state. */
  type: CommEventType; key: string; state: CommState; reason?: string; via?: 'provet' | 'telefon';
}
/** Home visit continuing at the clinic: an operational handoff, not a medical record. */
export type HandoffPriority = 'akut' | 'idag' | 'planerad';
export interface Handoff {
  id: string; visitId: string; vetId: string; at: number; reason: string; priority: HandoffPriority; note: string; pref: string;
  status: 'ny' | 'bekraftad' | 'avvaktar';
  outcome?: { kind: 'slot' | 'akut' | 'avvakta'; at?: number; label: string; by: string; decidedAt: number };
}
/** Audit entries hold ids, names and actions only — never clinical text, tokens or contact details. */
export interface AuditEvent { id: number; at: number; actor: string; role: AccessRole | 'system'; action: string; target?: string; outcome?: 'ok' | 'nekad' | 'fel' }
type VetOp =
  | { k: 'startNav' } | { k: 'arrive' } | { k: 'startVisit' } | { k: 'extend'; min: number } | { k: 'finish'; extra: Partial<Visit> }
  | { k: 'saveJournal'; visitId: string; j: Journal } | { k: 'signJournal'; visitId: string; j: Journal } | { k: 'overrun'; min: number }
  | { k: 'ack'; visitId: string };
interface Actor { role: AccessRole; name: string; vetId?: string }

export interface AppState {
  world: World; // server state (approved plan + reported statuses)
  device: { world: World; since: number } | null; // vet phone while offline
  outbox: VetOp[];
  provetDown: boolean;
  approval: { version: number; by: string; at: number };
  messages: Msg[];
  events: FeedEvent[];
  request: VetRequest | null;
  delayAck: Record<string, number>;
  history: string[];
  audit: AuditEvent[];
  slack: SlackThread[];
  /** Bumped by "Återställ demo" so all local UI state (open drawers, sheets, screens) remounts. */
  epoch: number;
  /** Summary of the last file import, shown once under "Att hantera". */
  imported?: { count: number; source: string; byFieldVet: number; skipped: number; dismissed?: boolean };
  /** Arrival window last communicated to the owner, per visit (sms and link are simulated). */
  eta: Record<string, CustomerEta>;
  handoffs: Handoff[];
  /** Urgent visits created but not yet assigned to a team. */
  pendingUrgent: Visit[];
  /** Outbound communication events (idempotent). Lightweight operational state, not a message history. */
  comms: CommEvent[];
  /** Identical events stopped before reaching Provet (retries, reconnects). */
  commDupes: number;
  /** Phone cache of history summaries (no full notes), deleted when the shift ends. */
  historyCache: Record<string, CachedHistory>;
}

export interface Alert {
  id: string;
  tone: 'crit' | 'warn' | 'watch' | 'info';
  title: string;
  sub: string;
  action: string;
  kind: 'risk' | 'overtime' | 'cancel' | 'request' | 'message' | 'gap' | 'journal' | 'offline' | 'import' | 'eta' | 'urgent' | 'handoff' | 'ack' | 'comm';
  /** Slack thread behind an urgent request, when there is one. */
  threadId?: string;
  /** Unassigned urgent visit draft, or clinic handoff, behind the item. */
  draftId?: string;
  handoffId?: string;
  /** Clinical priority (patient) versus operational planning problem. Shown differently. */
  cat: 'klinisk' | 'drift' | 'info';
  /** Contextual only: shown next to the team or visit, never in "Behöver åtgärdas". */
  quiet?: boolean;
  visitId?: string;
  vetId?: string;
}

const COORD: Actor = { role: 'samordnare', name: COORDINATOR.name };
let auditSeq = 0;
let msgSeq = 100;

function initialState(): AppState {
  const world = initialWorld();
  return {
    world, device: null, outbox: [], provetDown: false, epoch: 0, eta: {}, handoffs: [], pendingUrgent: [], comms: [], commDupes: 0, historyCache: {},
    approval: { version: world.planVersion, by: COORDINATOR.name, at: t('07:45') },
    messages: [
      { id: 'm1', vetId: 'anna', from: 'samordnare', text: 'God morgon Anna! Dagens rutt är klar, 6 besök. Säg till om något krånglar.', at: t('07:48'), read: true },
      { id: 'm2', vetId: 'anna', from: 'vet', text: 'Tack! Laddar bilen och åker strax.', at: t('07:52'), read: true },
      { id: 'm3', vetId: 'johan', from: 'vet', text: 'Ellie klar, på väg till Nova.', at: t('08:01'), read: true },
      { id: 'm4', vetId: 'sara', from: 'samordnare', text: 'Kasper är akut – ägaren väntar i porten.', at: t('08:12'), read: true },
    ],
    events: [], request: null, delayAck: {}, history: [],
    audit: [{ id: ++auditSeq, at: t('07:45'), actor: COORDINATOR.name, role: 'samordnare', action: 'Godkände dagens plan (version 1)', outcome: 'ok' }],
    slack: [
      { id: 'th-plan', channel: 'hembesok-stockholm', readAt: t('08:06'), root: { id: 's1', at: t('07:45'), author: 'FieldVet', bot: true, text: 'Dagens plan är godkänd (v1): 4 veterinärer, 22 hembesök. Samordnare: Maria Ahlberg.' },
        replies: [{ id: 's2', at: t('07:50'), author: 'Johan Berg', title: 'Veterinär', text: 'Kör från Skanstull nu.' }, { id: 's3', at: t('08:05'), author: 'Sara Nyström', title: 'Veterinär', text: 'Kasper först, ägaren väntar i porten.' }] },
      { id: 'th-ultra', channel: 'klinik-stockholm', readAt: 0, root: { id: 's4', at: t('08:10'), author: 'Karl Envall', title: 'Klinikchef', text: 'Ultraljudet på kliniken är ledigt 14–16 idag om någon behöver remittera.' }, replies: [] },
      { id: 'th-bosse', channel: 'hembesok-stockholm', readAt: 0, visitId: 'v-bosse', root: { id: 's5', at: t('08:12'), author: 'Lina Sund', title: 'Reception', text: 'Obs till Anna: vägarbete på Dalagatan. Gästparkeringen på gården gäller fortfarande enligt ägaren.' }, replies: [] },
      { id: 'th-lunch', channel: 'klinik-stockholm', readAt: 0, root: { id: 's7', at: t('08:40'), author: 'Karl Envall', title: 'Klinikchef', text: 'Veckomötet flyttas till 12:30 idag. Hembesöksteamet kan vara med på länk.' }, replies: [] },
      { id: 'th-tessan', channel: 'reception', readAt: 0, request: 'hembesok', requestTitle: 'Tessan, katt · Kungsholmen', root: { id: 's6', at: t('08:18'), author: 'Lina Sund', title: 'Reception', text: 'Ägare ringde: katten Tessan, 12 år, Fleminggatan 97 på Kungsholmen. Har kräkts sedan i natt och vill inte dricka. Kan hembesöken ta henne före lunch?' }, replies: [] },
    ],
  };
}

export function deriveAlerts(s: AppState, w: World, plans: Record<string, VetPlan>): Alert[] {
  const out: Alert[] = [];
  if (s.imported && !s.imported.dismissed) {
    const i = s.imported;
    out.push({ id: 'import', tone: 'info', cat: 'info', quiet: true, kind: 'import', title: `Dagens plan importerad: ${i.count} besök`, sub: `Från ${i.source}.${i.byFieldVet ? ` FieldVet fördelade ${i.byFieldVet} besök.` : ''}${i.skipped ? ` ${i.skipped} ${i.skipped === 1 ? 'rad togs' : 'rader togs'} inte med.` : ''} Rutterna är skickade till apparna.`, action: 'Klar' });
  }
  if (s.device) {
    const vet = vetById(w.manualVet);
    out.push({ id: 'offline', tone: 'warn', cat: 'info', kind: 'offline', vetId: vet.id, title: `Ingen kontakt med ${vet.first}s app sedan ${hhmm(s.device.since)}`, sub: 'Visar senast kända läge. Ändringar synkas när täckningen är tillbaka.', action: 'Visa' });
  }
  if (s.request) {
    const v = vetById(s.request.vetId);
    out.push({ id: `req-${s.request.id}`, tone: 'warn', cat: 'drift', kind: 'request', vetId: v.id, visitId: s.request.visitId, title: `${v.first} föreslår en ny rutt`, sub: s.request.proposal.title, action: 'Granska' });
  }
  for (const e of s.events.filter((e) => !e.handled)) {
    const v = w.visits[e.visitId];
    if (!v) continue;
    out.push({ id: e.id, tone: 'info', cat: 'drift', kind: 'cancel', visitId: e.visitId, vetId: e.vetId, title: `${v.patient.name} ${hhmm(v.window.from)} är avbokad`, sub: `${vetById(e.vetId).first} får en lucka · ${v.address.area}`, action: 'Se förslag' });
  }
  for (const p of Object.values(plans)) {
    const cause = p.stops.find((x) => (x.state === 'pågår' || x.state === 'framme') && w.visits[x.id].extension > 0);
    for (const st of p.stops) {
      if (st.state === 'klar' || st.late <= LATE_TOL) continue;
      const v = w.visits[st.id];
      const level = riskLevel(st.late);
      const why = cause && cause.id !== st.id ? `${w.visits[cause.id].patient.name}s besök drar över` : p.delay > 5 ? `${p.vet.first} ligger ${p.delay} min efter` : v.address.area;
      const told = s.eta[st.id]?.arrive;
      if (told != null && Math.abs(told - st.arrive) <= 5) {
        // Plan kept and the owner has the new time: nothing left to do, shown in context only.
        out.push({ id: `risk-${st.id}`, tone: 'watch', cat: 'drift', quiet: true, kind: 'risk', visitId: st.id, vetId: p.vet.id, title: `${v.patient.name} blir sen, ägaren har fått ny tid`, sub: `Ny tid ${hhmm(told)} · ${p.vet.first}`, action: 'Visa' });
        continue;
      }
      out.push({
        id: `risk-${st.id}`, tone: level === 'atgarda' ? 'warn' : 'watch', cat: 'drift', kind: 'risk', visitId: st.id, vetId: p.vet.id,
        title: `${v.patient.name} riskerar att bli ${st.late} min sen`,
        sub: `${why} · ${p.vet.first}${v.locked ? ' · låst tid' : ''}`, action: 'Se lösning',
      });
    }
    // Owner was told an arrival time that no longer holds (but the visit is still inside its window).
    const nx = p.stops.find((x) => x.state === 'kommande' || x.state === 'påväg');
    if (nx && nx.late <= LATE_TOL) {
      const v = w.visits[nx.id];
      const promised = s.eta[nx.id]?.arrive ?? v.plannedArrive ?? v.window.from;
      const diff = nx.arrive - promised;
      if (diff > 10) out.push({ id: `eta-${nx.id}`, tone: 'info', cat: 'drift', kind: 'eta', visitId: nx.id, vetId: p.vet.id, title: `Ny tid till ${v.owner.first}? ${v.patient.name} blir ${diff} min senare`, sub: `Framme ca ${hhmm(nx.arrive)} · fortfarande inom bokad tid · ${p.vet.first}`, action: 'Skicka ny tid' });
    }
    if (p.overtime > 5) out.push({ id: `ot-${p.vet.id}`, tone: 'warn', cat: 'drift', kind: 'overtime', vetId: p.vet.id, title: `${p.vet.first} slutar ca ${p.overtime} min för sent`, sub: `Klar ${hhmm(p.endAt)}, passet slutar ${hhmm(p.vet.shift.end)}`, action: 'Se lösning' });
  }
  for (const m of s.messages.filter((m) => m.from === 'vet' && !m.read)) {
    out.push(m.voice
      ? { id: `msg-${m.id}`, tone: 'info', cat: 'info', kind: 'message', vetId: m.vetId, title: `Röstmeddelande från ${vetById(m.vetId).first} (${Math.floor(m.voice.sec / 60)}:${String(m.voice.sec % 60).padStart(2, '0')})`, sub: `”${m.text.length > 70 ? m.text.slice(0, 68) + '…' : m.text}”`, action: 'Lyssna' }
      : { id: `msg-${m.id}`, tone: 'info', cat: 'info', kind: 'message', vetId: m.vetId, title: `${vetById(m.vetId).first}: ”${m.text}”`, sub: `Meddelande ${hhmm(m.at)}`, action: 'Svara' });
  }
  for (const p of Object.values(plans)) {
    if (p.state === 'dagen-klar') continue;
    let best = { len: 0, from: 0 };
    let tt = Math.max(w.now, p.vet.shift.start);
    for (const st of p.stops) {
      if (st.state !== 'kommande') { tt = Math.max(tt, st.end); continue; }
      const gapFrom = Math.max(tt, w.now);
      const len = st.departAt - gapFrom;
      if (len > best.len) best = { len, from: gapFrom };
      tt = st.end;
    }
    if (best.len >= 80) out.push({ id: `gap-${p.vet.id}`, tone: 'info', cat: 'info', quiet: true, kind: 'gap', vetId: p.vet.id, title: `${p.vet.first} har ${Math.floor(best.len / 60)} h ${best.len % 60} min ledigt från ${hhmm(best.from)}`, sub: 'Plats för akuta besök', action: 'Visa' });
  }
  for (const v of Object.values(w.visits)) {
    if (v.status !== 'klar' || v.journal?.state === 'signerad') continue;
    out.push({ id: `jr-${v.id}`, tone: 'info', cat: 'info', quiet: true, kind: 'journal', visitId: v.id, vetId: v.vetId, title: `Journal för ${v.patient.name} är inte signerad`, sub: `${vetById(v.vetId).first} · klart ${hhmm(v.actual.finishedAt ?? w.now)}`, action: 'Visa' });
  }
  for (const d of s.pendingUrgent) {
    out.push({ id: `draft-${d.id}`, tone: 'crit', cat: 'klinisk', kind: 'urgent', draftId: d.id, title: `Nytt akutärende · ${d.address.area}`, sub: `${d.patient.name}, ${d.patient.species.toLowerCase()} · registrerat ${hhmm(d.window.from)}`, action: 'Tilldela' });
  }
  for (const h of s.handoffs) {
    const v = w.visits[h.visitId];
    if (!v || h.status === 'bekraftad') continue;
    const when = h.priority === 'akut' ? 'nu' : h.priority === 'idag' ? 'idag' : 'senare';
    if (h.status === 'ny') out.push({ id: `ho-${h.id}`, tone: 'crit', cat: 'klinisk', kind: 'handoff', handoffId: h.id, visitId: v.id, vetId: h.vetId, title: `${v.patient.name} behöver klinik ${when}`, sub: `${h.reason} · från ${vetById(h.vetId).first}`, action: 'Ordna' });
    else out.push({ id: `ho-${h.id}`, tone: 'info', cat: 'klinisk', kind: 'handoff', handoffId: h.id, visitId: v.id, vetId: h.vetId, title: `Kliniktid för ${v.patient.name} väntar`, sub: 'Ring ägaren innan tiden bokas', action: 'Ordna' });
  }
  for (const v of Object.values(w.visits)) {
    if (!v.isNew || v.priority !== 'akut' || v.ack != null || v.assignedAt == null || (v.status !== 'planerad' && v.status !== 'påväg')) continue;
    out.push({ id: `ack-${v.id}`, tone: 'watch', cat: 'info', quiet: true, kind: 'ack', visitId: v.id, vetId: v.vetId, title: `Väntar på att ${vetById(v.vetId).first} bekräftar ${v.patient.name}`, sub: `Tilldelat ${hhmm(v.assignedAt)} · syns redan i appen`, action: 'Visa' });
  }
  for (const th of s.slack) {
    if (th.request !== 'hembesok' || th.handled || th.root.at > w.now) continue;
    const [who, area] = (th.requestTitle ?? 'Förfrågan').split(' · ');
    out.push({ id: `urgent-${th.id}`, tone: 'crit', cat: 'klinisk', kind: 'urgent', threadId: th.id, title: `Nytt akutärende${area ? ` · ${area}` : ''}`, sub: `${who} · från ${th.root.title?.toLowerCase() ?? 'kliniken'}en ${hhmm(th.root.at)}`, action: 'Tilldela' });
  }
  // Customer communication that did not go out. Routine failures go to the coordinator, not the vet.
  for (const [id, e] of Object.entries(s.eta)) {
    const v = w.visits[id];
    if (!v || v.status === 'klar' || v.status === 'avbokad') continue;
    if (e.state === 'failed') out.push({ id: `comm-${id}`, tone: 'warn', cat: 'drift', kind: 'comm', visitId: id, vetId: v.vetId, title: `Kundmeddelandet till ${v.owner.first} kunde inte skickas`, sub: `${v.patient.name} · ${COMM_LABEL[e.type]} ${hhmm(e.from)}–${hhmm(e.to)} · Provet svarar inte`, action: 'Försök igen' });
    else if (e.state === 'blocked' && v.status === 'påväg') out.push({ id: `comm-${id}`, tone: 'info', cat: 'drift', kind: 'comm', visitId: id, vetId: v.vetId, title: `Ring ${v.owner.first} om ankomsttiden?`, sub: `${v.patient.name} · ${e.reason ?? 'Tar inte emot sms'} (enligt Provet) · framme ca ${hhmm(e.arrive)}`, action: 'Kontakta ägaren' });
  }
  const rank: Record<Alert['kind'], number> = { import: -1, offline: 0, urgent: 1, handoff: 2, request: 3, risk: 4, overtime: 5, comm: 6, eta: 7, ack: 8, cancel: 9, message: 10, journal: 11, gap: 12 };
  const toneRank: Record<Alert['tone'], number> = { crit: 0, warn: 1, watch: 2, info: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || toneRank[a.tone] - toneRank[b.tone]);
}

export interface Acts {
  startNav: () => void;
  arrive: () => void;
  startVisit: () => void;
  extend: (min: number) => void;
  finish: (extra: Partial<Visit>) => void;
  addUrgent: (v: Visit, sug: Suggestion) => boolean;
  reassign: (visitId: string, sug: Suggestion) => boolean;
  apply: (p: Proposal, note?: string) => boolean;
  cancel: (visitId: string) => boolean;
  setLock: (visitId: string, lock: boolean) => boolean;
  rejectEvent: (id: string) => void;
  rejectRequest: () => void;
  advanceMin: (min: number) => void;
  forceOverrun: (min: number) => void;
  send: (vetId: string, from: Msg['from'], text: string) => void;
  sendVoice: (vetId: string, transcript: string, sec: number) => void;
  markRead: (vetId: string) => void;
  markReadVet: (vetId: string) => void;
  requestProposal: (p: Proposal, visitId?: string) => boolean;
  ackDelay: (visitId: string, delay: number) => void;
  saveJournal: (visitId: string, j: Journal) => void;
  signJournal: (visitId: string, j: Journal) => void;
  retrySync: (visitId: string) => void;
  openJournal: (visitId: string) => boolean;
  setOffline: (off: boolean) => void;
  slackReply: (threadId: string, text: string) => void;
  slackRead: (threadId: string) => void;
  slackLinkVisit: (threadId: string, visitId: string, vetId: string, eta: string) => void;
  /** Replace the day with imported bookings; the coordinator approves the new plan by importing. */
  importDay: (world: World, info: { count: number; source: string; byFieldVet: number; skipped: number }) => void;
  dismissImport: () => void;
  sendEta: (visitId: string, arrive: number) => void;
  /** Vet confirms a newly assigned urgent visit in the app. */
  ackVisit: (visitId: string) => void;
  /** Vet: the patient should continue at the clinic. */
  requestHandoff: (h: Pick<Handoff, 'reason' | 'priority' | 'note' | 'pref'>) => boolean;
  /** Coordinator: book the clinic continuation, arrange urgent arrival, or hold. */
  decideHandoff: (id: string, o: { kind: 'slot' | 'akut' | 'avvakta'; at?: number; label: string }) => boolean;
  /** Keep an urgent visit in the queue until it is assigned. */
  saveUrgentDraft: (v: Visit) => void;
  dropUrgentDraft: (id: string) => void;
  /** Guided demo story (demo shell only). */
  storyStart: () => void;
  storyReleaseUrgent: () => void;
  storyJumpTo: (visitId: string) => void;
  /** Demo: choose which veterinarian the phone shows. */
  setManualVet: (vetId: string) => void;
  setProvetDown: (down: boolean) => void;
  reset: () => void;
  /** Undo the last plan-changing action, if nothing has changed since. */
  undo: () => boolean;
  /** Coordinator: retry a customer message that failed (same idempotency key). */
  retryComm: (visitId: string) => void;
  /** Coordinator: the owner was informed by phone (e.g. no sms per Provet). */
  markOwnerInformed: (visitId: string) => void;
  /** Vet: read-only patient history from Provet, on demand. Authorization is checked before the adapter is called. */
  readHistory: (visitId: string) => Promise<HistoryResponse & { cached?: boolean }>;
  readFullNote: (visitId: string, entryId: string) => Promise<string | null>;
  /** Demo: queues on the vet's current drive. */
  demoTraffic: (min: number) => boolean;
  /** Demo: the phone re-sends the last event after a network glitch. */
  demoResend: () => boolean;
}

interface Ctx {
  s: AppState; // role-filtered: s.world is the scoped world
  plans: Record<string, VetPlan>;
  alerts: Alert[];
  role: Role;
  setRole: (r: Role) => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone'], action?: ToastAction) => void;
  act: Acts;
  access: Actor;
  can: (p: Permission) => boolean;
  offlineSince: number | null;
  /** Server-side helpers (need full data; unavailable to the field app while offline). */
  server: {
    vetProposal: () => Proposal | null;
    previewPlans: (p: Proposal) => Record<string, VetPlan> | null;
  };
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);
const RawC = createContext<{ s: AppState; raw: (actor: Actor) => Acts; role: Role; setRole: (r: Role) => void; toasts: Toast[]; toast: Ctx['toast'] }>(null as never);

function applyVetOp(w: World, op: VetOp, vetId: string): World {
  switch (op.k) {
    case 'startNav': return A.startNavigation(w, vetId);
    case 'arrive': return A.markArrived(w, vetId);
    case 'startVisit': return A.startVisit(w, vetId);
    case 'extend': return A.extendVisit(w, vetId, op.min);
    case 'finish': return A.finishVisit(w, vetId, op.extra);
    case 'saveJournal': return w.visits[op.visitId] ? { ...w, visits: { ...w.visits, [op.visitId]: { ...w.visits[op.visitId], journal: op.j } } } : w;
    case 'signJournal': {
      const v = w.visits[op.visitId];
      if (!v || v.status !== 'klar' && v.status !== 'pågår') return w;
      return { ...w, visits: { ...w.visits, [op.visitId]: { ...v, journal: op.j, followUp: v.followUp || !!op.j.uppfoljning } } };
    }
    case 'ack': {
      const v = w.visits[op.visitId];
      return v && v.vetId === vetId && v.ack == null ? { ...w, visits: { ...w.visits, [v.id]: { ...v, ack: w.now } } } : w;
    }
    case 'overrun': {
      let x = w;
      for (let i = 0; i < 4; i++) {
        const cur = planVet(vetById(vetId), x.routes[vetId], x.visits, x.now).current;
        if (cur?.state === 'pågår') break;
        if (!cur) x = A.startNavigation(x, vetId);
        else if (cur.state === 'påväg') x = A.markArrived(x, vetId);
        else if (cur.state === 'framme') x = A.startVisit(x, vetId);
      }
      return A.extendVisit(x, vetId, op.min);
    }
  }
}
const OP_LABEL: Record<VetOp['k'], string> = {
  startNav: 'Startade navigering', arrive: 'Markerade framme', startVisit: 'Startade besök', extend: 'Förlängde besök',
  finish: 'Avslutade besök', saveJournal: 'Sparade journalutkast', signJournal: 'Signerade journal', overrun: 'Besök drog över (demo)', ack: 'Bekräftade akutbesöket i appen',
};

const stopOf = (plans: Record<string, VetPlan>, id: string) => {
  for (const p of Object.values(plans)) { const x = p.stops.find((y) => y.id === id); if (x) return x; }
  return undefined;
};
const sysAudit = (st: AppState, action: string, target?: string, outcome: AuditEvent['outcome'] = 'ok'): AppState => ({ ...st, audit: [...st.audit, { id: ++auditSeq, at: st.world.now, actor: 'System', role: 'system', action, target, outcome }] });

/** Create one outbound communication event and hand it to the delivery queue (Provet sends it).
 *  The same operational fact always has the same key, so retries and replays cannot create a second sms. */
function queueComm(st: AppState, visitId: string, type: CommEventType, arrive: number, win: { from: number; to: number }, kind: CustomerEta['kind'], opts: { countDuplicate?: boolean; clinicAt?: number } = {}): AppState {
  const v = st.world.visits[visitId];
  if (!v) return st;
  const key = commKey(visitId, type, win, v.actual.departedAt);
  if (isDuplicate(st.comms, key)) {
    return opts.countDuplicate ? sysAudit({ ...st, commDupes: st.commDupes + 1 }, `Dubblett stoppad: "${COMM_LABEL[type]}" fanns redan, inget nytt meddelande`, v.patient.name) : st;
  }
  // Provet decides whether the owner can receive it. FieldVet never routes around that.
  const pref = provet.patient.commPreference(visitId);
  const prior = st.comms.find((e) => e.key === key);
  const ev: CommEvent = { key, visitId, type, window: win, arrive, createdAt: st.world.now, state: pref.sms ? 'pending' : 'blocked', attempts: prior?.attempts ?? 0, reason: pref.sms ? undefined : pref.reason, via: 'provet' };
  const comms = prior ? st.comms.map((e) => (e.key === key ? ev : e)) : [...st.comms, ev];
  const eta: CustomerEta = { arrive, ...win, sentAt: st.world.now, kind, count: (st.eta[visitId]?.count ?? 0) + 1, type, key, state: ev.state, reason: ev.reason, via: 'provet', clinicAt: opts.clinicAt };
  return sysAudit({ ...st, comms, eta: { ...st.eta, [visitId]: eta } }, pref.sms ? `Bad Provet skicka "${COMM_LABEL[type]}" ${hhmm(win.from)}${win.to !== win.from ? `–${hhmm(win.to)}` : ''} till ägaren` : `Inget sms skickat: ägaren tar inte emot sms enligt Provet`, v.patient.name, pref.sms ? 'ok' : 'nekad');
}

/** Provet's answer for one event. */
function markComm(st: AppState, key: string, r: SendResult): AppState {
  const ev = st.comms.find((e) => e.key === key);
  if (!ev || ev.state !== 'pending') return st;
  const next: CommEvent = r.ok ? { ...ev, state: 'sent', ref: r.ref, attempts: ev.attempts + 1, reason: undefined } : { ...ev, state: 'failed', attempts: ev.attempts + 1, reason: r.reason };
  const cur = st.eta[ev.visitId];
  const eta = cur?.key === key ? { ...st.eta, [ev.visitId]: { ...cur, state: next.state, reason: next.reason } } : st.eta;
  const name = st.world.visits[ev.visitId]?.patient.name;
  return sysAudit({ ...st, comms: st.comms.map((e) => (e.key === key ? next : e)), eta },
    r.ok ? (r.duplicate ? 'Provet: meddelandet var redan skickat, ingen dubblett' : `Provet skickade "${COMM_LABEL[ev.type]}" till ägaren (${r.ref})`) : 'Kundmeddelandet kunde inte skickas: Provet svarar inte', name, r.ok ? 'ok' : 'fel');
}

/** Tell owners about plan changes (coordinator-approved), through Provet. */
function notifyOwners(st: AppState, ids: string[], kind: CustomerEta['kind'], kindFor?: (id: string) => CustomerEta['kind'], type: CommEventType = 'ARRIVAL_WINDOW_UPDATED'): AppState {
  if (!ids.length) return st;
  const plans = planAll(st.world);
  let next = st;
  for (const id of ids) {
    const x = stopOf(plans, id);
    if (!x || x.state === 'klar') continue;
    next = queueComm(next, id, x.state === 'påväg' && type === 'ARRIVAL_WINDOW_UPDATED' ? 'ETA_UPDATED' : type, x.arrive, etaWindow(x.arrive), kindFor?.(id) ?? kind);
  }
  return next;
}
/** "On the way" goes out automatically when a vet starts navigating, and a new time if the arrival moves materially
 *  (rules in COMM_RULES). Runs on every commit; idempotent keys make re-runs harmless. */
function withAutoEta(st: AppState): AppState {
  const w = st.world;
  if (!Object.values(w.visits).some((v) => v.status === 'påväg')) return st;
  const plans = planAll(w);
  let next = st;
  for (const v of Object.values(w.visits)) {
    if (v.status !== 'påväg') continue;
    const x = stopOf(plans, v.id);
    if (!x) continue;
    const cur = next.eta[v.id];
    const fresh = !cur || cur.sentAt < (v.actual.departedAt ?? 0) || cur.kind === 'klinik';
    if (fresh) next = queueComm(next, v.id, 'VETERINARIAN_ON_THE_WAY', x.arrive, etaWindow(x.arrive), 'påväg');
    else if (shouldUpdateEta(cur, x.arrive, w.now)) next = queueComm(next, v.id, x.arrive > v.window.to ? 'VETERINARIAN_DELAYED' : 'ETA_UPDATED', x.arrive, etaWindow(x.arrive), 'ny tid');
  }
  return next;
}

/** Delivery bookkeeping (Provet's answers, the audit) moves on by itself and is carried through undo, so it must not block it. */
const UNDO_CARRIED = new Set<keyof AppState>(['audit', 'comms', 'eta', 'commDupes']);
const changedSince = (a: AppState, b: AppState) => (Object.keys(b) as (keyof AppState)[]).some((k) => !UNDO_CARRIED.has(k) && a[k] !== b[k]);

export function AppProvider({ children, initialRole }: { children: ReactNode; initialRole: Role }) {
  const [s, setS] = useState<AppState>(initialState);
  const ref = useRef(s);
  const [role, setRole] = useState<Role>(initialRole);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok', action?: ToastAction) => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts.slice(-2), { id, text, tone, action }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), action ? 8000 : 4200);
  }, []);

  // Synchronous commit so actions can report success/failure to the caller.
  const commit = useCallback((next: AppState) => { const n = withAutoEta(next); ref.current = n; setS(n); }, []);
  /** One step of undo for plan-changing actions, valid only while nothing else has changed since. */
  const undoRef = useRef<{ before: AppState; after: AppState; label: string } | null>(null);
  const remember = useCallback((before: AppState, label: string) => { undoRef.current = { before, after: ref.current, label }; }, []);
  const update = useCallback((fn: (st: AppState) => AppState) => commit(fn(ref.current)), [commit]);

  // Delivery queue: pending events go to Provet once; the answer updates the state (Skickar… → informerad / kunde inte skickas).
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    for (const e of s.comms) {
      if (e.state !== 'pending' || inflight.current.has(e.key)) continue;
      inflight.current.add(e.key);
      const v = s.world.visits[e.visitId];
      provet.messaging.send(e, v?.owner ?? { first: '' }, v ? vetById(v.vetId).first : '').then((r) => {
        inflight.current.delete(e.key);
        update((st) => markComm(st, e.key, r));
      });
    }
  }, [s.comms]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = useCallback((actor: Actor): Acts => {
    const vetId = ref.current.world.manualVet;
    const log = (st: AppState, action: string, target?: string, outcome: AuditEvent['outcome'] = 'ok', who: Actor | 'system' = actor): AppState => ({
      ...st, audit: [...st.audit, { id: ++auditSeq, at: (st.device?.world ?? st.world).now, actor: who === 'system' ? 'System' : who.name, role: who === 'system' ? 'system' : who.role, action, target, outcome }],
    });
    /** `read` means read by the recipient: the coordinator for messages from the vet, the vet for everything else.
     *  Messages to the simulated vets (not the one on the phone) are born read. */
    const msg = (vid: string, from: Msg['from'], text: string, at: number, read = false): Msg => ({ id: `m${++msgSeq}`, vetId: vid, from, text, at, read });
    /** FieldVet bot post to Slack (simulated). Operational text only: animal name, area, vet, times. */
    const bot = (st: AppState, text: string, visitId?: string, channel = 'hembesok-stockholm'): AppState => {
      const at = st.world.now;
      const th: SlackThread = { id: `th-${at}-${st.slack.length}`, channel, readAt: at, visitId, root: { id: `sb-${st.slack.length}`, at, author: 'FieldVet', bot: true, text }, replies: [] };
      return { ...st, slack: [...st.slack, th] };
    };
    const deny = (perm: Permission, what: string) => {
      update((st) => log(st, `Nekad: ${what}`, undefined, 'nekad'));
      toast(`Din roll saknar behörighet: ${what.toLowerCase()}`, 'warn');
      return false;
    };
    const guard = (perm: Permission, what: string) => (can(actor.role, perm) ? true : deny(perm, what));
    const approved = (st: AppState, w: World): AppState => ({ ...st, world: w, approval: { version: w.planVersion, by: actor.name, at: w.now } });

    // Journal write-back through the adapter (mock). Failures are shown, never hidden.
    const writeBack = (visitId: string) => {
      const st0 = ref.current;
      const v = st0.world.visits[visitId];
      if (!v?.journal || v.journal.state !== 'signerad') return;
      const j = v.journal;
      provet.journal.writeSignedNote({ visitId, signedBy: j.signedBy ?? '', signedAt: j.signedAt ?? 0, atgarder: j.atgarder, lakemedel: j.lakemedel.map((m) => ({ name: m.name, dose: m.dose })), text: [j.anamnes, j.status, j.bedomning, j.rad].join('\n') })
        .then((r) => update((st) => {
          const cur = st.world.visits[visitId];
          if (!cur?.journal) return st;
          const journal: Journal = r.ok ? { ...cur.journal, syncedAt: st.world.now, pendingSync: false, syncError: undefined } : { ...cur.journal, pendingSync: false, syncError: r.error };
          const next = { ...st, world: { ...st.world, visits: { ...st.world.visits, [visitId]: { ...cur, journal } } } };
          return log(next, r.ok ? (r.duplicate ? 'Provet: journalen fanns redan, ingen dubblett' : `Journal sparad i Provet (${r.ref}, simulerad koppling)`) : 'Journal kunde inte skickas: Provet svarar inte', cur.patient.name, r.ok ? 'ok' : 'fel', 'system');
        }));
    };

    /** Vet field actions: applied on the phone; queued while offline and replayed on reconnect. */
    const vetOp = (op: VetOp) => {
      if (actor.role !== 'veterinar' && op.k !== 'overrun') { deny('journal:write', 'ändra veterinärens status'); return; }
      update((st) => {
        if (st.device) {
          const dw = applyVetOp(st.device.world, op, vetId);
          if (dw === st.device.world && op.k !== 'saveJournal') return st;
          return { ...st, device: { ...st.device, world: dw }, outbox: [...st.outbox, op] };
        }
        const w = applyVetOp(st.world, op, vetId);
        if (w === st.world) return st;
        const target = op.k === 'saveJournal' || op.k === 'signJournal' || op.k === 'ack' ? st.world.visits[op.visitId]?.patient.name : undefined;
        return op.k === 'saveJournal' ? { ...st, world: w } : log({ ...st, world: w }, OP_LABEL[op.k], target, 'ok', op.k === 'overrun' ? 'system' : actor);
      });
    };

    return {
      startNav: () => vetOp({ k: 'startNav' }),
      arrive: () => vetOp({ k: 'arrive' }),
      startVisit: () => vetOp({ k: 'startVisit' }),
      extend: (min) => vetOp({ k: 'extend', min }),
      finish: (extra) => vetOp({ k: 'finish', extra }),
      forceOverrun: (min) => vetOp({ k: 'overrun', min }),
      saveJournal: (visitId, j) => { if (can(actor.role, 'journal:write')) vetOp({ k: 'saveJournal', visitId, j }); },
      signJournal: (visitId, j) => {
        if (!guard('journal:write', 'signera journal')) return;
        const base = ref.current.device?.world ?? ref.current.world;
        const signed: Journal = { ...j, state: 'signerad', signedAt: base.now, signedBy: actor.name, pendingSync: true, syncError: undefined };
        vetOp({ k: 'signJournal', visitId, j: signed });
        if (!ref.current.device) writeBack(visitId);
      },
      retrySync: (visitId) => { if (!ref.current.device) { update((st) => { const v = st.world.visits[visitId]; return v?.journal ? { ...st, world: { ...st.world, visits: { ...st.world.visits, [visitId]: { ...v, journal: { ...v.journal, pendingSync: true, syncError: undefined } } } } } : st; }); writeBack(visitId); } },
      openJournal: (visitId) => {
        if (!can(actor.role, 'journal:clinical')) { deny('journal:clinical', 'läsa journaltext'); return false; }
        const v = (ref.current.device?.world ?? ref.current.world).visits[visitId];
        if (!v || v.vetId !== actor.vetId) { deny('journal:clinical', 'läsa annan veterinärs journal'); return false; }
        update((st) => log(st, 'Öppnade journalmodulen', v.patient.name));
        return true;
      },

      addUrgent: (v, sug) => {
        if (!guard('plan:approve', 'lägga in besök')) return false;
        const st = ref.current;
        const r = A.addVisit(st.world, v, sug);
        if (!r.ok) { toast(r.reason, 'warn'); update((x) => log(x, 'Tilldelning nekad', v.patient.name, 'nekad')); return false; }
        const w = { ...r.world, visits: { ...r.world.visits, [v.id]: { ...r.world.visits[v.id], assignedAt: st.world.now } } };
        const pos = w.routes[sug.vetId].indexOf(v.id);
        const prev = pos > 0 ? w.visits[w.routes[sug.vetId][pos - 1]].patient.name : null;
        let next = approved({ ...st, messages: [...st.messages, msg(sug.vetId, 'samordnare', `Akutbesök tillagt: ${v.patient.name} (${v.patient.species.toLowerCase()}), ${v.address.street}. ${prev ? `Kör dit efter ${prev}.` : 'Kör dit direkt.'} Beräknad ankomst ${hhmm(sug.arrive)}.`, st.world.now, sug.vetId !== vetId)] }, w);
        next = { ...next, pendingUrgent: next.pendingUrgent.filter((d) => d.id !== v.id) };
        next = notifyOwners(next, [v.id, ...Object.keys(sug.windows)], 'ny tid', (id) => (id === v.id ? 'akut' : 'ny tid'));
        next = log(next, `Tilldelade akutbesök till ${vetById(sug.vetId).first} (plan v${w.planVersion}). Ägaren får tiden via Provet`, v.patient.name);
        if (!next.slack.some((th) => th.visitId === v.id)) next = bot(next, `Akut hembesök tillagt: ${v.patient.name}, ${v.address.area}. ${vetById(sug.vetId).first} är framme ca ${hhmm(sug.arrive)}.`, v.id);
        commit(next);
        remember(st, `${v.patient.name} tilldelad ${vetById(sug.vetId).first}`);
        return true;
      },
      reassign: (visitId, sug) => {
        if (!guard('plan:approve', 'flytta besök')) return false;
        const st = ref.current;
        const v = st.world.visits[visitId];
        const r = A.reassignDirect(st.world, visitId, sug);
        if (!r.ok) { toast(r.reason, 'warn'); update((x) => log(x, 'Flytt nekad', v.patient.name, 'nekad')); return false; }
        const from = v.vetId;
        let next = approved({ ...st, messages: [
          ...st.messages,
          msg(from, 'samordnare', `${v.patient.name} ${hhmm(v.window.from)} har flyttats till ${vetById(sug.vetId).first}.`, st.world.now, from !== vetId),
          msg(sug.vetId, 'samordnare', `Du har fått ${v.patient.name} ${hhmm(v.window.from)}, ${v.address.street}. Beräknad ankomst ${hhmm(sug.arrive)}.`, st.world.now, sug.vetId !== vetId),
        ] }, r.world);
        next = notifyOwners(next, [visitId], 'ny tid', undefined, 'VISIT_CANCELLED_OR_MOVED');
        next = notifyOwners(next, Object.keys(sug.windows).filter((id) => id !== visitId), 'ny tid');
        next = log(next, `Flyttade besök ${vetById(from).first} → ${vetById(sug.vetId).first} (plan v${r.world.planVersion}). Ägaren får ny tid via Provet`, v.patient.name);
        commit(next);
        remember(st, `${v.patient.name} flyttad till ${vetById(sug.vetId).first}`);
        return true;
      },
      apply: (p, note) => {
        if (!guard('plan:approve', 'godkänna ändringar')) return false;
        const st = ref.current;
        const r = A.applyProposal(st.world, p);
        if (!r.ok) { toast(r.reason, 'warn'); update((x) => log(x, `Godkännande nekat: ${p.title}`, undefined, 'nekad')); return false; }
        const notes: Msg[] = [];
        for (const vid of p.focusVets) {
          const lines: string[] = [];
          for (const c of p.changes) {
            if (c.kind === 'flytt' && c.from === vid) lines.push(`${st.world.visits[c.visitId!].patient.name} flyttas till ${vetById(c.to!).first}`);
            if (c.kind === 'flytt' && c.to === vid) lines.push(`du får ${st.world.visits[c.visitId!].patient.name} från ${vetById(c.from!).first}`);
            if (c.kind === 'tid' && c.vetId === vid) lines.push(`${st.world.visits[c.visitId!].patient.name} ny tid ${hhmm(c.newTime!)}`);
            if (c.kind === 'ordning' && c.vetId === vid) lines.push('ny ordning i rutten');
          }
          if (lines.length) notes.push(msg(vid, 'samordnare', `Ny rutt godkänd: ${lines.join(', ')}.`, st.world.now, vid !== vetId));
        }
        let next = approved({ ...st, request: null, events: st.events.map((e) => ({ ...e, handled: true })), messages: [...st.messages, ...notes], history: [note ?? p.title, ...st.history] }, r.world);
        next = notifyOwners(next, [...new Set(p.changes.filter((c) => c.visitId && (c.kind === 'tid' || c.kind === 'flytt')).map((c) => c.visitId!))], 'ny tid');
        next = log(next, `Godkände förslag: ${p.title} (plan v${r.world.planVersion})`);
        next = bot(next, `Ny plan godkänd (v${r.world.planVersion}): ${p.title}. Berörda veterinärer har fått besked i appen.`, Object.keys(p.reassign)[0]);
        commit(next);
        remember(st, p.title);
        return true;
      },
      cancel: (visitId) => {
        if (!guard('plan:approve', 'avboka besök')) return false;
        const st = ref.current;
        const v = st.world.visits[visitId];
        const r = A.cancelVisit(st.world, visitId);
        if (!r.ok) { toast(r.reason, 'warn'); return false; }
        let next = approved({ ...st, events: [...st.events, { id: `ev-${visitId}`, kind: 'avbokning', visitId, vetId: v.vetId, at: st.world.now }], messages: [...st.messages, msg(v.vetId, 'system', `${v.patient.name} ${hhmm(v.window.from)} är avbokad av ägaren.`, st.world.now, v.vetId !== vetId)] }, r.world);
        next = log(next, `Registrerade avbokning (plan v${r.world.planVersion})`, v.patient.name);
        next = bot(next, `${v.patient.name} ${hhmm(v.window.from)} är avbokad. ${vetById(v.vetId).first} får en lucka.`, visitId);
        commit(next);
        remember(st, `${v.patient.name} avbokad`);
        return true;
      },
      setLock: (visitId, lock) => {
        if (!guard('visit:lock', lock ? 'låsa besök' : 'låsa upp besök')) return false;
        const st = ref.current;
        const r = A.setLock(st.world, visitId, lock, actor.name);
        if (!r.ok) { toast(r.reason, 'warn'); return false; }
        commit(log(approved(st, r.world), lock ? 'Låste besök' : 'Låste upp besök', st.world.visits[visitId].patient.name));
        remember(st, lock ? 'Låst tid' : 'Upplåst tid');
        return true;
      },
      rejectEvent: (id) => update((st) => log({ ...st, events: st.events.map((e) => (e.id === id ? { ...e, handled: true } : e)) }, 'Avvisade förslag efter avbokning')),
      rejectRequest: () => update((st) => {
        if (!st.request) return st;
        const r = st.request;
        return log({ ...st, request: null, messages: [...st.messages, msg(r.vetId, 'samordnare', 'Förslaget avvisades. Fortsätt enligt nuvarande plan, jag meddelar ägaren ny tid.', st.world.now)] }, `Avvisade ${vetById(r.vetId).first}s förslag: ${r.proposal.title}`);
      }),
      requestProposal: (p, visitId) => {
        if (ref.current.device) { toast('Kräver täckning. Försök igen när appen är online.', 'warn'); return false; }
        update((st) => log({
          ...st,
          request: { id: `r${st.audit.length}`, vetId, visitId, at: st.world.now, proposal: p },
          messages: [...st.messages, msg(vetId, 'vet', `Ligger efter plan. Kan du godkänna förslaget: ${p.title.toLowerCase()}?`, st.world.now, true)],
        }, `Skickade förslag till samordnaren: ${p.title}`));
        return true;
      },
      advanceMin: (min) => update((st) => {
        let w = advance(st.world, st.world.now + min);
        const logs: AuditEvent[] = [];
        // Simulated vets confirm new urgent visits within a few minutes; the vet on the phone confirms by hand.
        for (const v of Object.values(w.visits)) {
          if (v.isNew && v.priority === 'akut' && v.ack == null && v.vetId !== w.manualVet && v.assignedAt != null) {
            w = { ...w, visits: { ...w.visits, [v.id]: { ...v, ack: Math.min(w.now, v.assignedAt + 3) } } };
            logs.push({ id: ++auditSeq, at: Math.min(w.now, v.assignedAt + 3), actor: vetById(v.vetId).name, role: 'veterinar', action: 'Bekräftade akutbesöket i appen', target: v.patient.name, outcome: 'ok' });
          }
        }
        return { ...st, world: w, audit: [...st.audit, ...logs] };
      }),
      send: (vid, from, text) => update((st) => ({ ...st, messages: [...st.messages, { ...msg(vid, from, text, (st.device?.world ?? st.world).now, from !== 'vet' && vid !== st.world.manualVet), pending: from === 'vet' && !!st.device }] })),
      sendVoice: (vid, transcript, sec) => update((st) => {
        const m: Msg = { ...msg(vid, actor.role === 'veterinar' ? 'vet' : 'samordnare', transcript, (st.device?.world ?? st.world).now, actor.role !== 'veterinar' && vid !== st.world.manualVet), voice: { sec }, pending: actor.role === 'veterinar' && !!st.device };
        // The audit records that a voice message was sent, never its content.
        return log({ ...st, messages: [...st.messages, m] }, `Skickade röstmeddelande (${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')})${m.pending ? ', köat utan täckning' : ''}`);
      }),
      markRead: (vid) => update((st) => ({ ...st, messages: st.messages.map((m) => (m.vetId === vid && m.from === 'vet' ? { ...m, read: true } : m)) })),
      markReadVet: (vid) => update((st) => ({ ...st, messages: st.messages.map((m) => (m.vetId === vid && m.from !== 'vet' ? { ...m, read: true } : m)) })),
      ackDelay: (visitId, delay) => update((st) => ({ ...st, delayAck: { ...st.delayAck, [visitId]: delay } })),
      setOffline: (off) => {
        const st = ref.current;
        if (off && !st.device) { commit(log({ ...st, device: { world: st.world, since: st.world.now } }, `${vetById(vetId).first}s app tappade täckning (demo)`, undefined, 'ok', 'system')); return; }
        if (!off && st.device) {
          // Replay queued field actions against the server state, in order.
          let w = st.world;
          for (const op of st.outbox) w = applyVetOp(w, op, vetId);
          let next: AppState = { ...st, world: w, device: null, outbox: [], messages: st.messages.map((m) => (m.pending ? { ...m, pending: false, at: st.world.now } : m)) };
          next = log(next, `${vetById(vetId).first}s app online igen: ${st.outbox.length} ändringar synkade`, undefined, 'ok', 'system');
          commit(next);
          if (st.outbox.length) toast(`${st.outbox.length} ändringar från ${vetById(vetId).first}s app synkade`, 'info');
          for (const v of Object.values(w.visits)) if (v.journal?.pendingSync) writeBack(v.id);
        }
      },
      slackReply: (threadId, text) => update((st) => {
        const at = st.world.now;
        const slack = st.slack.map((th) => (th.id === threadId ? { ...th, readAt: at, replies: [...th.replies, { id: `sr-${at}-${th.replies.length}`, at, author: actor.name, title: 'Samordnare', mine: true, text }] } : th));
        return log({ ...st, slack }, 'Svarade i Slack-tråd (simulerad koppling)');
      }),
      slackRead: (threadId) => update((st) => ({ ...st, slack: st.slack.map((th) => (th.id === threadId ? { ...th, readAt: st.world.now } : th)) })),
      slackLinkVisit: (threadId, visitId, vetId, eta) => update((st) => {
        const at = st.world.now;
        const slack = st.slack.map((th) => (th.id === threadId ? { ...th, visitId, handled: true, readAt: at, replies: [...th.replies, { id: `sb-${at}-${th.replies.length}`, at, author: 'FieldVet', bot: true, text: `Hembesök bokat: ${vetById(vetId).first} är framme ca ${eta}. Ägaren får tiden via sms.` }] } : th));
        return { ...st, slack };
      }),
      setProvetDown: (down) => {
        provetStatus.up = !down;
        update((st) => {
          let next = log({ ...st, provetDown: down }, down ? 'Provet slutade svara (demo)' : 'Provet svarar igen (demo)', undefined, 'ok', 'system');
          // Reconnect: failed customer messages are retried with the same key, so nothing is sent twice.
          if (!down) {
            const failed = next.comms.filter((e) => e.state === 'failed');
            if (failed.length) {
              next = { ...next, comms: next.comms.map((e) => (e.state === 'failed' ? { ...e, state: 'pending' as const, reason: undefined } : e)), eta: Object.fromEntries(Object.entries(next.eta).map(([id, e]) => [id, e.state === 'failed' ? { ...e, state: 'pending' as const, reason: undefined } : e])) };
              next = log(next, `${failed.length} kundmeddelande${failed.length > 1 ? 'n' : ''} skickas igen till Provet`, undefined, 'ok', 'system');
            }
          }
          return next;
        });
      },
      reset: () => { provet.reset(); undoRef.current = null; commit({ ...initialState(), epoch: ref.current.epoch + 1 }); },
      undo: () => {
        const u = undoRef.current;
        undoRef.current = null;
        if (!u || changedSince(u.after, ref.current)) { toast('Det går inte att ångra längre, planen har ändrats sedan dess.', 'warn'); return false; }
        // Messages Provet already sent stay sent: the ledger and what the owner was told are kept.
        commit(log({ ...u.before, audit: ref.current.audit, comms: ref.current.comms, eta: ref.current.eta, commDupes: ref.current.commDupes }, `Ångrade: ${u.label}`));
        toast(`Ångrat: ${u.label}. Planen är som innan.`, 'info');
        return true;
      },
      sendEta: (visitId, arrive) => update((st) => {
        const v = st.world.visits[visitId];
        if (!v) return st;
        const win = etaWindow(arrive);
        return log(queueComm(st, visitId, v.status === 'påväg' ? 'ETA_UPDATED' : 'ARRIVAL_WINDOW_UPDATED', arrive, win, 'ny tid'), `Godkände ny tid ${hhmm(win.from)}–${hhmm(win.to)} till ägaren`, v.patient.name);
      }),
      retryComm: (visitId) => {
        if (!guard('owner:contact', 'skicka kundmeddelande')) return;
        update((st) => {
          const e = st.eta[visitId];
          if (!e || e.state !== 'failed') return st;
          const comms = st.comms.map((x) => (x.key === e.key ? { ...x, state: 'pending' as const, reason: undefined } : x));
          return log({ ...st, comms, eta: { ...st.eta, [visitId]: { ...e, state: 'pending', reason: undefined } } }, 'Försökte skicka kundmeddelandet igen (samma händelse)', st.world.visits[visitId]?.patient.name);
        });
      },
      markOwnerInformed: (visitId) => {
        if (!guard('owner:contact', 'kontakta ägaren')) return;
        update((st) => {
          const e = st.eta[visitId];
          if (!e) return st;
          const comms = st.comms.map((x) => (x.key === e.key ? { ...x, state: 'sent' as const, via: 'telefon' as const } : x));
          return log({ ...st, comms, eta: { ...st.eta, [visitId]: { ...e, state: 'sent', via: 'telefon' } } }, 'Informerade ägaren per telefon', st.world.visits[visitId]?.patient.name);
        });
      },
      readHistory: async (visitId) => {
        // This check is the control, not the hidden button: in production it runs in FieldVet's backend before Provet is called.
        const st = ref.current;
        const w = st.device?.world ?? st.world;
        const v = w.visits[visitId];
        if (!can(actor.role, 'history:read') || !v || (v.vetId !== actor.vetId && v.movedFrom !== actor.vetId)) {
          update((x) => log(x, 'Nekad: läsa patienthistorik', v?.patient.name, 'nekad'));
          return { ok: false, reason: 'nekad' };
        }
        if (st.device) {
          const c = st.historyCache[visitId];
          return c && c.expiresAt > w.now ? { ok: true, entries: c.entries, fetchedAt: c.fetchedAt, cached: true } : { ok: false, reason: 'offline' };
        }
        const r = await provet.history.fetch(visitId, w.now);
        update((x) => {
          let n = log(x, r.ok ? 'Läste patienthistorik från Provet' : 'Patienthistorik kunde inte hämtas: Provet svarar inte', v.patient.name, r.ok ? 'ok' : 'fel');
          // Only a short summary is kept on the phone (no full notes), and only until the shift ends.
          if (r.ok) n = { ...n, historyCache: { ...n.historyCache, [visitId]: { entries: r.entries.slice(0, 3).map((e) => ({ ...e, fullNote: undefined })), fetchedAt: r.fetchedAt, expiresAt: vetById(v.vetId).shift.end } } };
          return n;
        });
        return r;
      },
      readFullNote: async (visitId, entryId) => {
        const st = ref.current;
        const v = (st.device?.world ?? st.world).visits[visitId];
        if (!can(actor.role, 'history:read') || !v || (v.vetId !== actor.vetId && v.movedFrom !== actor.vetId) || st.device) return null;
        const text = await provet.history.fullNote(visitId, entryId);
        update((x) => log(x, text ? 'Öppnade hel anteckning från Provet' : 'Anteckningen kunde inte hämtas', v.patient.name, text ? 'ok' : 'fel'));
        return text;
      },
      demoTraffic: (min) => {
        const st = ref.current;
        if (st.device) return false;
        const v = Object.values(st.world.visits).find((x: Visit) => x.vetId === vetId && x.status === 'påväg') as Visit | undefined;
        if (!v) { toast('Starta navigering först, köerna gäller körningen', 'info'); return false; }
        commit(log({ ...st, world: { ...st.world, visits: { ...st.world.visits, [v.id]: { ...v, trafficDelay: (v.trafficDelay ?? 0) + min } } } }, `Demo: köer på vägen till ${v.patient.name}, +${min} min`, undefined, 'ok', 'system'));
        return true;
      },
      demoResend: () => {
        const st = ref.current;
        const mine = st.comms.filter((e) => st.world.visits[e.visitId]?.vetId === vetId && e.state !== 'blocked');
        const last = mine[mine.length - 1];
        if (!last) { toast('Inget kundmeddelande att skicka om än', 'info'); return false; }
        const v = st.world.visits[last.visitId];
        commit(queueComm(st, last.visitId, last.type, last.arrive, last.window, st.eta[last.visitId]?.kind ?? 'påväg', { countDuplicate: true }));
        toast(`Appen skickade samma händelse igen efter ett nätverksfel. Ingen dubblett: ${v.owner.first} får inget nytt sms.`, 'info');
        return true;
      },
      ackVisit: (visitId) => vetOp({ k: 'ack', visitId }),
      requestHandoff: (h) => {
        if (!guard('journal:write', 'skicka patient till kliniken')) return false;
        const st = ref.current;
        if (st.device) { toast('Kräver täckning. Ring samordnaren om det är bråttom.', 'warn'); return false; }
        const p = planVet(vetById(vetId), st.world.routes[vetId], st.world.visits, st.world.now);
        const cur = p.current && (p.current.state === 'pågår' || p.current.state === 'framme') ? p.current : null;
        if (!cur) { toast('Inget pågående besök att överlämna', 'warn'); return false; }
        const v = st.world.visits[cur.id];
        if (st.handoffs.some((x) => x.visitId === v.id && x.status !== 'bekraftad')) { toast('Överlämningen är redan skickad', 'info'); return false; }
        const ho: Handoff = { id: `ho-${st.handoffs.length + 1}`, visitId: v.id, vetId, at: st.world.now, status: 'ny', ...h, note: h.note.trim().slice(0, 200) };
        commit(log({ ...st, handoffs: [...st.handoffs, ho] }, `Begärde fortsättning på kliniken (${h.priority === 'akut' ? 'akut' : h.priority === 'idag' ? 'idag' : 'planerat'})`, v.patient.name));
        return true;
      },
      decideHandoff: (id, o) => {
        if (!guard('plan:approve', 'boka kliniktid')) return false;
        const st = ref.current;
        const h = st.handoffs.find((x) => x.id === id);
        const v = h && st.world.visits[h.visitId];
        if (!h || !v) return false;
        const now = st.world.now;
        const handoffs = st.handoffs.map((x) => (x.id === id ? { ...x, status: o.kind === 'avvakta' ? 'avvaktar' as const : 'bekraftad' as const, outcome: { ...o, by: actor.name, decidedAt: now } } : x));
        let next: AppState = { ...st, handoffs };
        const text = o.kind === 'slot' ? `${v.patient.name}: kliniken tar emot ${o.label}. Ägaren får tiden via Provet. Avsluta hembesöket som vanligt.`
          : o.kind === 'akut' ? `${v.patient.name}: kliniken förbereder akut mottagning. Ägaren kör in direkt, beräknat ${hhmm(o.at ?? now)}.`
          : `${v.patient.name}: jag ringer ägaren innan vi bokar kliniktid. Avsluta hembesöket som vanligt.`;
        next = { ...next, messages: [...next.messages, msg(h.vetId, 'samordnare', text, now, h.vetId !== vetId)] };
        if (o.kind !== 'avvakta' && o.at != null) {
          next = queueComm(next, v.id, 'CLINIC_APPOINTMENT_BOOKED', o.at, { from: o.at, to: o.at }, 'klinik', { clinicAt: o.at });
          next = bot(next, `Från hembesök: ${v.patient.name} (${v.patient.species.toLowerCase()}) kommer till kliniken ${hhmm(o.at)}${o.kind === 'akut' ? ', akut' : ''}. Överlämning från ${vetById(h.vetId).first}.`, v.id, 'klinik-stockholm');
        }
        next = log(next, o.kind === 'avvakta' ? 'Klinikbesök avvaktar, samordnaren kontaktar ägaren' : `Bekräftade klinikbesök ${o.label}`, v.patient.name);
        commit(next);
        remember(st, `Klinikbesök för ${v.patient.name}`);
        return true;
      },
      saveUrgentDraft: (v) => update((st) => ({ ...st, pendingUrgent: [...st.pendingUrgent.filter((d) => d.id !== v.id), v] })),
      dropUrgentDraft: (id) => update((st) => ({ ...st, pendingUrgent: st.pendingUrgent.filter((d) => d.id !== id) })),
      storyStart: () => {
        provet.reset();
        const base = initialState();
        let w = base.world;
        const V = w.manualVet;
        const at = (hm: string) => { w = advance(w, t(hm)); };
        const sign = (id: string) => { const v = w.visits[id]; w = { ...w, visits: { ...w.visits, [id]: { ...v, journal: autoSigned(v, v.actual.finishedAt ?? w.now, vetById(v.vetId).name) } } }; };
        // A calm, realistic morning up to 09:45: Anna has finished Bosse and just started with Luna.
        at('08:33'); w = A.startNavigation(w, V);
        at('08:45'); w = A.markArrived(w, V); w = A.startVisit(w, V);
        at('09:10'); w = A.finishVisit(w, V); sign('v-bosse');
        at('09:24'); w = A.startNavigation(w, V);
        at('09:38'); w = A.markArrived(w, V); w = A.startVisit(w, V);
        at('09:45');
        const now = w.now;
        const slack = base.slack.map((th) => (th.id === 'th-tessan' ? { ...th, root: { ...th.root, at: 24 * 60 } } : { ...th, readAt: now }));
        const next: AppState = {
          ...base, world: w, slack, epoch: ref.current.epoch + 1,
          messages: base.messages.map((m) => ({ ...m, read: true })),
          approval: { version: w.planVersion, by: COORDINATOR.name, at: t('07:45') },
          audit: [...base.audit, { id: ++auditSeq, at: now, actor: 'Demo', role: 'system', action: 'Demoberättelsen startade (09:45)', outcome: 'ok' }],
        };
        commit(next);
      },
      storyReleaseUrgent: () => update((st) => ({ ...st, slack: st.slack.map((th) => (th.id === 'th-tessan' ? { ...th, readAt: 0, root: { ...th.root, at: st.world.now } } : th)) })),
      storyJumpTo: (visitId) => {
        const st = ref.current;
        if (st.device) return;
        let w = st.world;
        const V = w.manualVet;
        const departed: string[] = [];
        for (let guard = 0; guard < 16; guard++) {
          const p = planVet(vetById(V), w.routes[V], w.visits, w.now);
          const cur = p.stops.find((x) => x.state !== 'klar');
          if (!cur || (cur.id === visitId && cur.state === 'pågår')) break;
          if (cur.state === 'pågår') {
            w = advance(w, Math.max(w.now, cur.end)); w = A.finishVisit(w, V);
            const v = w.visits[cur.id]; w = { ...w, visits: { ...w.visits, [cur.id]: { ...v, journal: autoSigned(v, w.now, vetById(V).name) } } };
          } else if (cur.state === 'framme') w = A.startVisit(w, V);
          else if (cur.state === 'påväg') { w = advance(w, Math.max(w.now, cur.arrive)); w = A.markArrived(w, V); }
          else {
            w = advance(w, Math.max(w.now, cur.departAt)); w = A.startNavigation(w, V);
            departed.push(cur.id);
          }
        }
        w = advance(w, w.now + 8);
        let next: AppState = { ...st, world: w };
        // "On the way" went out through Provet for each drive that was skipped over.
        for (const id of departed) { const a = w.visits[id].actual.arrivedAt ?? w.now; next = queueComm(next, id, 'VETERINARIAN_ON_THE_WAY', a, etaWindow(a), 'påväg'); }
        commit(log(next, `Demo: tiden spolades fram till ${hhmm(w.now)}`, undefined, 'ok', 'system'));
      },
      setManualVet: (id) => update((st) => (st.device || !VETS.some((v) => v.id === id) ? st : { ...st, world: { ...st.world, manualVet: id } })),
      dismissImport: () => update((st) => (st.imported ? { ...st, imported: { ...st.imported, dismissed: true } } : st)),
      importDay: (world, info) => {
        if (!guard('plan:approve', 'importera bokningar')) return;
        const base = initialState();
        const now = world.now;
        const annaCount = world.routes[world.manualVet]?.length ?? 0;
        let next: AppState = {
          ...base, world, epoch: ref.current.epoch + 1,
          approval: { version: world.planVersion, by: actor.name, at: now },
          messages: annaCount ? [{ id: `m${++msgSeq}`, vetId: world.manualVet, from: 'samordnare', text: `God morgon ${vetById(world.manualVet).first}! Dagens rutt är klar, ${annaCount} besök. Säg till om något krånglar.`, at: now, read: false }] : [],
          audit: [...ref.current.audit],
          imported: { ...info },
          slack: base.slack
            .filter((th) => !th.visitId)
            .map((th) => (th.id === 'th-plan' ? { ...th, readAt: now, root: { ...th.root, at: now, text: `Dagens plan är importerad och godkänd (v1): ${info.count} hembesök fördelade på ${VETS.length} veterinärer.` }, replies: [] } : th)),
        };
        next = log(next, `Importerade ${info.count} bokningar från ${info.source}${info.byFieldVet ? `, ${info.byFieldVet} fördelade av FieldVet` : ''} och godkände planen (v1)`);
        commit(next);
      },
    };
  }, [commit, update, toast, remember]);

  const value = useMemo(() => ({ s, raw, role, setRole, toasts, toast }), [s, raw, role, toasts, toast]);
  return <RawC.Provider value={value}>{children}</RawC.Provider>;
}

/** Coordinator view: full plan, redacted clinical content, coordinator permissions. */
export function CoordinatorScope({ children }: { children: ReactNode }) {
  const r = useContext(RawC);
  const actor = COORD;
  const world = useMemo(() => viewWorld(r.s.world, 'samordnare'), [r.s.world]);
  const plans = useMemo(() => planAll(world), [world]);
  // Messages still queued on an offline phone have not reached the coordinator yet.
  const scoped = useMemo(() => ({ ...r.s, world, messages: r.s.messages.filter((m) => !m.pending), historyCache: {} }), [r.s, world]);
  const alerts = useMemo(() => deriveAlerts(scoped, world, plans), [scoped, world, plans]);
  const act = useMemo(() => r.raw(actor), [r]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<Ctx>(() => ({
    s: scoped, plans, alerts, role: r.role, setRole: r.setRole, toasts: r.toasts, toast: r.toast, act,
    access: actor, can: (p) => can(actor.role, p), offlineSince: r.s.device?.since ?? null,
    server: { vetProposal: () => null, previewPlans: () => null },
  }), [scoped, plans, alerts, r, act, actor]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Field app view: the vet's own day only, from the phone's copy while offline. */
export function VetScope({ children }: { children: ReactNode }) {
  const r = useContext(RawC);
  const vetId = r.s.world.manualVet;
  const actor = useMemo<Actor>(() => ({ role: 'veterinar', name: vetById(vetId).name, vetId }), [vetId]);
  const base = r.s.device?.world ?? r.s.world;
  const world = useMemo(() => viewWorld(base, 'veterinar', vetId), [base, vetId]);
  const plans = useMemo(() => planAll(world), [world]);
  const scoped = useMemo(() => ({
    ...r.s, world, pendingUrgent: [],
    handoffs: r.s.handoffs.filter((h) => h.vetId === vetId),
    eta: Object.fromEntries(Object.entries(r.s.eta).filter(([id]) => world.visits[id])),
    comms: r.s.comms.filter((e) => world.visits[e.visitId]),
    historyCache: Object.fromEntries(Object.entries(r.s.historyCache).filter(([id, c]) => world.visits[id] && c.expiresAt > base.now)),
  }), [r.s, world, vetId, base.now]);
  const act = useMemo(() => r.raw(actor), [r, actor]);
  const value = useMemo<Ctx>(() => ({
    s: scoped, plans, alerts: [], role: r.role, setRole: r.setRole, toasts: r.toasts, toast: r.toast, act,
    access: actor, can: (p) => can(actor.role, p), offlineSince: r.s.device?.since ?? null,
    server: {
      // Computed server-side on the full plan (other vets' capacity), then only the vet's own part is shown.
      vetProposal: () => {
        if (r.s.device) return null;
        const w = r.s.world;
        const p = planAll(w)[vetId];
        const worst = [...p.stops].filter((x) => x.state === 'kommande' && x.late > LATE_TOL).sort((a, b) => b.late - a.late)[0];
        if (worst) { const f = fixesFor(w, worst.id); if (f[0]) return f[0]; }
        const o = optimizeDay(w, { vets: [vetId], allowMoves: false, title: 'Ny ordning i din rutt' });
        return o.changes.length ? o : null;
      },
      previewPlans: (p) => { const res = A.applyProposal(r.s.world, p); return res.ok ? planAll(res.world) : null; },
    },
  }), [scoped, plans, r, act, actor, vetId]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/** Demo shell controls (not part of the product). */
export function useDemo() {
  const r = useContext(RawC);
  const act = useMemo(() => r.raw({ role: 'samordnare', name: 'Demo' }), [r]);
  const vetAct = useMemo(() => r.raw({ role: 'veterinar', name: vetById(r.s.world.manualVet).name, vetId: r.s.world.manualVet }), [r]);
  return { s: r.s, role: r.role, setRole: r.setRole, toast: r.toast, toasts: r.toasts, act, vetAct, plans: planAll(r.s.world) };
}

export { COORDINATOR, VETS, fixesFor };
