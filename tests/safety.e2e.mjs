// Demo safety: reset never blanks the page, coordinator messages reach the phone as unread,
// a stale urgent suggestion cannot create an impossible route, and "Båda samtidigt" fills the height.
import { launch, APP, APP_WITH_INTRO, finish } from './_env.mjs';
import { pathToFileURL } from 'url';
import fs from 'fs';
const OUT = '/tmp/safety'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const errs = [];
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const open = async (hash, w = 1440, h = 900) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  await p.goto(APP + hash); await p.waitForTimeout(800);
  return p;
};
const demo = async (p, re) => { await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: re }).click(); await p.waitForTimeout(350); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); } };

await step('reset-with-open-visit', async () => {
  const p = await open('#bada');
  const D = p.locator('.dash');
  await D.getByRole('button', { name: 'Nytt akutärende' }).click();
  await p.getByRole('button', { name: 'Fyll i exempel (demo)' }).click();
  await p.getByRole('button', { name: 'Hitta veterinär' }).click(); await p.waitForTimeout(300);
  await p.locator('.modal-foot').getByRole('button', { name: /^Tilldela/ }).click(); await p.waitForTimeout(300);
  await D.locator('.b-visit', { hasText: 'Tessan' }).first().click(); await p.waitForTimeout(300);
  await p.locator('.phone .mapp .nc-patient').first().click(); await p.waitForTimeout(200);
  await demo(p, /Återställ/); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/reset.png` });
  expect(await D.locator('.bhead').count() === 4, 'dashboard still rendered after reset');
  expect(await D.locator('.b-visit', { hasText: 'Tessan' }).count() === 0, 'urgent visit gone after reset');
  expect((await p.locator('.phone .mapp').innerText()).includes('Bosse'), 'phone back at the start of the day');
  expect(await p.locator('.crash').count() === 0, 'no crash screen');
  await p.close();
});

await step('unread-on-phone', async () => {
  const p = await open('#bada');
  const M = p.locator('.phone .mapp');
  const before = Number(await M.locator('.mtabs .badge').first().innerText().catch(() => '0')) || 0;
  await p.locator('.dash .rail-btn', { hasText: 'Meddelanden' }).click();
  await p.locator('.dash .composer input').fill('Kan du ringa mig efter Bosse?');
  await p.locator('.dash .composer').getByRole('button', { name: /Skicka/ }).click(); await p.waitForTimeout(300);
  const after = Number(await M.locator('.mtabs .badge').first().innerText().catch(() => '0')) || 0;
  expect(after === before + 1, `phone badge should grow (before ${before}, after ${after})`);
  expect((await M.innerText()).includes('Kan du ringa mig efter Bosse?'), 'message shown on the phone home screen');
  await M.locator('.mtabs button', { hasText: 'Inkorg' }).click(); await p.waitForTimeout(300);
  expect(await M.locator('.mtabs .badge').count() === 0, 'badge cleared after reading');
  await p.screenshot({ path: `${OUT}/unread.png` });
  await p.close();
});

await step('stale-urgent-suggestion', async () => {
  const p = await open('#bada');
  const M = p.locator('.phone .mapp');
  await p.locator('.dash').getByRole('button', { name: 'Nytt akutärende' }).click();
  await p.getByRole('button', { name: 'Fyll i exempel (demo)' }).click();
  await p.getByRole('button', { name: 'Hitta veterinär' }).click(); await p.waitForTimeout(300);
  expect((await p.locator('.modal').innerText()).includes('Anna'), 'Anna suggested at 08:20');
  await M.getByRole('button', { name: 'Starta navigering' }).first().click(); await p.waitForTimeout(400);
  const btn = p.locator('.modal-foot').getByRole('button', { name: /^Tilldela/ });
  if (await btn.isEnabled()) { await btn.click(); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${OUT}/stale-urgent.png` });
  const phone = await M.innerText();
  expect(!/Tessan[\s\S]*Starta navigering/.test(phone) || phone.indexOf('Bosse') < phone.indexOf('Tessan'), 'Anna keeps driving to Bosse first');
  expect((phone.match(/På väg till/gi) || []).length <= 1, 'never two visits under way');
  await p.close();
});

await step('split-fills-height', async () => {
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    const p = await open('#bada', w, h);
    const stage = await p.locator('.split .scaled').boundingBox();
    const dash = await p.locator('.split .dash').boundingBox();
    expect(Math.abs(stage.y + stage.height - (dash.y + dash.height)) < 4, `${w}x${h}: dashboard fills the height (stage ${Math.round(stage.y + stage.height)}, dash ${Math.round(dash.y + dash.height)})`);
    await p.screenshot({ path: `${OUT}/split-${w}.png` });
    await p.close();
  }
});

await step('visitor-intro', async () => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(APP_WITH_INTRO); await p.waitForTimeout(700);
  expect(await p.locator('.welcome').count() === 1, 'intro shown to a first-time visitor');
  await p.screenshot({ path: `${OUT}/intro-desktop.png` });
  await p.getByRole('button', { name: 'Visa båda samtidigt' }).click(); await p.waitForTimeout(300);
  expect(await p.locator('.welcome').count() === 0, 'intro closes');
  expect(await p.locator('.phone .mapp').count() === 1, 'intro starts "Båda samtidigt"');
  await p.reload(); await p.waitForTimeout(700);
  expect(await p.locator('.welcome').count() === 0, 'intro not shown again after it was closed');
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: 'Så fungerar demon' }).click(); await p.waitForTimeout(200);
  expect(await p.locator('.welcome').count() === 1, 'intro can be reopened from the demo menu');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  expect(await p.locator('.welcome').count() === 0, 'Escape closes the intro');
  await ctx.close();
});

await step('static-site-phone', async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  await p.goto(pathToFileURL(new URL('../dist/web/index.html', import.meta.url).pathname).href); await p.waitForTimeout(800);
  expect(await p.title() === 'FieldVet – demo', 'site title');
  expect(await p.getByRole('button', { name: 'Starta som veterinär' }).count() === 1, 'phone intro offers the vet app');
  await p.screenshot({ path: `${OUT}/intro-phone.png` });
  await p.getByRole('button', { name: 'Starta som veterinär' }).click(); await p.waitForTimeout(300);
  expect((await p.locator('.mapp').innerText()).includes('Bosse'), 'vet app starts');
  await ctx.close();
});

await b.close();
finish('safety', errs);
