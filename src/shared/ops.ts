// Operations layer for the coordinator: team status, capacity, calm risk levels and the day summary.
// Pure functions over the plan, so desktop, map and mobile all read the same state.
import { AREAS } from './importer';
import type { LatLng } from './geo';
import { LATE_TOL, type Suggestion, type VetPlan, type World } from './engine';

// ——— Delay risk: calm severity levels ———
export type RiskLevel = 'normal' | 'bevaka' | 'atgarda';
/** normal ≤ 5 min over the window, "bevaka" (watch) up to 15 min, "åtgärda" (attention) above that. */
export function riskLevel(lateMin: number): RiskLevel {
  if (lateMin <= LATE_TOL) return 'normal';
  return lateMin <= 15 ? 'bevaka' : 'atgarda';
}
export const RISK_LABEL: Record<RiskLevel, string> = { normal: 'Enligt plan', bevaka: 'Lite sen', atgarda: 'Sen' };

// ——— Capacity ———
export type CapacityLevel = 'ledig' | 'balanserad' | 'hog' | 'risk' | 'klar';
export const CAPACITY_LABEL: Record<CapacityLevel, string> = { ledig: 'Har plats', balanserad: 'Några luckor', hog: 'Fullbokad', risk: 'Risk för försening', klar: 'Klar för dagen' };
export interface Capacity { level: CapacityLevel; label: string; remaining: number; freeMin: number; load: number; urgentSlots: number }

/** Free time = waiting gaps between remaining visits + time left of the shift after the last visit.
 *  Load = share of the remaining shift that is already booked (visits and driving). */
export function capacityOf(p: VetPlan, now: number): Capacity {
  const remaining = p.stops.filter((s) => s.state !== 'klar').length;
  const freeMin = Math.max(0, p.idleMin);
  const shiftLeft = Math.max(0, p.vet.shift.end - Math.max(now, p.vet.shift.start));
  const load = shiftLeft > 0 ? Math.min(1, Math.max(0, 1 - freeMin / shiftLeft)) : 1;
  const risky = p.overtime > 5 || p.lateStops.some((s) => s.late > LATE_TOL);
  let level: CapacityLevel;
  if (risky) level = 'risk';
  else if (shiftLeft < 30) level = 'klar';
  else if (load < 0.5) level = 'ledig';
  else if (load < 0.75) level = 'balanserad';
  else level = 'hog';
  // An urgent slot: at least an hour free (visit + driving) within the next three hours.
  let urgentSlots = 0;
  if (level !== 'risk' && level !== 'klar') {
    const horizon = now + 180;
    let t = Math.max(now, p.vet.shift.start);
    for (const s of p.stops) {
      if (s.state === 'klar') continue;
      const from = t, to = Math.min(s.state === 'kommande' ? s.departAt : t, horizon);
      if (to - from >= 60) { urgentSlots = 1; break; }
      t = Math.max(t, s.end);
      if (t >= horizon) break;
    }
    if (!urgentSlots && Math.min(p.vet.shift.end, horizon) - Math.max(t, now) >= 60) urgentSlots = 1;
  }
  return { level, label: CAPACITY_LABEL[level], remaining, freeMin, load, urgentSlots };
}

// ——— Team status (one model for map, cards and mobile) ———
export type TeamStatus = 'ej-startat' | 'kor' | 'framme' | 'besok' | 'ledig' | 'forsenad' | 'klar';
export const TEAM_LABEL: Record<TeamStatus, string> = { 'ej-startat': 'Ej startat', kor: 'På väg', framme: 'Framme', besok: 'Pågår', ledig: 'Mellan besök', forsenad: 'Försenad', klar: 'Klar för dagen' };
export function teamStatus(p: VetPlan): TeamStatus {
  if (p.state === 'dagen-klar') return 'klar';
  if (p.delay > 10 && p.state !== 'ej-startat') return 'forsenad';
  return ({ 'ej-startat': 'ej-startat', redo: 'ledig', påväg: 'kor', framme: 'framme', besök: 'besok' } as const)[p.state];
}

export function nearestArea(loc: LatLng): string {
  let best = AREAS[0], d = Infinity;
  for (const a of AREAS) {
    const dd = (a.loc.lat - loc.lat) ** 2 + ((a.loc.lng - loc.lng) * 0.51) ** 2;
    if (dd < d) { d = dd; best = a; }
  }
  return best.name;
}

