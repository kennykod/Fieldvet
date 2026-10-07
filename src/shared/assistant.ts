// "Fråga FieldVet": read-only tools over the veterinarian's own (role-scoped) plan.
// The same functions serve the AI (as tools) and the offline fallback (keyword intents),
// so answers always come from the plan data, never from the model's imagination.
import { KIND, type Visit } from './data';
import { hhmm, LATE_TOL, type VetPlan, type World } from './engine';

export interface AssistantCtx { world: World; plan: VetPlan }

const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

function findVisit(ctx: AssistantCtx, name?: string): Visit | undefined {
  const own = ctx.plan.stops.map((s) => ctx.world.visits[s.id]).filter(Boolean);
  if (!name) return undefined;
  const q = name.trim().toLowerCase();
  return own.find((v) => v.patient.name.toLowerCase() === q) ?? own.find((v) => v.patient.name.toLowerCase().startsWith(q) || v.owner.first.toLowerCase() === q || v.address.street.toLowerCase().includes(q));
}

export function nextVisit(ctx: AssistantCtx) {
  const p = ctx.plan;
  const st = p.stops.find((s) => s.state === 'påväg') ?? p.stops.find((s) => s.state === 'kommande');
  const cur = p.stops.find((s) => s.state === 'pågår' || s.state === 'framme');
  if (!st) return { none: true, message: 'Inga fler besök idag.' };
  const v = ctx.world.visits[st.id];
  const now = ctx.world.now;
  return {
    patient: v.patient.name, species: v.patient.species, owner: v.owner.first,
    address: `${v.address.street}, ${v.address.area}`, window: `${hhmm(v.window.from)}–${hhmm(v.window.to)}`,
    status: st.state === 'påväg' ? 'på väg dit' : 'planerad',
    drive_minutes: st.drive, eta: hhmm(st.arrive),
    minutes_until_arrival: Math.max(0, st.arrive - now),
    leave_by: st.state === 'kommande' ? hhmm(st.departAt) : undefined,
    current_visit_ends: cur ? hhmm(cur.end) : undefined,
    late_minutes: st.late > LATE_TOL ? st.late : 0,
    now: hhmm(now),
  };
}

export function dayOverview(ctx: AssistantCtx) {
  const p = ctx.plan;
  return {
    now: hhmm(ctx.world.now), done: p.done, total: p.total, day_ends: hhmm(p.endAt), shift_ends: hhmm(p.vet.shift.end),
    drive_left_minutes: p.stops.filter((s) => s.state === 'kommande').reduce((a, s) => a + s.drive, 0),
    visits: p.stops.map((s) => {
      const v = ctx.world.visits[s.id];
      return { time: hhmm(s.arrive), patient: v.patient.name, area: v.address.area, status: s.state, late_minutes: s.late > LATE_TOL ? s.late : 0, locked: !!v.locked };
    }),
  };
}

export function visitDetails(ctx: AssistantCtx, name?: string) {
  const v = findVisit(ctx, name) ?? (() => { const n = nextVisit(ctx); return 'patient' in n ? findVisit(ctx, n.patient) : undefined; })();
  if (!v) throw new Error(`Hittar inget besök som heter "${name ?? ''}" i din dag.`);
  return {
    patient: v.patient.name, species: v.patient.species, breed: v.patient.breed, age: v.patient.age, weight: v.patient.weight,
    reason: v.reason, visit_type: KIND[v.kind].label, duration_minutes: v.duration + v.extension,
    owner: `${v.owner.first} ${v.owner.last}`, address: `${v.address.street}, ${v.address.area}`,
    access: v.access, equipment: KIND[v.kind].equipment,
    allergy: v.flags.allergy, medication: v.flags.medication, warning: v.flags.warning,
  };
}

export function delayStatus(ctx: AssistantCtx) {
  const p = ctx.plan;
  return {
    minutes_behind_plan: p.delay, late_visits: p.lateStops.filter((s) => s.late > LATE_TOL).map((s) => ({ patient: ctx.world.visits[s.id].patient.name, late_minutes: s.late })),
    overtime_minutes: p.overtime, day_ends: hhmm(p.endAt),
  };
}

