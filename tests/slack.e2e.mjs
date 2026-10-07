// Slack tab: seeded threads, unread badge, reply, create visit from a request thread, bot posts, no clinical data.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/slack'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1680, height: 940 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(APP + '#samordnare'); await p.waitForTimeout(700);
const D = p.locator('.dash');
let n = 0; const shot = async (name) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); await shot('FAIL-' + label); } };
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const rail = D.locator('.rail-btn', { hasText: 'Slack' });
const demo = async (name) => { await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name }).click(); await p.waitForTimeout(300); };

await step('badge', async () => { expect(await rail.locator('.dot').count() === 1, 'unread dot on Slack rail'); });
await step('open', async () => {
  await rail.click(); await shot('slack');
  expect(await D.locator('.sk-item').count() === 4, 'four threads visible at 08:20 (08:40 is gated)');
  expect((await D.locator('.sk-head').innerText()).includes('reception'), 'newest thread (reception request) opens first');
  expect(await D.locator('.sk-item .sk-tag.req').count() === 1, 'request tag');
});
await step('reply', async () => {
  await D.locator('.sk-compose input').fill('Vi tar henne, bokar strax.');
  await D.locator('.sk-compose button[type=submit]').click();
  expect((await D.locator('.sk-body').innerText()).includes('Vi tar henne'), 'reply shown');
});
await step('create-visit', async () => {
  await D.getByRole('button', { name: 'Skapa hembesök' }).click();
  await p.locator('.modal-foot').getByRole('button', { name: /Föreslå|Hitta|Visa förslag|Visa föreslagna team|Hitta veterinär/ }).first().click();
  await p.locator('.modal-foot').getByRole('button', { name: /^Tilldela/ }).click();
  await p.waitForTimeout(400);
  await rail.click(); await D.locator('.sk-item', { hasText: 'Tessan' }).first().click(); await shot('handled');
  const body = await D.locator('.sk-body').innerText();
  expect(body.includes('Hembesök bokat'), 'bot confirms booking in the request thread');
  expect(await D.getByRole('button', { name: /Öppna Tessan i FieldVet/ }).count() === 1, 'thread linked to visit');
  expect(await D.locator('.sk-item', { hasText: 'Akut hembesök tillagt' }).count() === 1, 'bot posted to #hembesok-stockholm');
  await D.getByRole('button', { name: /Öppna Tessan i FieldVet/ }).click(); await shot('opened-visit');
  expect(await D.locator('.drawer', { hasText: 'Tessan' }).count() >= 1, 'visit drawer opens');
});
await step('cancel-bot', async () => {
  await demo(/avbokar/);
  const md = p.locator('.modal'); if (await md.count()) await md.getByRole('button', { name: /Godkänn|Stäng/ }).first().click();
  await rail.click(); await shot('after-cancel');
  expect(await D.locator('.sk-item', { hasText: 'är avbokad' }).count() >= 1, 'bot posted cancellation');
});
await step('time-gate', async () => {
  await demo(/Spola fram/); await demo(/Spola fram/); await p.waitForTimeout(300); await shot('ff');
  expect(await D.locator('.sk-item', { hasText: 'Veckomötet' }).count() === 1, '08:40 thread appears after fast forward');
});
await step('no-clinical', async () => {
  const html = await D.locator('.slackview').innerHTML();
  for (const w of ['Penicillin', 'Semintra', 'Kreatinin', 'Njurvärden', '070-']) expect(!html.includes(w), `Slack must not contain ${w}`);
});
await b.close();
finish('slack', errs);
