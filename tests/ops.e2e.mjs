// Operations layer: the pitch scenario from the improvement brief, end to end.
// A vet runs ~20 min behind → risk flagged → coordinator opens it → sees other teams → reassigns →
// the receiving vet's phone shows the visit marked "Uppdaterad av samordnaren" → summary and cards update.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/ops'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const errs = [];
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); await p.screenshot({ path: `${OUT}/FAIL-${label}.png` }); } };
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
await p.goto(APP + '#bada'); await p.waitForTimeout(800);
const D = p.locator('.dash'); const M = p.locator('.phone .mapp');
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });

await step('summary', async () => {
  const sum = await D.locator('.daysum').innerText();
  expect(/besök idag/.test(sum) && /klara/.test(sum) && /akutluck/.test(sum), 'one compact summary line');
  expect(/1 behöver din uppmärksamhet/.test(sum), 'summary says how many things need attention');
  const queue = await D.locator('.side-sec.attention').innerText();
  expect(queue.includes('Nytt akutärende') && /akut patient/i.test(queue), 'clinical urgency shown as its own category');
  expect(await D.locator('.brow').count() === 4, 'one row per team');
  expect((await D.locator('[data-vetrow="johan"] .bline').innerText()).includes('enligt plan'), 'normal team reads "enligt plan"');
  expect(await D.locator('.brow .chip.cap').count() === 0, 'no abstract capacity chips');
  expect(await D.locator('.vetfilter').count() === 0 && await D.locator('.timeline').count() === 0, 'one board, no separate filter or timeline');
  expect((await D.locator('.nexthour').innerText()).length > 10, 'next hour listed');
  expect(/Plats för akut/.test(await D.locator('[data-vetrow="erik"] .bline').innerText()), 'free time in plain words');
  await shot('01-start');
});

await step('board-modes', async () => {
  await D.getByRole('radio', { name: 'Hela dagen' }).click(); await p.waitForTimeout(150);
  const all = await D.locator('[data-vetrow="anna"] .b-visit').count();
  await D.getByRole('radio', { name: 'Från nu' }).click(); await p.waitForTimeout(150);
  expect(all >= 6, 'whole day shows every visit');
  expect((await D.locator('[data-vetrow="anna"] .b-more').innerText()).includes('senare'), 'later visits counted, one click away');
  await D.getByRole('button', { name: 'Dölj karta' }).click(); await p.waitForTimeout(150);
  expect(await D.locator('.mapwrap').count() === 0, 'map can be hidden');
  await D.getByRole('button', { name: 'Visa karta' }).click(); await p.waitForTimeout(150);
  await p.keyboard.press('n'); await p.waitForTimeout(200);
  expect(await p.locator('.modal.urgent').count() === 1, 'N opens a new urgent case');
  await p.keyboard.press('Escape'); await p.locator('.modal.urgent .modal-head button[aria-label="Stäng"]').click().catch(() => {}); await p.waitForTimeout(150);
});

await step('team-card', async () => {
  await D.locator('.vetmark', { has: p.locator('text=EH') }).first().click({ force: true }); await p.waitForTimeout(400);
  const card = D.locator('.teamcard');
  expect(await card.count() === 1, 'clicking a team marker opens the team card');
  const t = await card.innerText();
  expect(t.includes('Erik Holm') && /Framme/.test(t), 'team card shows status and next arrival');
  expect((await D.locator('.side').innerText()).includes('Erik'), 'the same team is selected in the side panel');
  expect(await D.locator('.brow.sel[data-vetrow="erik"]').count() === 1, 'team row follows the selection');
  await shot('02-teamcard');
  await card.getByRole('button', { name: 'Stäng teamkortet' }).click();
  await p.keyboard.press('Escape');
});

