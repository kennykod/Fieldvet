// FieldVet dispatch engine: scheduling, ETAs, optimisation and assignment suggestions.
// Pure functions over a World snapshot — the UI never computes times on its own.
import type { LatLng } from './geo';
import { integrations } from './integrations';
// Travel times come through the routing adapter so a real routing service can replace the mock.
const driveMin = (a: LatLng, b: LatLng, t: number) => integrations.routing.travelMinutes(a, b, t);
const roadKm = (a: LatLng, b: LatLng) => integrations.routing.distanceKm(a, b);
import { KIND, VETS, type Vet, type Visit } from './data';
import { autoSigned } from './journal';
import { allHardOk, competenceGap, isFrozen, type ConstraintCheck } from './rules';

export interface World {
  planVersion: number; // approved plan version; proposals carry the version they were computed on
  now: number;
  visits: Record<string, Visit>;
  routes: Record<string, string[]>;
  manualVet: string; // the vet whose phone the demo is holding; not auto-simulated
}

export type StopState = 'klar' | 'pågår' | 'framme' | 'påväg' | 'kommande';
export interface Stop {
  id: string;
  from: LatLng;
  departAt: number;
  drive: number;
  km: number;
  arrive: number;
  start: number;
  end: number;
  idle: number; // väntetid innan avfärd
  late: number; // min efter tidsfönstrets slut
  delay: number; // min efter morgonplanen
  state: StopState;
}
export type VetState = 'ej-startat' | 'redo' | 'påväg' | 'framme' | 'besök' | 'dagen-klar';
export interface VetPlan {
  vet: Vet;
  stops: Stop[];
  endAt: number;
  driveMin: number;
  km: number;
  clinicalMin: number;
  state: VetState;
  pos: LatLng;
  current?: Stop;
  next?: Stop;
  lateStops: Stop[];
  lateSum: number;
  delay: number; // current delay vs plan at next relevant stop
  idleMin: number;
  overtime: number;
  done: number;
  total: number;
}

export const LATE_TOL = 5; // min över tidsfönstret som räknas som risk

/** Flexible visits may be re-timed within their agreed span when the optimiser runs. */
export function relax(visits: Record<string, Visit>): Record<string, Visit> {
  const out: Record<string, Visit> = {};
  for (const [id, v] of Object.entries(visits)) out[id] = v.flexible && v.flexWindow && v.status === 'planerad' && !v.locked ? { ...v, window: v.flexWindow } : v;
  return out;
}
const floor5 = (m: number) => Math.floor(m / 5) * 5;
export function commWindow(arrive: number) {
  const from = floor5(arrive);
  return { from, to: from + 30 };
}

export const vetById = (id: string) => VETS.find((v) => v.id === id)!;

