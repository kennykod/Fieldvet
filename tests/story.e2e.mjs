// Phase 2: the guided pitch story, end to end, twice (the second run proves it is deterministic).
// Delay → risk → urgent case → suggested teams with impact → assign → receiving phone confirms →
// owner gets new ETA (customer view) → vet hands off to clinic → coordinator confirms the clinic slot.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/story'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const errs = [];
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
await p.goto(APP + '#samordnare'); await p.waitForTimeout(700);
const D = p.locator('.dash'); const M = p.locator('.phone .mapp'); const G = p.locator('.story');
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });

async function play(run) {
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Guidad demo/ }).first().click(); await p.waitForTimeout(700);
  expect(await G.count() === 1, 'story guide opens');
  expect(await M.count() === 1, 'story shows dashboard and phone side by side');
  expect((await p.locator('.demo-toggle').innerText()).includes('09:45'), 'story starts at 09:45');
  for (let i = 0; i < 9; i++) {
    const title = await G.locator('.story-title').innerText();
    const doBtn = G.locator('.story-foot .btn.soft');
    if (await doBtn.count()) { await doBtn.click(); await p.waitForTimeout(900); }
    for (let k = 0; k < 20 && await G.locator('.story-foot .btn.primary').isDisabled(); k++) await p.waitForTimeout(250);
    if (run === 1) { await p.waitForTimeout(300); await shot(`${String(i + 1).padStart(2, '0')}-${title.replace(/[^a-zåäö]+/gi, '-').toLowerCase()}`); }
    const next = G.locator('.story-foot .btn.primary');
    if (await next.isDisabled()) { errs.push(`run ${run}: step ${i + 1} "${title}" did not complete`); await shot(`FAIL-${run}-${i + 1}`); return; }
    // Checks along the way (first run).
    if (run === 1 && i === 1) {
      const q = await D.locator('.side-sec').first().innerText();
      expect(/Milo riskerar att bli \d+ min sen/.test(q), 'risk for Milo flagged');
    }
    if (run === 1 && i === 3) {
      const list = p.locator('[data-demo="suggest-list"]');
      expect(await list.locator('.sug').count() === 1, 'one recommendation first');
      expect((await list.locator('.sug').first().innerText()).includes('Bäst lämpad'), 'best fit labelled');
      await p.locator('[data-demo="other-teams"]').click(); await p.waitForTimeout(200);
      expect(/Framme ca/.test(await list.innerText()), 'arrival window per team');
      expect(/Ej möjlig/.test(await list.innerText()) && /körning/.test(await list.innerText()), 'impact and blocked teams shown');
    }
    if (run === 1 && i === 5) {
      expect((await M.innerText()).includes('Tessan'), 'receiving phone shows the new urgent visit');
      expect(!(await D.innerText()).includes('Väntar på att Erik bekräftar'), 'ack clears the attention item');
    }
    if (run === 1 && i === 6) {
      const c = await p.locator('.modal.customer').innerText();
      expect(/Anna kommer cirka/.test(c) && /\d\d:\d\d–\d\d:\d\d/.test(c), 'customer view shows first name and window');
      expect(!/öron|Råsundavägen|journal för/i.test(c.replace('Aldrig anledning, journal', '')), 'customer view holds no clinical/internal info');
    }
    if (run === 1 && i === 8) {
      await D.locator('.dr-history').click(); await p.waitForTimeout(200);
      const side = await D.locator('.side').innerText();
      expect(/Kliniken tar emot \d\d:\d\d/.test(side), 'visit marked as continuing at the clinic');
      expect(/Klinikbesök/.test(side), 'clinic continuation in the visit timeline');
      expect((await M.innerText()).includes('Kliniken tar emot'), 'vet sees the confirmed clinic time');
    }
    await next.click(); await p.waitForTimeout(400);
  }
  expect((await G.innerText()).includes('Hela kedjan'), 'story ends with the summary');
  if (run === 1) await shot('10-summary');
}

await play(1);
await G.getByRole('button', { name: /Spela igen/ }).click(); await p.waitForTimeout(600);
expect((await p.locator('.demo-toggle').innerText()).includes('09:45'), 'replay resets to 09:45');
await p.locator('.story .story-head button[aria-label="Avsluta demoberättelsen"]').click();
await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Återställ demo/ }).click(); await p.waitForTimeout(400);
await play(2);

// The Provet story: Starta navigering → informerad via Provet → Visa historik → ny tid en gång → ingen dubblett.
await p.locator('.story .story-head button[aria-label="Avsluta demoberättelsen"]').click().catch(() => {});
await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Provet i bakgrunden/ }).click(); await p.waitForTimeout(700);
expect((await p.locator('.demo-toggle').innerText()).includes('08:20'), 'Provet story starts at 08:20');
for (let i = 0; i < 7; i++) {
  const title = await G.locator('.story-title').innerText();
  const doBtn = G.locator('.story-foot .btn.soft');
  if (await doBtn.count()) { await doBtn.click(); await p.waitForTimeout(900); }
  for (let k = 0; k < 20 && await G.locator('.story-foot .btn.primary').isDisabled(); k++) await p.waitForTimeout(250);
  await shot(`provet-${i + 1}`);
  if (await G.locator('.story-foot .btn.primary').isDisabled()) { errs.push(`provet story step ${i + 1} "${title}" did not complete`); break; }
  await G.locator('.story-foot .btn.primary').click(); await p.waitForTimeout(300);
}
expect((await G.innerText()).includes('Provet i bakgrunden'), 'Provet story ends with its summary');
await b.close();
finish('story', errs);
