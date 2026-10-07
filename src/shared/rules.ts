// Domain rules that must hold regardless of UI: status transitions, frozen visits and hard constraints.
// Kept free of React so they can be unit-tested and later moved server-side unchanged.
import type { Vet, Visit, VisitStatus } from './data';

/** Allowed status transitions. Anything else is rejected, never silently applied. */
const NEXT: Record<VisitStatus, VisitStatus[]> = {
  planerad: ['påväg', 'avbokad'],
  // 'pågår' directly from 'påväg' is only used by the simulated colleagues (arrival + start as one event).
  påväg: ['framme', 'pågår'],
  framme: ['pågår'],
  pågår: ['klar'],
  klar: [],
  avbokad: [],
};
export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

/** A frozen visit is protected from automatic re-planning (vet, order position and communicated time). */
export function isFrozen(v: Visit): boolean {
  return v.status !== 'planerad' || !!v.locked;
}
export function frozenReason(v: Visit): string | undefined {
  if (v.status === 'pågår' || v.status === 'framme') return 'Besöket pågår';
  if (v.status === 'påväg') return 'Veterinären är på väg';
  if (v.status === 'klar') return 'Besöket är klart';
  return v.locked?.reason;
}

export type CheckId = 'kompetens' | 'arbetstid' | 'lasta' | 'tidsfonster' | 'akut';
export interface ConstraintCheck {
  id: CheckId;
  label: string;
  ok: boolean;
  hard: boolean; // hard constraints block approval; soft ones are shown as warnings
  detail?: string;
}
export const allHardOk = (checks: ConstraintCheck[]) => checks.every((c) => c.ok || !c.hard);

/** Capability and equipment are clinical constraints and are checked before any logistics. */
export function competenceGap(vet: Vet, needs: { exotic?: boolean; needs?: string[] }): string | undefined {
  if (needs.exotic && !vet.exotics) return 'Saknar behörighet för kanin och smådjur';
  const name: Record<string, string> = { Ultraljud: 'bärbart ultraljud', Syrgas: 'syrgas', Dropp: 'droppaggregat' };
  const miss = (needs.needs ?? []).filter((n) => !vet.special.includes(n as never));
  if (miss.length) return `Saknar ${name[miss[0]] ?? miss[0]} i bilen`;
  return undefined;
}
