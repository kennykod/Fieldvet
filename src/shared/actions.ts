// State transitions on the World. Every UI action goes through here so desktop and mobile stay in sync.
// Plan-changing actions are validated like a server would: current plan version + hard constraints,
// re-checked at approval time rather than trusted from the UI.
import { advance, checkProposal, planVet, stampBaseline, vetById, type Proposal, type Suggestion, type World } from './engine';
import type { Visit, VisitStatus } from './data';
import { allHardOk, canTransition } from './rules';

export type Result = { ok: true; world: World } | { ok: false; reason: string };
const ok = (world: World): Result => ({ ok: true, world });
const fail = (reason: string): Result => ({ ok: false, reason });
const bump = (w: World): World => ({ ...w, planVersion: w.planVersion + 1 });

function retime(w: World, windows: Record<string, { from: number; to: number }>) {
  return Object.fromEntries(Object.entries(windows).map(([id, win]) => [id, { ...w.visits[id], window: win, timeChangedFrom: w.visits[id].timeChangedFrom ?? w.visits[id].window.from }]));
}
const plan = (w: World, vetId: string) => planVet(vetById(vetId), w.routes[vetId], w.visits, w.now);
const put = (w: World, id: string, patch: Partial<Visit>): World => ({ ...w, visits: { ...w.visits, [id]: { ...w.visits[id], ...patch } } });
/** Status changes go through the transition table; an impossible transition leaves the world unchanged. */
const setStatus = (w: World, id: string, to: VisitStatus, patch: Partial<Visit> = {}): World =>
  canTransition(w.visits[id].status, to) ? put(w, id, { ...patch, status: to }) : w;

// ——— field status flow (veterinarian) ———
export function startNavigation(w: World, vetId: string): World {
  const s = plan(w, vetId).stops.find((x) => x.state === 'kommande');
  if (!s) return w;
  const at = Math.max(w.now, s.departAt);
  const w2 = at > w.now ? advance(w, at) : w;
  return setStatus(w2, s.id, 'påväg', { actual: { ...w2.visits[s.id].actual, departedAt: at } });
}
export function markArrived(w: World, vetId: string): World {
  const s = plan(w, vetId).stops.find((x) => x.state === 'påväg');
  if (!s) return w;
  const at = Math.max(w.now, s.departAt + s.drive);
  const w2 = at > w.now ? advance(w, at) : w;
  return setStatus(w2, s.id, 'framme', { actual: { ...w2.visits[s.id].actual, arrivedAt: at } });
}
export function startVisit(w: World, vetId: string): World {
  const s = plan(w, vetId).stops.find((x) => x.state === 'framme');
  if (!s) return w;
  return setStatus(w, s.id, 'pågår', { actual: { ...w.visits[s.id].actual, startedAt: w.now } });
}
export function extendVisit(w: World, vetId: string, min: number): World {
  const s = plan(w, vetId).stops.find((x) => x.state === 'pågår' || x.state === 'framme');
  if (!s || min <= 0 || min > 120) return w;
  return put(w, s.id, { extension: w.visits[s.id].extension + min });
}
export function finishVisit(w: World, vetId: string, extra: Partial<Visit> = {}): World {
  const s = plan(w, vetId).stops.find((x) => x.state === 'pågår');
  if (!s) return w;
  const v = w.visits[s.id];
  const at = Math.max(w.now, (v.actual.startedAt ?? w.now) + v.duration + v.extension);
  const w2 = at > w.now ? advance(w, at) : w;
  // Only operational fields may be attached on finish; status/vet/route cannot be smuggled in via `extra`.
  const { note, photos, treatments, followUp, checklist } = extra;
  return setStatus(w2, s.id, 'klar', { note, photos, treatments, followUp, checklist, actual: { ...w2.visits[s.id].actual, finishedAt: at } });
}

// ——— plan changes (coordinator; require approval) ———
function stale(w: World, baseVersion: number) {
  return baseVersion !== w.planVersion ? 'Planen har ändrats sedan förslaget togs fram. Räkna om förslaget.' : undefined;
}

/** Order a route must respect: finished visits, then at most one under way, then planned ones. */
const RANK: Record<VisitStatus, number> = { klar: 0, påväg: 1, framme: 1, pågår: 1, planerad: 2, avbokad: -1 };
/** Status changes in the field do not bump the plan version, so a proposal computed before the vet moved on
 *  can still carry the current version. Validate the resulting routes against the current statuses instead. */