await step('delay-risk', async () => {
  await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(150);
  await M.locator('[data-demo="m-arrive"]').click(); await p.waitForTimeout(150);
  await M.locator('[data-demo="m-start"]').click(); await p.waitForTimeout(150);
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(600);
  await M.getByRole('button', { name: 'Nästa besök', exact: true }).click(); await p.waitForTimeout(200);
  await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(150);
  await M.locator('[data-demo="m-arrive"]').click(); await p.waitForTimeout(150);
  await M.locator('[data-demo="m-start"]').click(); await p.waitForTimeout(150);
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /drar över/ }).click(); await p.waitForTimeout(500);
  const queue = await D.locator('.side-sec.attention').innerText();
  expect(/Milo riskerar att bli \d+ min sen/.test(queue), 'risk item names the visit and delay');
  expect(queue.includes('Lunas besök drar över') && /planering/i.test(queue), 'risk item explains the cause, as a planning issue');
  expect(/blir \d+ min sen/.test(await D.locator('[data-vetrow="anna"] .bline').innerText()), 'risk also shown in the team row');
  expect(await D.locator('[data-vetrow="anna"] .b-visit.late').count() >= 1, 'late visit marked in the row');
  expect(/behöver din uppmärksamhet/.test(await D.locator('.daysum').innerText()), 'summary counts it');
  await shot('03-risk');
});

await step('reassign', async () => {
  await D.locator('.alert', { hasText: 'Milo' }).first().getByRole('button').click(); await p.waitForTimeout(500);
  const panel = D.locator('.side .panel');
  expect(await panel.locator('.reco').count() === 1, 'one recommendation first');
  expect(await panel.locator('.alts').count() === 0, 'alternatives hidden until asked for');
  await panel.locator('[data-demo="alts"]').click(); await p.waitForTimeout(300);
  expect(/välj team själv/i.test(await panel.innerText()), 'other teams available under alternatives');
  await shot('04-fix');
  await panel.locator('.sug:not(.blocked)', { hasText: 'Erik' }).first().click(); await p.waitForTimeout(500);
  await shot('05-confirm');
  await D.locator('.panel-foot').getByRole('button', { name: /Bekräfta flytt till Erik/ }).click(); await p.waitForTimeout(500);
  const toast = await p.locator('.toasts').innerText();
  expect(/Milo flyttad till Erik/.test(toast) && /Ägaren informeras via Provet/.test(toast), 'clear confirmation of the result');
  expect(await p.locator('.toast-act', { hasText: 'Ångra' }).count() === 1, 'undo offered');
  expect(await D.locator('.b-visit.flash').count() >= 1, 'changed visit briefly highlighted');
  expect(!(await D.locator('.side').innerText()).includes('Milo riskerar'), 'risk resolved');
  await shot('06-after');
});

await step('undo', async () => {
  // Wait past Provet's delivery answer (~0.7 s): it updates message status and must not block undo.
  await p.waitForTimeout(2500);
  await p.locator('.toast-act', { hasText: 'Ångra' }).click(); await p.waitForTimeout(400);
  expect(!/går inte att ångra/.test(await p.locator('.toasts').innerText()), 'undo still works after the owner was informed');
  expect((await D.locator('.side').innerText()).includes('Milo riskerar'), 'undo restores the previous plan');
  await D.locator('.alert', { hasText: 'Milo' }).first().getByRole('button').click(); await p.waitForTimeout(500);
  await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).click(); await p.waitForTimeout(500);
  expect(!(await D.locator('.side').innerText()).includes('Milo riskerar'), 'recommended proposal approved');
});

await step('receiving-phone', async () => {
  await p.locator('#phone-vet').selectOption('erik'); await p.waitForTimeout(500);
  const phone = await M.innerText();
  expect(phone.includes('Milo'), 'Erik\'s app lists Milo');
  await shot('07-erik-phone');
  await p.locator('#phone-vet').selectOption('anna'); await p.waitForTimeout(300);
  expect(!/Nästa besök[\s\S]{0,40}Milo/i.test(await M.innerText()), 'Milo is no longer next for Anna');
});

await step('status-steps', async () => {
  await D.locator('[data-vetrow="anna"] .bhead').click(); await p.waitForTimeout(200);
  await D.locator('.stop', { hasText: 'Luna' }).first().click(); await p.waitForTimeout(300);
  const steps = D.locator('.status-steps');
  expect(await steps.count() === 1, 'visit drawer shows the status progression');
  expect((await steps.getAttribute('aria-label')) === 'Status: Pågår', 'status is Pågår');
  expect((await D.locator('.drawer').innerText()).includes('Klart'), 'one status vocabulary: Planerat → På väg → Framme → Pågår → Klart');
  await shot('08-steps');
});

await b.close();
finish('ops', errs);
