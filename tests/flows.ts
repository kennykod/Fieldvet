import { initialWorld } from '../src/shared/world';
import * as A from '../src/shared/actions';
import { suggest, fixesFor, optimizeDay, hhmm, type World } from '../src/shared/engine';
import { URGENT_PRESET, type Visit } from '../src/shared/data';
import { show } from './print';

// Plan-changing actions return a Result; stop the script if one is refused.
const unwrap = (r: A.Result): World => {
  if (!r.ok) throw new Error(r.reason);
  return r.world;
};

let w = initialWorld();
// Flow 2: Bosse
w = A.startNavigation(w, 'anna'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna'); w = A.finishVisit(w, 'anna');
console.log('after Bosse clock', hhmm(w.now));
// Flow 3: Luna overruns
w = A.startNavigation(w, 'anna'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna'); w = A.extendVisit(w, 'anna', 25);
show(w, 'Luna +25');
const od0 = optimizeDay(initialWorld()); console.log('INITIAL optimizeDay', JSON.stringify(od0.changes), od0.why);
for (const f of fixesFor(w, 'v-milo')) console.log('FIX', f.title, '|', f.why, f.before.lateSum, '->', f.after.lateSum, 'drive', f.before.drive, '->', f.after.drive);
const f0 = fixesFor(w, 'v-milo')[0]; if (f0) w = unwrap(A.applyProposal(w, f0));
show(w, 'after fix');
// Flow 4: urgent
const urgent: Visit = { id: 'v-tessan', ...URGENT_PRESET, vetId: '', window: { from: w.now, to: w.now + 90 }, priority: 'akut', status: 'planerad', actual: {}, extension: 0 } as Visit;
const vs = { ...w.visits, [urgent.id]: urgent };
const sugs = suggest({ ...w, visits: vs }, urgent.id, vs);
for (const s of sugs) console.log('SUG', s.vetId, s.ok, `+${s.extraDrive}m`, 'arr', hhmm(s.arrive), 'late+', s.addedLate, 'aff', s.affected, '|', s.reason);
// urgent at 08:20 too
{ const w0 = initialWorld(); const u = { ...urgent, window: { from: w0.now, to: w0.now + 90 } }; const v0 = { ...w0.visits, [u.id]: u };
  for (const s of suggest({ ...w0, visits: v0 }, u.id, v0)) console.log('SUG@0820', s.vetId, s.ok, `+${s.extraDrive}m`, 'arr', hhmm(s.arrive), 'late+', s.addedLate, '|', s.reason); }
w = unwrap(A.addVisit({ ...w, visits: vs }, urgent, sugs[0]));
show(w, 'after urgent');
// Flow 5: cancel Sigge
w = unwrap(A.cancelVisit(w, 'v-sigge'));
const p = optimizeDay(w, { title: 'Ny rutt efter avbokning' });
console.log('CANCEL proposal', JSON.stringify(p.changes), p.why, JSON.stringify(p.before), JSON.stringify(p.after));
w = unwrap(A.applyProposal(w, p));
show(w, 'after cancel');
const od = optimizeDay(w); console.log('optimizeDay now:', od.changes, od.why);
