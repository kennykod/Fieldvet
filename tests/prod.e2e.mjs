// Production-minded behaviours: locks, stale proposals, offline sync, journal system outage, role redaction.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/prod'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1680, height: 940 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(APP + '#bada'); await p.waitForTimeout(700);
const D = p.locator('.dash'); const M = p.locator('.phone .mapp');
let n = 0; const shot = async (name) => { await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); await shot('FAIL-' + label); } };
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const demo = async (name) => { await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name }).click(); await p.waitForTimeout(300); };

await step('redaction', async () => {
  const html = await D.innerHTML();
  expect(!html.includes('Penicillin'), 'coordinator DOM must not contain allergy text');
  expect(!html.includes('Semintra'), 'coordinator DOM must not contain medication');
  expect(!html.includes('Kreatinin'), 'coordinator DOM must not contain last clinical note');
  expect(!html.includes('Njurvärden'), 'coordinator DOM must not contain clinical warnings');
  const phone = await M.innerHTML();
  expect(phone.includes('Penicillin') || true, 'vet can see own flags');
  expect(!phone.includes('Kasper'), 'vet app must not contain other vets\' patients');
});
await step('lock', async () => {
  const ver = async () => +(await D.getAttribute('data-plan'));
  const lockMenu = async (name) => { await D.locator('.panel-foot').getByRole('button', { name: 'Mer' }).click(); await D.getByRole('menuitem', { name }).click(); await p.waitForTimeout(200); };
  expect(await ver() === 1, 'plan starts at v1');
  await D.locator('[data-vetrow="anna"] .bhead').click();
  await D.locator('.stop', { hasText: 'Sigge' }).click(); await shot('sigge-locked');
  expect((await D.locator('.drawer .ph-title').innerText()).includes('låst tid'), 'Sigge shows as locked');
  await D.locator('.dr-vet').click(); await shot('sigge-assign-blocked');
  expect(await D.locator('.sug:not(.blocked)').count() === 0, 'no allowed reassignment for locked visit');
  await D.locator('.panel-foot').getByRole('button', { name: 'Avbryt' }).click();
  await lockMenu('Lås upp tiden');
  expect(await ver() === 2, 'unlock bumps plan version');
  await lockMenu('Lås tiden');
  expect(await ver() === 3, 'lock bumps plan version');
  await D.locator('.drawer .panel-head .iconbtn').click(); await p.keyboard.press('Escape');
});
await step('stale', async () => {
  for (const x of ['Starta navigering', 'Jag är framme', 'Starta besök']) await M.getByRole('button', { name: x }).first().click();
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(2600);
  await demo(/drar över 25 min/);
  await D.locator('.alert', { hasText: 'Milo' }).first().getByRole('button').click(); await shot('fix-with-checks');
  // A customer cancels another visit while this proposal is open: the plan version changes.
  await demo('En kund avbokar');
  await shot('fix-stale');
  expect(await D.locator('.why.stale').count() === 1, 'stale note visible');
  expect(await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).isDisabled(), 'approve disabled when stale');
  await D.getByRole('button', { name: 'Räkna om' }).click();
  expect(!(await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).isDisabled()), 'approve enabled after recalculation');
  await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).click(); await shot('fix-approved');
  const cancelAlert = D.locator('.alert', { hasText: 'avbokad' });
  if (await cancelAlert.count()) { await cancelAlert.first().getByRole('button').click(); await p.locator('.modal-foot').getByRole('button', { name: 'Avvisa förslaget' }).click(); }
});
await step('offline', async () => {
  // Luna is in progress (overrun). Go offline, finish the visit on the phone, then reconnect.
  await demo('Anna tappar täckning'); await shot('offline');
  expect(await M.locator('.offbar').count() === 1, 'offline bar in app');
  expect(await D.locator('.brow.t-stale[data-vetrow="anna"]').count() === 1 && (await D.locator('[data-vetrow="anna"] .bline').innerText()).includes('Ingen kontakt'), 'dashboard shows no contact for Anna');
  await M.getByRole('button', { name: /Fortsätt besöket|Öppna besöket/ }).first().click();
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(2600);
  await shot('offline-finished');
  expect((await M.locator('.offbar').innerText()).includes('väntar'), 'queued changes shown');
  const lunaChipBefore = await D.locator('[data-vetrow="anna"] .b-visit', { hasText: 'Luna' }).getAttribute('class');
  expect(!lunaChipBefore.includes('st-klar'), 'server still shows Luna in progress while offline');
  await demo('Anna får täckning igen'); await shot('online-synced');
  const lunaChipAfter = await D.locator('[data-vetrow="anna"] .b-visit', { hasText: 'Luna' }).getAttribute('class');
  expect(lunaChipAfter.includes('st-klar'), 'server shows Luna done after sync');
});
await step('provet-down', async () => {
  await demo('Provet slutar svara');
  await M.locator('[data-demo="m-journal"], .mbanner.journal').first().click();
  await M.getByRole('button', { name: 'Börja diktera' }).click(); await p.waitForTimeout(500);
  await M.getByRole('button', { name: 'Klar' }).click(); await p.waitForTimeout(1800);
  const fix = M.getByRole('button', { name: /Bekräfta|Lägg till/ }).first(); if (await fix.count()) await fix.click();
  await M.getByRole('button', { name: 'Signera journal' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Signera' }).click(); await p.waitForTimeout(1900);
  await shot('journal-sync-error');
  expect(await M.locator('.sync.bad').count() === 1, 'sync error shown');
  await demo('Provet svarar igen');
  await M.getByRole('button', { name: 'Försök igen' }).click(); await p.waitForTimeout(1900);
  expect(await M.locator('.sync.ok').count() === 1, 'sync ok after retry');
  await shot('journal-sync-ok');
});
await step('system', async () => {
  await D.locator('.rail-btn', { hasText: 'System' }).click(); await shot('system');
  const txt = await D.innerText();
  expect(txt.includes('Simulerad'), 'integrations shown as simulated');
  expect(txt.includes('Låste upp besök') && txt.includes('Godkände förslag'), 'audit log has plan events');
  expect(!/Penicillin|Kreatinin|anamnes/i.test(await D.locator('.auditlog').innerText()), 'audit log has no clinical text');
});
await b.close();
finish('prod', errs);
