import { initialRoutes, START_CLOCK, VETS, t, type Visit } from './data';
import { provet } from './provet';
import { advance, commWindow, optimizeRoute, planAll, relax, stampBaseline, type World } from './engine';

export function initialWorld(): World {
  // Today's home visits come from Provet (mock adapter); FieldVet plans and runs them.
  const list = provet.booking.todaysHomeVisits();
  const visits: Record<string, Visit> = Object.fromEntries(list.map((v) => [v.id, v]));
  const routes = initialRoutes(list);
  const dawn = t('06:30');
  const rv = relax(visits);
  for (const vet of VETS) routes[vet.id] = optimizeRoute(vet, routes[vet.id], rv, dawn);
  let w: World = { now: dawn, visits, routes, manualVet: '', planVersion: 1 };
  // Morning plan is sent to customers: flexible bookings get a concrete 30-minute window.
  for (const p of Object.values(planAll({ ...w, visits: rv })))
    for (const s of p.stops) if (visits[s.id].flexible) visits[s.id] = { ...visits[s.id], window: commWindow(s.arrive) };
  w = stampBaseline(w);
  w = advance(w, START_CLOCK);
  return { ...w, manualVet: 'anna' };
}
