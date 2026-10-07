// Provet in the background: the required demo scenario end to end.
// Starta navigering → På väg → ETA → Provet sends → "informerad via Provet"; Visa historik (read-only, own patient);
// a material delay sends one update; a retry is stopped as a duplicate; failures and preferences surface to the coordinator.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/provet'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1680, height: 940 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(APP + '#bada'); await p.waitForTimeout(700);
const D = p.locator('.dash'); const M = p.locator('.phone .mapp');
let n = 0; const shot = async (name) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); await shot('FAIL-' + label); } };
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const demo = async (name) => { await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name }).click(); await p.waitForTimeout(300); };
const system = async () => { await D.locator('.rail-btn', { hasText: 'System' }).click(); await p.waitForTimeout(200); const t = await D.locator('.provet-sync').innerText(); await D.locator('.rail-btn', { hasText: 'Idag' }).click(); return t; };
const row = (t, label) => (t.split('\n').find((l) => l.startsWith(label)) ?? '').replace(label, '').trim();

await step('on-the-way', async () => {
  expect((await M.innerText()).includes('Bosse'), 'Bosse is the next visit');
  await M.locator('[data-demo="m-nav"]').click();
  expect(/på väg/i.test(await M.locator('.nextcard .nc-eyebrow').innerText()), 'status På väg directly after Starta navigering');
  expect(await M.getByRole('button', { name: 'På väg', exact: true }).count() === 0, 'no separate På väg button');
  expect((await M.locator('[data-demo="m-comm"]').innerText()).includes('Skickar'), 'pending state while Provet sends');
  await p.waitForTimeout(1000); await shot('informed');
  const comm = await M.locator('[data-demo="m-comm"]').innerText();
  expect(/informerad via Provet ✓ · \d\d:\d\d–\d\d:\d\d/.test(comm), `vet sees "informerad via Provet ✓" with window (got ${comm})`);
  expect((await D.locator('[data-demo="vc-comm-anna"]').innerText()).includes('informerad via Provet'), 'coordinator team card shows the owner was informed');
  expect(row(await system(), 'Kundmeddelanden skickade av Provet') === '1', 'exactly one message sent');
});

await step('history', async () => {
  await M.locator('[data-demo="m-history"]').first().click();
  expect(await M.locator('.hist-skel').count() > 0, 'calm loading skeleton while Provet answers');
  await M.locator('[data-demo="history-list"]').waitFor({ timeout: 3000 }); await shot('history');
  const h = await M.locator('.mhist').innerText();
  expect(h.includes('Hämtat från Provet') && h.includes('endast läsning'), 'source and read-only label');
  expect(h.includes('Lindrig vaccinreaktion') && h.includes('Apoquel'), 'relevant history shown');
  expect(!h.includes('Status: AT ua'), 'full note not loaded until asked');
  await M.getByRole('button', { name: 'Visa hela anteckningen' }).first().click(); await p.waitForTimeout(600);
  expect((await M.locator('.mhist').innerText()).includes('Observera 15–20 min'), 'full note on demand');
  expect(await M.locator('.mhist textarea, .mhist input').count() === 0, 'nothing editable in history');
  await M.locator('[data-demo="history-back"]').click(); await p.waitForTimeout(200);
  expect(await M.locator('.mhist').count() === 0 && /på väg/i.test(await M.locator('.nextcard .nc-eyebrow').innerText()), 'back to the same visit state');
  const coord = await D.innerHTML();
  expect(!coord.includes('vaccinreaktion') && !coord.includes('Apoquel') && !coord.includes('Observera 15'), 'coordinator DOM has no clinical history or flags');
});

await step('delay-one-update', async () => {
  await demo(/Köer på Annas väg/); await p.waitForTimeout(1100); await shot('updated');
  const comm = await M.locator('[data-demo="m-comm"]').innerText();
  expect(comm.includes('Ny ankomsttid skickad ✓'), `vet sees new time sent (got ${comm})`);
  expect((await D.locator('[data-demo="vc-comm-anna"]').innerText()).includes('Ny ankomsttid skickad'), 'coordinator sees updated state');
  // Recalculations without a material change do not send more.
  await demo(/Spola fram 15 min/); await p.waitForTimeout(900);
  expect(row(await system(), 'Kundmeddelanden skickade av Provet') === '2', 'exactly two messages so far: on the way + one update');
});

await step('duplicate', async () => {
  await demo(/skickar samma händelse igen/); await p.waitForTimeout(900);
  const t = await system();
  expect(row(t, 'Kundmeddelanden skickade av Provet') === '2', 'retry did not send another sms');
  expect(row(t, 'Dubbletter stoppade').startsWith('1 i FieldVet'), 'duplicate counted as stopped');
});