/** Offline fallback: answers the common questions from the same data, without AI. */
export function localAnswer(ctx: AssistantCtx, q: string): string {
  const t = q.toLowerCase();
  const named = ctx.plan.stops.map((s) => ctx.world.visits[s.id]).find((v) => v && t.includes(v.patient.name.toLowerCase()));
  if (/portkod|kod|åtkomst|komma in|parker/.test(t)) {
    const d = visitDetails(ctx, named?.patient.name);
    return `${d.patient}: ${d.access.join('. ')}.`;
  }
  if (/utrustning|packa|ta med|behöver jag/.test(t)) {
    const d = visitDetails(ctx, named?.patient.name);
    return `Till ${d.patient} behöver du ${d.equipment.join(', ').toLowerCase()}.`;
  }
  if (/allergi|medicin|läkemedel/.test(t)) {
    const d = visitDetails(ctx, named?.patient.name);
    return `${d.patient}: ${d.allergy ? `allergi mot ${d.allergy}` : 'ingen allergi registrerad'}${d.medication && d.medication !== 'Ingen' ? `, medicin ${d.medication}` : ''}.`;
  }
  if (/sen|efter plan|försen|hinner/.test(t)) {
    const d = delayStatus(ctx);
    return d.minutes_behind_plan > 5 ? `Du ligger ca ${d.minutes_behind_plan} minuter efter plan. Dagen slutar runt ${d.day_ends}.` : `Du ligger enligt plan. Dagen slutar runt ${d.day_ends}.`;
  }
  if (/hur många|slutar|klar för dagen|kvar idag|resten/.test(t)) {
    const d = dayOverview(ctx);
    return `Du har gjort ${d.done} av ${d.total} besök. Beräknat klar ${d.day_ends}, med ${fmtMin(d.drive_left_minutes)} körning kvar.`;
  }
  if (/nästa|hur lång|restid|framme|när|vart|adress|kund/.test(t)) {
    const n = nextVisit(ctx);
    if ('none' in n) return 'Du har inga fler besök idag.';
    const lead = n.status === 'på väg dit' ? `Du är framme hos ${n.patient} ungefär ${n.eta}, om ${n.minutes_until_arrival} minuter.` : `Nästa är ${n.patient} på ${n.address}. Det tar ${n.drive_minutes} minuter att köra${n.leave_by ? `, åk senast ${n.leave_by}` : ''}, så är du framme ${n.eta}.`;
    return lead + (n.late_minutes ? ` Det blir ${n.late_minutes} minuter efter tidsfönstret.` : '');
  }
  return 'Det kan jag bara svara på med AI, och den behöver täckning. Fråga om nästa besök, portkod, utrustning, tider eller förseningar så svarar jag direkt.';
}

export const ASSISTANT_RULES = (vetName: string, coordinator: string) => `Du är FieldVet, en röstassistent för ${vetName}, legitimerad veterinär på hembesök i Stockholm.
Svaret läses upp medan hen kör eller står i en hall. Regler:
- Svara på svenska, kort och talat: 1–3 meningar, inga listor, ingen markdown, klockslag som "tio och trettio" behövs inte – skriv 10:30.
- Hämta ALLTID fakta om dagen, tider, restider, adresser, portkoder, utrustning och flaggor via verktygen. Gissa aldrig och hitta aldrig på siffror. Om ett verktyg inte har svaret, säg det.
- Du ser bara ${vetName.split(' ')[0]}s egna besök. Du kan inte ändra planen; ändringar görs av samordnaren ${coordinator}.
- Om hen vill meddela samordnaren: använd draft_message_to_coordinator och säg att utkastet väntar på att hen trycker Skicka. Skicka aldrig själv.
- Ge inga diagnoser, doser eller behandlingsråd. Säg vänligt att det avgörs kliniskt av veterinären, och hänvisa till journalen eller en kollega.
- Allmänna frågor som inte gäller dagen får du svara kort på om du är säker, annars säg att du inte vet.`;
