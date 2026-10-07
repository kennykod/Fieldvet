// Domain rule tests: run with `tsx tests/domain.test.ts`.
import assert from 'node:assert/strict';
import { initialWorld } from '../src/shared/world';
import * as A from '../src/shared/actions';
import { canTransition } from '../src/shared/rules';
import { advance, fixesFor, optimizeDay, planAll, suggest, checkProposal, type World } from '../src/shared/engine';
import { fitOf, impactLine } from '../src/shared/ops';
import { t } from '../src/shared/data';
import { URGENT_PRESET, type Visit } from '../src/shared/data';
import { COMM_RULES, commKey, isDuplicate, provet, provetStatus, shouldUpdateEta, type CommEvent } from '../src/shared/provet';
import { can } from '../src/shared/access';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('  ✓', name); };
const okw = (r: A.Result) => { assert.ok(r.ok, !r.ok ? r.reason : ''); return (r as { world: World }).world; };
const lunaLate = () => {
  let w = initialWorld();
  for (let i = 0; i < 2; i++) { w = A.startNavigation(w, 'anna'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna'); if (i === 0) w = A.finishVisit(w, 'anna'); }
  return A.extendVisit(w, 'anna', 25);
};

console.log('Status transitions');
test('only allowed transitions', () => {
  assert.ok(canTransition('planerad', 'påväg'));
  assert.ok(!canTransition('klar', 'pågår'));
  assert.ok(!canTransition('pågår', 'avbokad'));
  assert.ok(!canTransition('planerad', 'klar'));
});
test('finish without start is a no-op', () => {
  const w = initialWorld();
  assert.equal(A.finishVisit(w, 'anna'), w);
});
test('cannot cancel a visit in progress', () => {
  const w = lunaLate();
  const r = A.cancelVisit(w, 'v-luna');
  assert.ok(!r.ok);
});
test('finish cannot change vet or status via extra fields', () => {
  let w = initialWorld();
  w = A.startNavigation(w, 'anna'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna');
  w = A.finishVisit(w, 'anna', { vetId: 'erik', status: 'planerad' } as Partial<Visit>);
  assert.equal(w.visits['v-bosse'].vetId, 'anna');
  assert.equal(w.visits['v-bosse'].status, 'klar');
});

console.log('Frozen visits');
test('Sigge is locked in the demo day and on time', () => {
  const w = initialWorld();
  assert.ok(w.visits['v-sigge'].locked);
  const st = planAll(w).anna.stops.find((s) => s.id === 'v-sigge')!;
  assert.ok(st.late <= 5);
});
test('optimisation never moves or re-times a locked visit', () => {
  const w = lunaLate();
  for (const p of [...fixesFor(w, 'v-milo'), optimizeDay(w)]) {
    assert.ok(!('v-sigge' in p.reassign));
    assert.ok(!('v-sigge' in p.windows));
    assert.equal(p.checks.find((c) => c.id === 'lasta')!.ok, true);
  }
});
test('a locked visit cannot be reassigned', () => {
  const w = initialWorld();
  assert.ok(suggest(w, 'v-sigge').every((s) => !s.ok));
});
test('unlocking allows reassignment and bumps the plan version', () => {
  const w0 = initialWorld();
  const w1 = okw(A.setLock(w0, 'v-sigge', false, 'Maria'));
  assert.equal(w1.planVersion, w0.planVersion + 1);
  assert.ok(suggest(w1, 'v-sigge', undefined, 'anna').some((s) => s.ok));
});

console.log('Proposals and approval');
test('delay proposal moves Milo to Erik and satisfies all hard constraints', () => {
  const w = lunaLate();
  const [best] = fixesFor(w, 'v-milo');
  assert.equal(best.reassign['v-milo'], 'erik');
  assert.ok(best.valid);
  const w2 = okw(A.applyProposal(w, best));
  assert.equal(w2.visits['v-milo'].vetId, 'erik');
  assert.equal(w2.planVersion, w.planVersion + 1);
});
test('a proposal does not touch the approved plan until approved', () => {
  const w = lunaLate();
  const before = JSON.stringify(w.routes);
  fixesFor(w, 'v-milo'); optimizeDay(w);
  assert.equal(JSON.stringify(w.routes), before);
});
test('stale proposals are rejected', () => {
  const w = lunaLate();
  const [best] = fixesFor(w, 'v-milo');
  const w2 = okw(A.setLock(w, 'v-ester', true, 'Maria'));
  const r = A.applyProposal(w2, best);
  assert.ok(!r.ok && /ändrats/.test(r.reason));
});
test('approval re-checks competence (rabbit cannot go to a vet without exotics)', () => {
  const w = initialWorld();
  const forged = { ...optimizeDay(w), routes: { ...w.routes, anna: w.routes.anna.filter((x) => x !== 'v-doris'), johan: [...w.routes.johan, 'v-doris'] }, reassign: { 'v-doris': 'johan' }, windows: {}, baseVersion: w.planVersion };
  assert.equal(checkProposal(w, forged).find((c) => c.id === 'kompetens')!.ok, false);
  assert.ok(!A.applyProposal(w, forged).ok);
});

test('a late locked visit is protected by moving another visit', () => {
  const w = lunaLate();
  const [fix] = fixesFor(w, 'v-sigge');
  assert.ok(fix && fix.valid && !('v-sigge' in fix.reassign));
  assert.match(fix.why, /Låsta Sigge/);
});

console.log('Urgent visit');
test('clinical constraints before geography; locked Sigge stays within window', () => {
  const w = lunaLate();
  const urgent = { id: 'v-u', ...URGENT_PRESET, vetId: '', window: { from: w.now, to: w.now + 90 }, priority: 'akut', status: 'planerad', actual: {}, extension: 0 } as Visit;
  const vs = { ...w.visits, [urgent.id]: urgent };
  const sugs = suggest({ ...w, visits: vs }, urgent.id, vs);
  assert.match(sugs.find((s) => s.vetId === 'sara')!.blocker ?? '', /droppaggregat/);
  const best = sugs.find((s) => s.ok)!;
  assert.ok(best.checks.every((c) => c.ok || !c.hard));
  const before = planAll(w).anna.stops.find((s) => s.id === 'v-sigge')!.late;
  assert.ok(sugs.find((s) => s.vetId === 'anna')!.checks.some((c) => c.id === 'lasta' && !c.ok) || best.vetId === 'anna');
  const w2 = okw(A.addVisit({ ...w, visits: vs }, urgent, best));
  const after = planAll(w2).anna.stops.find((s) => s.id === 'v-sigge')!.late;
  assert.ok(after <= before, 'urgent insertion must not add delay to a locked visit');
});

test('a suggestion made before the vet moved on cannot give an impossible route', () => {
  const w = initialWorld();
  const urgent = { id: 'v-u', ...URGENT_PRESET, vetId: '', window: { from: w.now, to: w.now + 90 }, priority: 'akut', status: 'planerad', actual: {}, extension: 0 } as Visit;
  const vs = { ...w.visits, [urgent.id]: urgent };
  const sug = suggest({ ...w, visits: vs }, urgent.id, vs).find((s) => s.vetId === 'anna' && s.ok)!;
  assert.ok(sug, 'Anna is a valid choice at 08:20');
  const moved = A.startNavigation(w, 'anna'); // same plan version: field status changes do not bump it
  const onWay = sug.route.findIndex((id) => moved.visits[id]?.status === 'påväg');
  const r = A.addVisit({ ...moved, visits: { ...moved.visits, [urgent.id]: urgent } }, urgent, sug);
  if (sug.route.indexOf(urgent.id) < onWay) assert.ok(!r.ok, 'planned visit before the one under way must be rejected');
  else assert.ok(r.ok);
  // A fresh suggestion for Anna keeps the visit under way first.
  const vs2 = { ...moved.visits, [urgent.id]: urgent };
  const fresh = suggest({ ...moved, visits: vs2 }, urgent.id, vs2).find((s) => s.vetId === 'anna')!;
  assert.equal(A.routeOrderError({ ...moved, visits: vs2, routes: { ...moved.routes, anna: fresh.route } }, ['anna']), undefined);
});

console.log(`\n${passed} tester godkända`);

// ——— access layer ———
import { viewWorld, redactVisit } from '../src/shared/access';
import { autoSigned } from '../src/shared/journal';
console.log('Access');
test('unknown role is denied (fail closed)', () => {
  assert.equal(can(undefined, 'plan:read'), false);
  assert.equal(can('hacker' as never, 'plan:read'), false);
});
test('coordinator never receives clinical journal text or clinical flags', () => {
  const w = initialWorld();
  const luna = { ...w.visits['v-luna'], status: 'klar' as const, journal: autoSigned(w.visits['v-luna'], 600, 'Anna Lindqvist') };
  const r = redactVisit(luna, 'samordnare')!;
  assert.equal(r.journal!.anamnes, '');
  assert.equal(r.journal!.transcript, '');
  assert.equal(r.journal!.lakemedel[0].dose, '');
  assert.equal(r.flags.allergy, undefined);
  assert.equal(redactVisit(w.visits['v-sigge'], 'samordnare')!.flags.warning, undefined);
  assert.equal(r.lastNote, undefined);
  assert.ok(r.journal!.atgarder.length > 0, 'billing basis is kept');
});
test('vet sees only own visits; admin sees no patient data', () => {
  const w = initialWorld();
  const vw = viewWorld(w, 'veterinar', 'anna');
  assert.ok(Object.values(vw.visits).every((v) => v.vetId === 'anna' || v.movedFrom === 'anna'));
  assert.equal(Object.keys(viewWorld(w, 'admin').visits).length, 0);
});
test('scheduling is identical in the coordinator view', () => {
  const w = lunaLate();
  assert.equal(JSON.stringify(planAll(viewWorld(w, 'samordnare')).anna.stops.map((s) => s.arrive)), JSON.stringify(planAll(w).anna.stops.map((s) => s.arrive)));
});
console.log('Import');
import { parseTable, guessMapping, buildRows, planImported, EXAMPLE_CSV, parseTime } from '../src/shared/importer';
import { capabilityGap as gapOf, vetById as vetOf } from '../src/shared/engine';
test('reads times in common export formats', () => {
  assert.equal(parseTime('08:45'), 525); assert.equal(parseTime('8.45'), 525); assert.equal(parseTime('2026-10-01 08:45'), 525);
  assert.equal(parseTime('0.375'), 540); assert.equal(parseTime('46296.5'), 720); assert.equal(parseTime('nej'), null);
});
test('maps Swedish export columns and flags rows that need attention', () => {
  const tbl = parseTable(EXAMPLE_CSV);
  const m = guessMapping(tbl[0]);
  assert.equal(tbl[0][m.time], 'Starttid'); assert.equal(tbl[0][m.vet], 'Resurs'); assert.equal(tbl[0][m.street], 'Adress');
  const { rows } = buildRows(tbl, m);
  assert.equal(rows.length, 18);
  assert.equal(rows.filter((r) => !r.visit).length, 1, 'Kista cannot be placed on the demo map');
  const fixed = buildRows(tbl, m, { [rows.find((r) => !r.visit)!.line]: 'Solna' });
  assert.equal(fixed.rows.filter((r) => r.visit).length, 18, 'a manual district fix brings the row back');
});
test('planning an imported day respects competence and equipment, with no overtime', () => {
  const tbl = parseTable(EXAMPLE_CSV);
  const { rows } = buildRows(tbl, guessMapping(tbl[0]));
  for (const keepVets of [true, false]) {
    const res = planImported(rows.filter((r) => r.visit).map((r) => r.visit!), { keepVets });
    const w = res.world;
    const all = Object.values(w.routes).flat();
    assert.equal(all.length, 17);
    for (const [vid, route] of Object.entries(w.routes)) for (const id of route) assert.equal(gapOf(vetOf(vid), w.visits[id]), undefined, `${w.visits[id].patient.name} on ${vid}`);
    for (const p of Object.values(planAll(w))) assert.ok(p.overtime <= 10);
  }
});

console.log('Phase 2: urgent assignment with impact');
const storyWorld = () => {
  let w = initialWorld();
  const at = (hm: string) => { w = advance(w, t(hm)); };
  at('08:33'); w = A.startNavigation(w, 'anna');
  at('08:45'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna');
  at('09:10'); w = A.finishVisit(w, 'anna');
  at('09:24'); w = A.startNavigation(w, 'anna');
  at('09:38'); w = A.markArrived(w, 'anna'); w = A.startVisit(w, 'anna');
  at('09:45');
  return A.extendVisit(w, 'anna', 30);
};
const urgentAt = (w: World, span: number): Visit => ({ ...(URGENT_PRESET as unknown as Visit), id: 'v-u', vetId: '', status: 'planerad', actual: {}, extension: 0, priority: 'akut', window: { from: w.now, to: w.now + span }, flags: {}, access: [] });
test('demo story: best fit is Erik, Anna and Sara are blocked for clear reasons', () => {
  const w = storyWorld();
  const v = urgentAt(w, 120);
  const vs = { ...w.visits, [v.id]: v };
  const sg = suggest({ ...w, visits: vs }, v.id, vs);
  assert.equal(sg[0].vetId, 'erik');
  assert.equal(fitOf(sg[0], true), 'bast');
  assert.ok(!sg.find((x) => x.vetId === 'sara')!.ok && /dropp/i.test(sg.find((x) => x.vetId === 'sara')!.reason));
  assert.ok(!sg.find((x) => x.vetId === 'anna')!.ok);
  assert.match(impactLine(sg[0], (id) => vs[id].patient.name), /körning/);
});
test('a later slot inside the urgency window is used when the earliest one collides', () => {
  const w = storyWorld();
  const wide = urgentAt(w, 120);
  const vs = { ...w.visits, [wide.id]: wide };
  const johan = suggest({ ...w, visits: vs }, wide.id, vs).find((x) => x.vetId === 'johan')!;
  assert.ok(johan.ok, 'Johan can take it after Harry within two hours');
  const tight = urgentAt(w, 30);
  const vs2 = { ...w.visits, [tight.id]: tight };
  assert.ok(!suggest({ ...w, visits: vs2 }, tight.id, vs2).find((x) => x.vetId === 'johan')!.ok, 'but not within 30 minutes');
});

console.log('Provet: kommunikation och historik');
test('the same operational fact always gets the same idempotency key', () => {
  const win = { from: t('08:40'), to: t('08:55') };
  assert.equal(commKey('v-bosse', 'VETERINARIAN_ON_THE_WAY', win, t('08:33')), commKey('v-bosse', 'VETERINARIAN_ON_THE_WAY', { from: t('08:45'), to: t('09:00') }, t('08:33')));
  assert.notEqual(commKey('v-bosse', 'VETERINARIAN_ON_THE_WAY', win, t('08:33')), commKey('v-bosse', 'VETERINARIAN_ON_THE_WAY', win, t('10:02')), 'a new departure is a new event');
  assert.notEqual(commKey('v-bosse', 'ETA_UPDATED', win), commKey('v-bosse', 'ETA_UPDATED', { from: t('09:00'), to: t('09:15') }), 'a new window is a new event');
});
test('small changes and rapid recalculations do not trigger a new time', () => {
  const last = { arrive: t('08:45'), sentAt: t('08:33') };
  assert.ok(!shouldUpdateEta(undefined, t('09:30'), t('08:40')), 'nothing to update before the first message');
  assert.ok(!shouldUpdateEta(last, t('08:45') + COMM_RULES.etaChangeMin - 1, t('09:00')), 'below threshold');
  assert.ok(!shouldUpdateEta(last, t('08:45') + 12, t('08:35')), 'medium change right after the last message waits');
  assert.ok(shouldUpdateEta(last, t('08:45') + 12, t('08:45')), 'medium change after the quiet period');
  assert.ok(shouldUpdateEta(last, t('08:45') + COMM_RULES.bigChangeMin, t('08:34')), 'big change goes out at once');
});
test('pending or sent events are duplicates, failed ones may be retried', () => {
  const e = (state: CommEvent['state']): CommEvent => ({ key: 'k', visitId: 'v', type: 'ETA_UPDATED', window: { from: 0, to: 15 }, arrive: 0, createdAt: 0, state, attempts: 0 });
  assert.ok(isDuplicate([e('pending')], 'k') && isDuplicate([e('sent')], 'k'));
  assert.ok(!isDuplicate([e('failed')], 'k') && !isDuplicate([e('sent')], 'other'));
});
test('Provet preferences decide whether an owner can get sms', () => {
  assert.equal(provet.patient.commPreference('v-sigge').sms, false);
  assert.equal(provet.patient.commPreference('v-bosse').sms, true);
});
test('only veterinarians may read patient history; coordinators and admins may not', () => {
  assert.ok(can('veterinar', 'history:read'));
  assert.ok(!can('samordnare', 'history:read') && !can('admin', 'history:read') && !can(null, 'history:read'));
});
void (async () => {
  // Adapter-level idempotency and availability (async).
  provet.reset();
  const ev: CommEvent = { key: 'v-bosse:ON_THE_WAY:513', visitId: 'v-bosse', type: 'VETERINARIAN_ON_THE_WAY', window: { from: 520, to: 535 }, arrive: 522, createdAt: 513, state: 'pending', attempts: 0 };
  const a = await provet.messaging.send(ev, { first: 'Karin' }, 'Anna');
  const b2 = await provet.messaging.send(ev, { first: 'Karin' }, 'Anna');
  assert.ok(a.ok && b2.ok && b2.duplicate && a.ref === b2.ref);
  assert.equal(provet.messaging.stats().delivered, 1);
  passed++; console.log('  ✓ Provet sends one message per key, a retry returns the same reference');
  provetStatus.up = false;
  const down = await provet.messaging.send({ ...ev, key: 'x' }, { first: 'Karin' }, 'Anna');
  const hist = await provet.history.fetch('v-bosse', 600);
  assert.ok(!down.ok && !hist.ok);
  provetStatus.up = true;
  const h = await provet.history.fetch('v-bosse', 600);
  assert.ok(h.ok && h.entries.length >= 2 && h.entries.every((x) => x.fullNote === undefined), 'list without full notes');
  const note = await provet.history.fullNote('v-bosse', (h as { entries: { id: string }[] }).entries[0].id);
  assert.match(note ?? '', /Observera/);
  passed++; console.log('  ✓ When Provet is down nothing is sent or read; history list never carries full notes');
  const s1 = await provet.journal.writeSignedNote({ visitId: 'v-bosse', signedBy: 'Anna', signedAt: 560, atgarder: [], lakemedel: [], text: '' });
  const s2 = await provet.journal.writeSignedNote({ visitId: 'v-bosse', signedBy: 'Anna', signedAt: 560, atgarder: [], lakemedel: [], text: '' });
  assert.ok(s1.ok && s2.ok && s2.duplicate && provet.journal.stats().written === 1);
  passed++; console.log('  ✓ A retried journal write-back never creates a second note');
  console.log(`\n${passed} tester godkända totalt`);
})().catch((e) => { console.error(e); process.exit(1); });