export function hhmm(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
export function dur(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function planVet(vet: Vet, route: string[], visits: Record<string, Visit>, now: number): VetPlan {
  let pos: LatLng = vet.start;
  let t = vet.shift.start;
  const stops: Stop[] = [];
  for (const id of route) {
    const v = visits[id];
    if (!v || v.status === 'avbokad') continue;
    const from = pos;
    const planned = v.duration + v.extension;
    let s: Stop;
    if (v.status === 'klar') {
      const departAt = v.actual.departedAt ?? t;
      const arrive = v.actual.arrivedAt ?? departAt;
      s = {
        id, from, departAt, drive: arrive - departAt, km: roadKm(from, v.loc), arrive,
        start: v.actual.startedAt ?? arrive, end: v.actual.finishedAt ?? arrive + planned,
        idle: Math.max(0, departAt - t), late: 0, delay: 0, state: 'klar',
      };
    } else if (v.status === 'pågår' || v.status === 'framme') {
      const arrive = v.actual.arrivedAt ?? now;
      const departAt = v.actual.departedAt ?? arrive;
      const start = v.status === 'pågår' ? v.actual.startedAt ?? arrive : Math.max(now, arrive);
      s = {
        id, from, departAt, drive: arrive - departAt, km: roadKm(from, v.loc), arrive, start,
        end: Math.max(start + planned, now), idle: 0, late: 0, delay: 0, state: v.status === 'pågår' ? 'pågår' : 'framme',
      };
    } else if (v.status === 'påväg') {
      const departAt = v.actual.departedAt ?? now;
      const drive = driveMin(from, v.loc, departAt) + (v.trafficDelay ?? 0);
      const arrive = Math.max(departAt + drive, now + 1);
      s = { id, from, departAt, drive, km: roadKm(from, v.loc), arrive, start: arrive, end: arrive + planned, idle: 0, late: 0, delay: 0, state: 'påväg' };
    } else {
      const earliest = Math.max(t, now, vet.shift.start);
      const drive = driveMin(from, v.loc, earliest);
      let departAt = earliest;
      if (earliest + drive < v.window.from) departAt = v.window.from - drive;
      const arrive = departAt + drive;
      s = { id, from, departAt, drive, km: roadKm(from, v.loc), arrive, start: arrive, end: arrive + planned, idle: departAt - earliest, late: 0, delay: 0, state: 'kommande' };
    }
    s.late = s.state === 'klar' ? 0 : Math.max(0, s.arrive - v.window.to);
    s.delay = v.plannedArrive != null && s.state !== 'klar' ? Math.max(0, s.arrive - v.plannedArrive) : 0;
    stops.push(s);
    pos = v.loc;
    t = s.end;
  }

  const current = stops.find((s) => s.state === 'pågår' || s.state === 'framme' || s.state === 'påväg');
  const next = stops.find((s) => s.state === 'kommande' || s.state === 'påväg');
  const done = stops.filter((s) => s.state === 'klar').length;
  let state: VetState;
  if (current?.state === 'pågår') state = 'besök';
  else if (current?.state === 'framme') state = 'framme';
  else if (current?.state === 'påväg') state = 'påväg';
  else if (!next) state = 'dagen-klar';
  else if (now < vet.shift.start) state = 'ej-startat';
  else state = 'redo';

  let posNow: LatLng = vet.start;
  const lastDone = [...stops].reverse().find((s) => s.state === 'klar');
  if (lastDone) posNow = visits[lastDone.id].loc;
  if (current && (current.state === 'pågår' || current.state === 'framme')) posNow = visits[current.id].loc;
  if (current?.state === 'påväg') {
    const f = Math.min(0.92, Math.max(0.04, (now - current.departAt) / Math.max(1, current.drive)));
    const to = visits[current.id].loc;
    posNow = { lat: current.from.lat + (to.lat - current.from.lat) * f, lng: current.from.lng + (to.lng - current.from.lng) * f };
  }

  const endAt = stops.length ? stops[stops.length - 1].end : vet.shift.start;
  const upcoming = stops.filter((s) => s.state !== 'klar');
  const lateStops = upcoming.filter((s) => s.late > 0);
  const idleMin = upcoming.reduce((a, s) => a + s.idle, 0) + Math.max(0, vet.shift.end - Math.max(endAt, now));
  const nextRelevant = stops.find((s) => s.state === 'kommande' || s.state === 'påväg');
  return {
    vet, stops, endAt, current, next, state, pos: posNow, lateStops,
    driveMin: stops.reduce((a, s) => a + s.drive, 0),
    km: stops.reduce((a, s) => a + s.km, 0),
    clinicalMin: stops.reduce((a, s) => a + (s.end - s.start), 0),
    lateSum: lateStops.reduce((a, s) => a + s.late, 0),
    delay: nextRelevant?.delay ?? 0,
    idleMin,
    overtime: Math.max(0, endAt - vet.shift.end),
    done,
    total: stops.length,
  };
}

export function planAll(w: World): Record<string, VetPlan> {
  const out: Record<string, VetPlan> = {};
  for (const vet of VETS) out[vet.id] = planVet(vet, w.routes[vet.id], w.visits, w.now);
  return out;
}

// ——— cost + optimisation ———
function cost(p: VetPlan, visits: Record<string, Visit>, now: number): number {
  let c = p.stops.filter((s) => s.state !== 'klar').reduce((a, s) => a + s.drive, 0);
  c += 4 * p.lateSum + 3 * p.overtime + 0.08 * (p.endAt - p.vet.shift.start);
  for (const s of p.stops) {
    if (s.state === 'klar') continue;
    c += 0.03 * s.idle;
    if (visits[s.id].priority === 'akut') c += 1.2 * Math.max(0, s.arrive - now);
  }
  return c;
}

function fixedPrefix(route: string[], visits: Record<string, Visit>) {
  const live = route.filter((id) => visits[id] && visits[id].status !== 'avbokad');
  let i = 0;
  while (i < live.length && visits[live[i]].status !== 'planerad') i++;
  return { fixed: live.slice(0, i), movable: live.slice(i) };
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr.slice()];
  const out: T[][] = [];
  arr.forEach((x, i) => {
    for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

export function optimizeRoute(vet: Vet, route: string[], visits: Record<string, Visit>, now: number): string[] {
  const { fixed, movable } = fixedPrefix(route, visits);
  // Locked visits keep their position; only the free ones are permuted around them.
  const free = movable.filter((id) => !isFrozen(visits[id]));
  if (free.length < 2) return [...fixed, ...movable];
  const fill = (perm: string[]) => { let k = 0; return movable.map((id) => (isFrozen(visits[id]) ? id : perm[k++])); };
  let best = [...fixed, ...movable];
  let bestCost = cost(planVet(vet, best, visits, now), visits, now);
  const cand = free.length <= 7 ? permutations(free).map(fill) : [movable];
  for (const perm of cand) {
    const r = [...fixed, ...perm];
    // small stability penalty: prefer the current order unless there is a real gain
    const moved = perm.reduce((a, id, i) => a + (movable[i] !== id ? 1 : 0), 0);
    const c = cost(planVet(vet, r, visits, now), visits, now) + moved * 0.6;
    if (c < bestCost - 0.01) {
      best = r;
      bestCost = c;
    }
  }
  return best;
}

// ——— suggestions for assigning a visit ———
export interface Suggestion {
  vetId: string;
  ok: boolean;
  route: string[];
  extraDrive: number;
  extraKm: number;
  arrive: number;
  addedLate: number;
  affected: number; // other visits shifted > 5 min
  overtime: number;
  score: number;
  reason: string;
  blocker?: string;
  windows: Record<string, { from: number; to: number }>;
  checks: ConstraintCheck[];
  baseVersion: number;
  /** The visit that follows the new one in this vet's day: minutes it moves and whether it ends up late. */
  next?: { id: string; shift: number; late: number };
}

export function capabilityGap(vet: Vet, v: Pick<Visit, 'kind'>): string | undefined {
  return competenceGap(vet, KIND[v.kind]);
}

export function suggest(w: World, visitId: string, visitsOverride?: Record<string, Visit>, excludeVet?: string): Suggestion[] {
  // Flexible bookings may be re-timed to make room (the owner gets a new time by sms).
  const visits = relax(visitsOverride ?? w.visits);
  const v = visits[visitId];
  const out: Suggestion[] = [];
  // Only open visits can be (re)assigned; a cancelled or finished visit yields no suggestions.
  if (!v || v.status === 'avbokad' || v.status === 'klar') return out;
  for (const vet of VETS) {
    if (vet.id === excludeVet) continue;
    const baseRoute = w.routes[vet.id].filter((id) => id !== visitId);
    const base = planVet(vet, baseRoute, visits, w.now);
    const gap = capabilityGap(vet, v);
    const { fixed, movable } = fixedPrefix(baseRoute, visits);
    const orig = visitsOverride ?? w.visits;
    const urgent = v.priority === 'akut';
    const shiftOver = w.now >= vet.shift.end - 20;
    const baseArr = new Map(base.stops.map((s) => [s.id, s.arrive]));
    const baseLate = new Map(base.stops.map((s) => [s.id, s.late]));
    const lateOver = (pl: VetPlan, skip?: string) => pl.stops.filter((x) => x.id !== skip && x.state !== 'klar' && x.late > LATE_TOL).reduce((a, x) => a + x.late, 0);
    const baseDrive = base.stops.filter((s) => s.state !== 'klar').reduce((a, s) => a + s.drive, 0);
    /** Every insertion point is evaluated; the cheapest one that breaks no rule wins, so a later slot
     *  inside the urgency window is used when the earliest one would collide with the schedule. */
    const evaluate = (route: string[]) => {
      const p = planVet(vet, route, visits, w.now);
      const c = cost(p, visits, w.now);
      const me = p.stops.find((s) => s.id === visitId)!;
      const affected = p.stops.filter((s) => s.id !== visitId && s.state === 'kommande' && s.arrive - (baseArr.get(s.id) ?? s.arrive) > 5).length;
      const addedLate = Math.max(0, lateOver(p, visitId) - lateOver(base));
      const extraDrive = p.stops.filter((s) => s.state !== 'klar').reduce((a, s) => a + s.drive, 0) - baseDrive;
      const overtime = p.overtime - base.overtime;
      // A locked visit may already be late; it only blocks when this assignment makes it later.
      const lockedHit = p.stops.find((x) => x.id !== visitId && orig[x.id]?.locked && x.state === 'kommande' && x.late > LATE_TOL && x.late > (baseLate.get(x.id) ?? 0) + 2);
      let blocker = w.visits[visitId]?.locked ? `Besöket är låst: ${w.visits[visitId].locked!.reason.toLowerCase()}` : gap;
      if (!blocker && shiftOver) blocker = 'Har gått av sitt pass';
      if (!blocker && lockedHit) blocker = `Skulle skjuta ett låst besök (${orig[lockedHit.id].patient.name} ${hhmm(orig[lockedHit.id].window.from)})`;
      if (!blocker && overtime > 10) blocker = `Går över passet – ${overtime} min (slutar ${hhmm(vet.shift.end)})`;
      if (!blocker && addedLate > 15) blocker = `Krockar med schemat – ${Math.max(1, affected)} besök skulle bli upp till ${addedLate} min sena`;
      if (!blocker && me.late > (urgent ? 30 : 20)) blocker = `Hinner inte i tid – tidigast framme ${hhmm(me.arrive)}`;
      // The visit right after the new one: how much it moves, and whether it ends up late.
      const idx = p.stops.indexOf(me);
      const nx = p.stops.slice(idx + 1).find((s) => s.state === 'kommande');
      const next = nx ? { id: nx.id, shift: Math.max(0, nx.arrive - (baseArr.get(nx.id) ?? nx.arrive)), late: nx.late } : undefined;
      return { route, p, c, me, affected, addedLate, extraDrive, overtime, lockedHit, blocker, next };
    };
    const cands = [];
    for (let i = 0; i <= movable.length; i++) cands.push(evaluate([...fixed, ...movable.slice(0, i), visitId, ...movable.slice(i)]));
    const cheapest = cands.reduce((a, b) => (b.c < a.c ? b : a));
    const opt = evaluate(optimizeRoute(vet, cheapest.route, visits, w.now));
    if (opt.c < cheapest.c - 0.5) cands.push(opt);
    const allowed = cands.filter((x) => !x.blocker);
    const best = (allowed.length ? allowed : cands).reduce((a, b) => (b.c < a.c ? b : a));
    const { p, me, affected, addedLate, extraDrive, overtime, lockedHit, blocker, next } = best;
    const score = extraDrive + 3 * addedLate + 2 * Math.max(0, overtime) + (urgent ? 1.2 * (me.arrive - w.now) : 2 * me.late) + affected * 2;
    const windows: Record<string, { from: number; to: number }> = {};
    for (const s of p.stops) {
      const o = orig[s.id];
      if (s.state === 'kommande' && o.flexible && !o.locked && s.id !== visitId && (s.arrive < o.window.from || s.arrive > o.window.to)) windows[s.id] = commWindow(s.arrive);
    }
    const checks: ConstraintCheck[] = [
      { id: 'kompetens', label: 'Behörighet och utrustning', ok: !gap, hard: true, detail: gap },
      { id: 'arbetstid', label: 'Arbetstid', ok: !shiftOver && overtime <= 10, hard: true, detail: shiftOver ? 'Passet är slut' : overtime > 10 ? `${overtime} min övertid` : undefined },
      { id: 'lasta', label: 'Låsta besök orörda', ok: !lockedHit && !w.visits[visitId]?.locked, hard: true, detail: lockedHit ? `${orig[lockedHit.id].patient.name} skulle påverkas` : undefined },
      { id: 'tidsfonster', label: 'Övriga tidsfönster', ok: addedLate === 0, hard: false, detail: addedLate ? `upp till ${addedLate} min sent` : undefined },
    ];
    out.push({
      checks, baseVersion: w.planVersion, next,
      windows, vetId: vet.id, ok: !blocker, route: best.route, extraDrive, extraKm: p.km - base.km, arrive: me.arrive,
      addedLate, affected, overtime: Math.max(0, overtime), score: blocker ? 9999 : score, reason: '', blocker,
    });
  }
  out.sort((a, b) => a.score - b.score);
  const okOnes = out.filter((s) => s.ok);
  out.forEach((s) => {
    if (!s.ok) {
      s.reason = s.blocker!;
      return;
    }
    const isBest = s === okOnes[0];
    const urgent = v.priority === 'akut';
    const fastest = okOnes.every((o) => o.arrive >= s.arrive);
    const shortest = okOnes.every((o) => o.extraDrive >= s.extraDrive);
    if (isBest && urgent && fastest && s.addedLate === 0) s.reason = `Snabbast på plats, ${hhmm(s.arrive)}. Övriga tidsfönster hålls.`;
    else if (isBest && shortest && s.addedLate === 0) s.reason = 'Kortast extra körtid och bibehåller övriga tidsfönster.';
    else if (isBest && s.addedLate === 0) s.reason = urgent ? `Framme ${hhmm(s.arrive)} utan att andra besök blir sena.` : 'Bäst balans mellan körtid och tidsfönster.';
    else if (s.addedLate > 0) s.reason = `${s.affected || 1} besök riskerar att bli ${s.addedLate} min sena.`;
    else if (s.affected > 0) s.reason = `${s.affected} besök flyttas men håller sina tidsfönster.`;
    else s.reason = urgent ? `Kan vara framme ${hhmm(s.arrive)}.` : 'Möjligt, men längre körning.';
  });
  return out;
}

// ——— whole-day optimisation / proposals ———
export interface Metrics {
  drive: number;
  km: number;
  lateCount: number;
  lateSum: number;
  overtime: number;
  lastEnd: number;
}
export function metrics(w: World): Metrics {
  const plans = Object.values(planAll(w));
  const late = plans.flatMap((p) => p.lateStops.filter((s) => s.late > LATE_TOL));
  return {
    drive: plans.reduce((a, p) => a + p.driveMin, 0),
    km: plans.reduce((a, p) => a + p.km, 0),
    lateCount: late.length,
    lateSum: late.reduce((a, s) => a + s.late, 0),
    overtime: plans.reduce((a, p) => a + p.overtime, 0),
    lastEnd: Math.max(...plans.map((p) => p.endAt)),
  };
}
function worldCost(w: World) {
  return VETS.reduce((a, vet) => a + cost(planVet(vet, w.routes[vet.id], w.visits, w.now), w.visits, w.now), 0);
}

export interface Change {
  kind: 'flytt' | 'ordning' | 'tid';
  visitId?: string;
  from?: string;
  to?: string;
  vetId?: string;
  oldTime?: number;
  newTime?: number;
}
export interface Proposal {
  id: string;
  title: string;
  why: string;
  routes: Record<string, string[]>;
  reassign: Record<string, string>; // visitId -> new vet
  windows: Record<string, { from: number; to: number }>; // new communicated windows (flexible visits)
  changes: Change[];
  before: Metrics;
  after: Metrics;
  focusVets: string[];
  ends: Record<string, { before: number; after: number }>;
  checks: ConstraintCheck[];
  baseVersion: number; // plan version the proposal was computed on
  valid: boolean; // all hard constraints satisfied
}

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function applyRoutes(w: World, routes: Record<string, string[]>, reassign: Record<string, string>): World {
  const visits = { ...w.visits };
  for (const [vid, vet] of Object.entries(reassign)) visits[vid] = { ...visits[vid], vetId: vet };
  return { ...w, routes, visits };
}

/** Turn a set of candidate routes into a full proposal (new windows for flexible visits, diff, metrics). */
function finalize(w: World, routes: Record<string, string[]>, reassign: Record<string, string>, title: string, scope: string[]): Proposal {
  const relaxed = applyRoutes({ ...w, visits: relax(w.visits) }, routes, reassign);
  const windows: Record<string, { from: number; to: number }> = {};
  const plans = planAll(relaxed);
  for (const p of Object.values(plans))
    for (const s of p.stops) {
      const v = w.visits[s.id];
      if (s.state !== 'kommande' || !v.flexible || v.locked) continue;
      if (s.arrive < v.window.from || s.arrive > v.window.to) windows[s.id] = commWindow(s.arrive);
    }
  const visits = { ...w.visits };
  for (const [id, win] of Object.entries(windows)) visits[id] = { ...visits[id], window: win };
  const after = metrics(applyRoutes({ ...w, visits }, routes, reassign));
  const before = metrics(w);

  const changes: Change[] = [];
  for (const [vid, to] of Object.entries(reassign)) changes.push({ kind: 'flytt', visitId: vid, from: w.visits[vid].vetId, to });
  for (const vet of VETS) {
    const a = w.routes[vet.id].filter((id) => !(id in reassign) && w.visits[id].status !== 'avbokad');
    const b = routes[vet.id].filter((id) => !(id in reassign) && w.visits[id].status !== 'avbokad');
    if (!sameOrder(a, b)) changes.push({ kind: 'ordning', vetId: vet.id });
  }
  for (const [id, win] of Object.entries(windows)) changes.push({ kind: 'tid', visitId: id, vetId: reassign[id] ?? w.visits[id].vetId, oldTime: w.visits[id].window.from, newTime: win.from });
  const focusVets = [...new Set([...changes.flatMap((c) => [c.from, c.to, c.vetId].filter(Boolean) as string[])])];
  const pb = planAll(w);
  const pa = planAll(applyRoutes({ ...w, visits }, routes, reassign));
  const ends: Proposal['ends'] = {};
  for (const id of focusVets) ends[id] = { before: pb[id].endAt, after: pa[id].endAt };
  let why = explain(before, after, changes, w);
  const gain = Object.entries(ends).filter(([, e]) => e.before - e.after >= 10).sort((a, b) => (b[1].before - b[1].after) - (a[1].before - a[1].after))[0];
  if (gain) why = `${vetById(gain[0]).first} blir klar ${hhmm(gain[1].after)} i stället för ${hhmm(gain[1].before)}. ` + why;
  const p: Proposal = {
    id: `p${w.planVersion}-${title.length}-${Object.keys(reassign).join('')}`,
    title, why,
    routes, reassign, windows, changes, before, after, focusVets: focusVets.length ? focusVets : scope, ends,
    checks: [], baseVersion: w.planVersion, valid: true,
  };
  p.checks = checkProposal(w, p);
  p.valid = allHardOk(p.checks);
  const saved = protectedLocked(w, p);
  if (saved.length) p.why += ` Låsta ${saved.join(' och ')} hålls.`;
  return p;
}

/** Locked visits that are late in the current plan but on time with the proposal. */
function protectedLocked(w: World, p: Pick<Proposal, 'routes' | 'reassign' | 'windows'>): string[] {
  const visits = { ...w.visits };
  for (const [id, win] of Object.entries(p.windows)) visits[id] = { ...visits[id], window: win };
  const pa = planAll(applyRoutes({ ...w, visits }, p.routes, p.reassign));
  return Object.values(planAll(w)).flatMap((pl) => pl.stops)
    .filter((s) => w.visits[s.id].locked && s.state === 'kommande' && s.late > LATE_TOL)
    .filter((s) => (pa[w.visits[s.id].vetId].stops.find((x) => x.id === s.id)?.late ?? 99) <= LATE_TOL)
    .map((s) => `${w.visits[s.id].patient.name} ${hhmm(w.visits[s.id].window.from)}`);
}

/** Hard/soft constraint evaluation of a proposal against the current approved plan. */
export function checkProposal(w: World, p: Pick<Proposal, 'routes' | 'reassign' | 'windows'>): ConstraintCheck[] {
  const visits = { ...w.visits };
  for (const [id, win] of Object.entries(p.windows)) visits[id] = { ...visits[id], window: win };
  const after = applyRoutes({ ...w, visits }, p.routes, p.reassign);
  const pb = planAll(w);
  const pa = planAll(after);
  // competence: every open visit on every route must be clinically allowed for its vet
  const gaps: string[] = [];
  for (const vet of VETS) for (const id of p.routes[vet.id]) {
    const v = after.visits[id];
    if (!v || v.status === 'avbokad' || v.status === 'klar') continue;
    const g = capabilityGap(vet, v);
    if (g) gaps.push(`${v.patient.name}: ${g.toLowerCase()}`);
  }
  // working hours: no new overtime beyond 10 min
  const over = VETS.filter((v) => pa[v.id].overtime > Math.max(10, pb[v.id].overtime));
  // frozen visits: same vet, same communicated window, not made late by this change
  const frozenHit: string[] = [];
  for (const v of Object.values(w.visits)) {
    if (!isFrozen(v) || v.status === 'klar' || v.status === 'avbokad') continue;
    const moved = !!p.reassign[v.id] && p.reassign[v.id] !== v.vetId;
    const retimed = !!p.windows[v.id];
    const st = pa[v.vetId]?.stops.find((x) => x.id === v.id);
    const wasLate = (pb[v.vetId].stops.find((x) => x.id === v.id)?.late ?? 0) > LATE_TOL;
    const lateNow = !!st && st.state === 'kommande' && st.late > LATE_TOL && !wasLate;
    if (moved || retimed || lateNow) frozenHit.push(v.patient.name);
  }
  const m = metrics(after);
  const urgentLate = Object.values(pa).flatMap((x) => x.stops).filter((s) => after.visits[s.id].priority === 'akut' && s.state === 'kommande' && s.late > LATE_TOL);
  return [
    { id: 'kompetens', label: 'Behörighet och utrustning', ok: gaps.length === 0, hard: true, detail: gaps[0] },
    { id: 'arbetstid', label: 'Arbetstid', ok: over.length === 0, hard: true, detail: over.length ? `${over[0].first} får övertid` : undefined },
    { id: 'lasta', label: 'Låsta och pågående besök orörda', ok: frozenHit.length === 0, hard: true, detail: frozenHit.length ? `Påverkar ${frozenHit.join(', ')}` : undefined },
    { id: 'akut', label: 'Akuta besök i tid', ok: urgentLate.length === 0, hard: true, detail: urgentLate.length ? `${after.visits[urgentLate[0].id].patient.name} blir sen` : undefined },
    { id: 'tidsfonster', label: 'Tidsfönster', ok: m.lateCount === 0, hard: false, detail: m.lateCount ? `${m.lateCount} besök riskerar att bli sena` : undefined },
  ];
}


/** Re-optimise the remaining day: reorder routes (re-timing flexible visits), then move late or overtime visits to colleagues when it helps. */
export function optimizeDay(w: World, opts: { vets?: string[]; title?: string; allowMoves?: boolean } = {}): Proposal {
  const scope = opts.vets ?? VETS.map((v) => v.id);
  const rv = relax(w.visits);
  let cur: World = { ...w, visits: rv, routes: { ...w.routes } };
  const reassign: Record<string, string> = {};
  for (const id of scope) cur.routes[id] = optimizeRoute(vetById(id), cur.routes[id], rv, w.now);

  for (let iter = 0; iter < 3 && opts.allowMoves !== false; iter++) {
    const plans = planAll(cur);
    const pressured = Object.values(plans)
      .filter((p) => scope.includes(p.vet.id) && (p.overtime > 0 || p.lateStops.some((s) => s.late > LATE_TOL)))
      .flatMap((p) => p.stops.filter((s) => s.state === 'kommande' && !isFrozen(cur.visits[s.id])).map((s) => ({ s, vet: p.vet.id })));
    const baseCost = worldCost(cur);
    let bestMove: { routes: Record<string, string[]>; vid: string; to: string; c: number } | null = null;
    for (const { s, vet } of pressured) {
      for (const sug of suggest(cur, s.id)) {
        if (!sug.ok || sug.vetId === vet) continue;
        const r2 = { ...cur.routes, [vet]: cur.routes[vet].filter((x) => x !== s.id), [sug.vetId]: sug.route };
        r2[vet] = optimizeRoute(vetById(vet), r2[vet], cur.visits, w.now);
        const w2 = applyRoutes(cur, r2, { [s.id]: sug.vetId });
        const c = worldCost(w2) + sug.extraDrive * 0.2;
        if (c < baseCost - 6 && (!bestMove || c < bestMove.c)) bestMove = { routes: r2, vid: s.id, to: sug.vetId, c };
      }
    }
    if (!bestMove) break;
    reassign[bestMove.vid] = bestMove.to;
    cur = applyRoutes(cur, bestMove.routes, { [bestMove.vid]: bestMove.to });
  }
  return finalize(w, cur.routes, reassign, opts.title ?? 'Optimerad rutt', scope);
}

export function explain(before: Metrics, after: Metrics, changes: Change[], w?: World): string {
  if (!changes.length) return 'Nuvarande plan är redan den bästa. Ingen ändring behövs.';
  const parts: string[] = [];
  if (after.lateCount < before.lateCount) parts.push(after.lateCount === 0 ? 'alla besök hinns inom sina tidsfönster' : `${before.lateCount - after.lateCount} färre sena besök`);
  if (after.overtime < before.overtime) parts.push(after.overtime === 0 ? 'ingen övertid' : `${before.overtime - after.overtime} min mindre övertid`);
  const d = before.drive - after.drive;
  if (d >= 3) parts.push(`${d} min mindre körning`);
  else if (d <= -3) parts.push(`${-d} min mer körning totalt`);
  const moved = changes.filter((c) => c.kind === 'tid');
  if (moved.length && w) {
    const earlier = moved.filter((c) => (c.newTime ?? 0) < (c.oldTime ?? 0)).length;
    if (earlier) parts.push(`${earlier} flexibla besök tidigareläggs, ägaren får ny tid via sms`);
  }
  if (!parts.length) parts.push('jämnare dag med samma körtid');
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

/** Fix options for one at-risk visit, best first. */
export function fixesFor(w: World, visitId: string): Proposal[] {
  const v = w.visits[visitId];
  const out: Proposal[] = [];
  if (!v || v.status !== 'planerad') return out;
  const src = v.vetId;
  for (const sug of (v.locked ? [] : suggest(w, visitId, undefined, src)).filter((s) => s.ok).slice(0, 1)) {
    const routes = { ...w.routes, [src]: optimizeRoute(vetById(src), w.routes[src].filter((x) => x !== visitId), relax(w.visits), w.now), [sug.vetId]: sug.route };
    const p = finalize(w, routes, { [visitId]: sug.vetId }, `Flytta ${v.patient.name} till ${vetById(sug.vetId).first}`, [src, sug.vetId]);
    const dd = p.after.drive - p.before.drive;
    p.why = `${vetById(sug.vetId).first} är framme ${hhmm(sug.arrive)}. ${p.after.lateCount === 0 ? 'Alla tidsfönster hålls' : `${p.after.lateCount} sena besök kvar`}${dd > 2 ? `, ${dd} min mer körning totalt` : dd < -2 ? `, ${-dd} min mindre körning` : ''}.`;
    out.push(p);
  }
  if (v.locked) {
    // The at-risk visit itself is frozen: protect it by moving or reordering the others.
    const alt = optimizeDay(w, { vets: [src], title: 'Skydda det låsta besöket' });
    const mv = alt.changes.find((c) => c.kind === 'flytt');
    if (mv) alt.title = `Flytta ${w.visits[mv.visitId!].patient.name} till ${vetById(mv.to!).first}`;
    if (alt.changes.length && alt.after.lateSum < alt.before.lateSum) out.push(alt);
  }
  const reo = optimizeDay(w, { vets: [src], allowMoves: false, title: `Ändra ordning i ${vetById(src).first}s rutt` });
  if (reo.changes.length && reo.after.lateSum < reo.before.lateSum) out.push(reo);
  out.sort((a, b) => a.after.lateSum - b.after.lateSum || a.after.drive - b.after.drive);
  return out;
}

/** Advance the clock, letting every vet except the manual one follow their plan. */
export function advance(w: World, to: number): World {
  let visits = { ...w.visits };
  for (const vet of VETS) {
    if (vet.id === w.manualVet) continue;
    for (let guard = 0; guard < 60; guard++) {
      const p = planVet(vet, w.routes[vet.id], visits, w.now);
      const s = p.stops.find((x) => x.state !== 'klar');
      if (!s) break;
      const v = visits[s.id];
      let at: number;
      let next: Partial<Visit>;
      if (s.state === 'kommande') {
        at = s.departAt;
        next = { status: 'påväg', actual: { ...v.actual, departedAt: at } };
      } else if (s.state === 'påväg') {
        at = s.departAt + s.drive;
        next = { status: 'pågår', actual: { ...v.actual, arrivedAt: at, startedAt: at } };
      } else if (s.state === 'framme') {
        at = s.arrive;
        next = { status: 'pågår', actual: { ...v.actual, startedAt: Math.max(at, w.now) } };
      } else {
        at = (v.actual.startedAt ?? s.start) + v.duration + v.extension;
        next = { status: 'klar', actual: { ...v.actual, finishedAt: at }, journal: autoSigned(v, at, vet.name) };
      }
      if (at > to) break;
      visits = { ...visits, [s.id]: { ...v, ...next } };
    }
  }
  return { ...w, visits, now: to };
}

/** Freeze today's baseline so later ETAs can be compared with the morning plan. */
export function stampBaseline(w: World, only?: string[]): World {
  const visits = { ...w.visits };
  for (const p of Object.values(planAll(w))) {
    for (const s of p.stops) {
      if (only && !only.includes(s.id)) continue;
      if (s.state === 'kommande' || s.state === 'påväg' || visits[s.id].plannedArrive == null) visits[s.id] = { ...visits[s.id], plannedArrive: s.arrive };
    }
  }
  return { ...w, visits };
}

export function recommendedDeparture(p: VetPlan): number | undefined {
  const s = p.stops.find((x) => x.state === 'kommande');
  return s?.departAt;
}
