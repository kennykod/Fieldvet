import { initialWorld } from '../src/shared/world';
import { planAll, hhmm, metrics, type World } from '../src/shared/engine';
import { VETS } from '../src/shared/data';
export function show(w: World, label: string) {
  console.log(`\n=== ${label} @ ${hhmm(w.now)} ===`);
  const plans = planAll(w);
  for (const vet of VETS) {
    const p = plans[vet.id];
    console.log(`${vet.first.padEnd(6)} ${p.state.padEnd(10)} end ${hhmm(p.endAt)} drive ${p.driveMin}m ${p.km.toFixed(1)}km late ${p.lateSum} over ${p.overtime} idle ${p.idleMin} delay ${p.delay}`);
    for (const s of p.stops) {
      const v = w.visits[s.id];
      console.log(`   ${s.state.padEnd(9)} ${v.patient.name.padEnd(7)} win ${hhmm(v.window.from)}-${hhmm(v.window.to)} dep ${hhmm(s.departAt)} +${s.drive}m arr ${hhmm(s.arrive)} end ${hhmm(s.end)} late ${s.late} delay ${s.delay}`);
    }
  }
  const m = metrics(w); console.log('metrics', m);
}
const w = initialWorld();
show(w, 'initial');