export function routeOrderError(w: World, vetIds: string[]): string | undefined {
  for (const vid of vetIds) {
    let prev = 0, active = 0;
    for (const id of w.routes[vid] ?? []) {
      const r = RANK[w.visits[id]?.status ?? 'planerad'];
      if (r < 0) continue;
      if (r === 1) active++;
      if (r < prev || active > 1) return `${vetById(vid).first} har hunnit vidare sedan förslaget togs fram. Räkna om förslaget.`;
      prev = r;
    }
  }
  return undefined;
}

export function addVisit(w: World, visit: Visit, sug: Suggestion): Result {
  const s = stale(w, sug.baseVersion);
  if (s) return fail(s);
  if (!sug.ok) return fail(sug.blocker ?? 'Förslaget uppfyller inte villkoren.');
  const w2: World = {
    ...w,
    visits: { ...w.visits, ...retime(w, sug.windows), [visit.id]: { ...visit, vetId: sug.vetId, isNew: true } },
    routes: { ...w.routes, [sug.vetId]: sug.route },
  };
  const order = routeOrderError(w2, [sug.vetId]);
  if (order) return fail(order);
  return ok(bump(stampBaseline(w2, w2.routes[sug.vetId])));
}

export function applyProposal(w: World, p: Proposal): Result {
  const s = stale(w, p.baseVersion);
  if (s) return fail(s);
  // Re-check hard constraints at approval time; never trust a precomputed flag.
  const checks = checkProposal(w, p);
  if (!allHardOk(checks)) return fail(`Förslaget bryter mot ett villkor: ${checks.find((c) => c.hard && !c.ok)!.label.toLowerCase()}.`);
  const visits = { ...w.visits };
  for (const [vid, to] of Object.entries(p.reassign)) visits[vid] = { ...visits[vid], vetId: to, movedFrom: visits[vid].vetId };
  for (const [vid, win] of Object.entries(p.windows)) visits[vid] = { ...visits[vid], window: win, timeChangedFrom: visits[vid].timeChangedFrom ?? visits[vid].window.from };
  const w2: World = { ...w, visits, routes: { ...p.routes } };
  const order = routeOrderError(w2, Object.keys(w2.routes));
  if (order) return fail(order);
  const touched = new Set([...p.focusVets, ...Object.values(p.reassign)]);
  return ok(bump(stampBaseline(w2, [...touched].flatMap((v) => w2.routes[v]))));
}

export function cancelVisit(w: World, visitId: string): Result {
  const v = w.visits[visitId];
  if (!v) return fail('Besöket finns inte.');
  if (!canTransition(v.status, 'avbokad')) return fail('Ett besök som har startat kan inte avbokas.');
  const w2 = put(w, visitId, { status: 'avbokad', locked: undefined });
  return ok(bump({ ...w2, routes: { ...w2.routes, [v.vetId]: w2.routes[v.vetId].filter((x) => x !== visitId) } }));
}

export function reassignDirect(w: World, visitId: string, sug: Suggestion): Result {
  const s = stale(w, sug.baseVersion);
  if (s) return fail(s);
  const v = w.visits[visitId];
  if (v.locked) return fail('Besöket är låst. Lås upp det först.');
  if (v.status !== 'planerad') return fail('Bara planerade besök kan flyttas.');
  if (!sug.ok) return fail(sug.blocker ?? 'Förslaget uppfyller inte villkoren.');
  const from = v.vetId;
  const w2: World = {
    ...w,
    visits: { ...w.visits, ...retime(w, sug.windows), [visitId]: { ...v, vetId: sug.vetId, movedFrom: from } },
    routes: { ...w.routes, [from]: w.routes[from].filter((x) => x !== visitId), [sug.vetId]: sug.route },
  };
  const order = routeOrderError(w2, [sug.vetId]);
  if (order) return fail(order);
  return ok(bump(stampBaseline(w2, [...w2.routes[from], ...w2.routes[sug.vetId]])));
}

/** Manual freeze. Locking changes what the optimiser may do, so it bumps the plan version. */
export function setLock(w: World, visitId: string, lock: boolean, by: string, reason = 'Låst av samordnare'): Result {
  const v = w.visits[visitId];
  if (!v || v.status !== 'planerad') return fail('Bara planerade besök kan låsas eller låsas upp.');
  return ok(bump(put(w, visitId, { locked: lock ? { reason, by, at: w.now } : undefined })));
}