// ——— Day summary ———
export interface OpsSummary { inField: number; teams: number; done: number; all: number; ongoing: number; driving: number; watch: number; attention: number; urgentSlots: number; drive: number }
export function opsSummary(plans: Record<string, VetPlan>, w: World): OpsSummary {
  const ps = Object.values(plans);
  const stops = ps.flatMap((p) => p.stops);
  const lvls = ps.flatMap((p) => p.stops.filter((s) => s.state !== 'klar').map((s) => riskLevel(s.late)));
  return {
    teams: ps.length,
    inField: ps.filter((p) => p.state !== 'ej-startat' && p.state !== 'dagen-klar').length,
    done: stops.filter((s) => s.state === 'klar').length,
    all: stops.length,
    ongoing: stops.filter((s) => s.state === 'pågår' || s.state === 'framme').length,
    driving: stops.filter((s) => s.state === 'påväg').length,
    watch: lvls.filter((l) => l === 'bevaka').length,
    attention: lvls.filter((l) => l === 'atgarda').length,
    urgentSlots: ps.reduce((a, p) => a + capacityOf(p, w.now).urgentSlots, 0),
    drive: stops.reduce((a, s) => a + s.drive, 0),
  };
}

// ——— Assignment impact (urgent visits and reassignment) ———
export type Fit = 'bast' | 'mojlig' | 'stor' | 'ej';
export const FIT_LABEL: Record<Fit, string> = { bast: 'Bäst lämpad', mojlig: 'Möjlig', stor: 'Stor påverkan', ej: 'Ej möjlig' };
/** Operational fit only (place, time, workload, equipment). Never a medical judgement. */
export function fitOf(sug: Suggestion, best: boolean): Fit {
  if (!sug.ok) return 'ej';
  if (best) return 'bast';
  const nextHit = sug.next ? sug.next.late > LATE_TOL || sug.next.shift >= 15 : false;
  return sug.addedLate > 0 || sug.affected > 1 || nextHit || sug.extraDrive > 25 ? 'stor' : 'mojlig';
}
/** One calm sentence: travel impact and what happens to the next appointment. */
export function impactLine(sug: Suggestion, name: (visitId: string) => string): string {
  if (!sug.ok) return sug.reason;
  const drive = sug.extraDrive > 0 ? `+${sug.extraDrive} min körning` : 'ingen extra körning';
  if (!sug.next) return `${drive}, inga fler besök efter`;
  if (sug.next.late > LATE_TOL) return `${drive}, ${name(sug.next.id)} riskerar +${sug.next.late} min`;
  if (sug.next.shift >= 5) return `${drive}, ${name(sug.next.id)} skjuts ${sug.next.shift} min men hålls i tid`;
  return `${drive}, nästa besök fortfarande i tid`;
}
/** The arrival window an owner is told: a 15-minute span starting at the ETA rounded down to 5 min. */
export function etaWindow(arrive: number) {
  const from = Math.floor(arrive / 5) * 5;
  return { from, to: from + 15 };
}

/** One calm sentence about a team, e.g. "På väg till Bosse · framme 08:45". Deviations are added by the caller. */
import type { Visit } from './data';
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
export function teamLine(p: VetPlan, visits: Record<string, Visit>): string {
  const name = (id?: string) => (id ? visits[id]?.patient.name ?? '' : '');
  const cur = p.current;
  if (p.state === 'dagen-klar') return 'Klar för dagen';
  if (p.state === 'besök' && cur) return `Pågår hos ${name(cur.id)} · klar ca ${hm(cur.end)}`;
  if (p.state === 'framme' && cur) return `Framme hos ${name(cur.id)}`;
  if (p.state === 'påväg' && cur) return `På väg till ${name(cur.id)} · framme ${hm(cur.arrive)}`;
  if (p.state === 'ej-startat' && p.next) return `Börjar ${hm(p.vet.shift.start)} · först ${name(p.next.id)} ${hm(p.next.arrive)}`;
  if (p.next) return `Nästa ${name(p.next.id)} ${hm(p.next.arrive)} · åker ${hm(p.next.departAt)}`;
  return 'Inga fler besök idag';
}
/** Free time in plain words, or null when it is not worth mentioning. */
export function capacityWords(c: Capacity): string | null {
  if (c.level === 'klar') return null;
  if (c.level === 'hog') return 'Fullbokad';
  if (c.urgentSlots) return `Har plats för ett akutbesök · ca ${c.freeMin >= 60 ? `${Math.floor(c.freeMin / 60)} h ${c.freeMin % 60 ? `${c.freeMin % 60} min ` : ''}` : `${c.freeMin} min `}ledigt`;
  return null;
}