await step('drawer', async () => {
  await D.locator('[data-vetrow="anna"] .bhead').click();
  await D.locator('.stop', { hasText: 'Bosse' }).click(); await p.waitForTimeout(300); await shot('drawer');
  expect((await D.locator('.dr-eta').innerText()).includes('Ny ankomsttid skickad via Provet ✓'), 'drawer shows comm state');
  await D.locator('[data-demo="customer-view"]').click(); await p.waitForTimeout(300); await shot('customer');
  const c = await p.locator('.modal.customer').innerText();
  expect(c.includes('Skickat via Provet') && c.includes('Kliniken:'), 'sent message shown as Provet template');
  await p.locator('.modal.customer .modal-head button[aria-label="Stäng"]').click();
  await D.locator('.drawer .panel-head .iconbtn').click(); await p.keyboard.press('Escape');
});

await step('provet-down', async () => {
  // Arrive, finish Bosse, and drive to Luna while Provet is down: the field flow keeps going.
  for (const x of ['m-arrive', 'm-start']) { await M.locator(`[data-demo="${x}"]`).click(); await p.waitForTimeout(150); }
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(400);
  await M.getByRole('button', { name: 'Nästa besök', exact: true }).click();
  await demo('Provet slutar svara');
  await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(1100); await shot('failed');
  expect((await M.locator('[data-demo="m-comm"]').innerText()).includes('kunde inte skickas'), 'vet sees a calm failure line');
  expect(await M.locator('[data-demo="m-arrive"]').count() === 1, 'vet can continue (Jag är framme)');
  const att = await D.locator('.side').innerText();
  expect(att.includes('kunde inte skickas'), 'coordinator gets the failure in Behöver åtgärdas');
  await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(900);
  expect((await M.locator('.mhist').innerText()).includes('Provet svarar inte'), 'history explains Provet is down in plain Swedish');
  await M.locator('[data-demo="history-back"]').click();
  await demo('Provet svarar igen'); await p.waitForTimeout(1100); await shot('recovered');
  expect((await M.locator('[data-demo="m-comm"]').innerText()).includes('informerad via Provet'), 'queued message sent after Provet is back');
  expect(!(await D.locator('.side').innerText()).includes('kunde inte skickas'), 'failure cleared');
});

await step('offline-history', async () => {
  await demo('Anna tappar täckning');
  await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(300); await shot('offline-history');
  const h = await M.locator('.mhist').innerText();
  expect(h.includes('Sparad sammanfattning') || h.includes('utan täckning'), 'offline history is a cached summary or a clear message');
  expect(!h.includes('Visa hela anteckningen'), 'no full notes offline');
  await M.locator('[data-demo="history-back"]').click();
  await demo('Anna får täckning igen');
});

await step('preferences', async () => {
  // Sigge's owner has a landline only according to Provet: FieldVet does not send, the coordinator is asked to call.
  for (let i = 0; i < 7; i++) {
    const head = await M.locator('.nextcard').innerText();
    if (/Sigge/.test(head) && /Starta navigering/.test(await M.locator('.mcta').innerText())) break;
    for (const x of ['m-arrive', 'm-start']) { const b = M.locator(`[data-demo="${x}"]`); if (await b.count()) { await b.click(); await p.waitForTimeout(150); } }
    const fin = M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' });
    if (await fin.count()) { await fin.click(); await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(300); }
    const nx = M.getByRole('button', { name: 'Nästa besök', exact: true }); if (await nx.count()) await nx.click();
    const nav = M.locator('[data-demo="m-nav"]'); if (!/Sigge/.test(await M.locator('.nextcard').innerText()) && await nav.count()) { await nav.click(); await p.waitForTimeout(900); }
  }
  await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(900); await shot('no-sms');
  expect((await M.locator('[data-demo="m-comm"]').innerText()).includes('tar inte emot sms'), 'vet sees that Provet says no sms');
  const side = await D.locator('.side').innerText();
  expect(side.includes('Ring Gunnel om ankomsttiden?'), 'coordinator is asked to call when Provet says no sms');
  expect(row(await system(), 'Inte skickade enligt ägarens val i Provet') !== '0', 'blocked message is not sent');
  await D.locator('.side .alert', { hasText: 'Ring Gunnel' }).getByRole('button').click(); await p.waitForTimeout(300);
  await D.getByRole('button', { name: 'Jag har ringt' }).click(); await p.waitForTimeout(200);
  expect((await D.locator('.dr-eta').innerText()).includes('per telefon'), 'coordinator marks the owner as informed by phone');
  await D.locator('.drawer .panel-head .iconbtn').click();
});

await step('access', async () => {
  const t = await (async () => { await D.locator('.rail-btn', { hasText: 'System' }).click(); await p.waitForTimeout(200); return D.innerText(); })();
  expect(t.includes('Provet · patienthistorik') && t.includes('Provet · kundmeddelanden'), 'Provet adapters listed');
  expect(!/Lindrig svullnad|Observera 15/.test(await D.locator('.auditlog').innerText()), 'audit log has no clinical text');
  expect((await D.locator('.auditlog').innerText()).includes('Läste patienthistorik från Provet') || (await D.locator('.provet-sync').innerText()).includes('Historik läst av veterinär'), 'history access is logged');
  expect(!/Historik läst av veterinär\s*0/.test(await D.locator('.provet-sync').innerText()), 'history reads counted');
});

await b.close();
finish('provet', errs);
