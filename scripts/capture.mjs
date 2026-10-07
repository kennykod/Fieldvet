// Captures the six pitch screenshots (plus extras) from the finished prototype.
import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const OUT = '/home/claude/fieldvet/pitch/shots';
const URL = 'file:///home/claude/fieldvet/dist/fieldvet.local.html?intro=0';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const wait = (p, ms = 700) => p.waitForTimeout(ms);
const shotOn = (p) => p.evaluate(() => document.body.classList.add('shot'));
const shotOff = (p) => p.evaluate(() => document.body.classList.remove('shot'));

/* ——— Desktop ——— */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#bada'); await wait(p);
  const M = p.locator('.phone .mapp');
  // Anna finishes Bosse and heads to Luna
  for (const n of ['Starta navigering', 'Jag är framme', 'Starta besök']) { await M.getByRole('button', { name: n }).first().click(); await wait(p, 250); }
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await wait(p, 2600);
  await M.getByRole('button', { name: 'Starta navigering' }).first().click(); await wait(p, 300);
  await p.locator('.demostrip .seg button', { hasText: 'Samordnare' }).click();
  await shotOn(p); await wait(p, 1200);
  // clip to exclude the hidden demo strip area (stage keeps full height)
  await p.screenshot({ path: `${OUT}/d-idag.png` });
  await p.locator('.dash .side-sec.grow').screenshot({ path: `${OUT}/e-vetcards.png` });
  await p.locator('.dash .map').screenshot({ path: `${OUT}/e-map.png` });

  // Delay: Anna's Luna visit overruns 25 min
  await shotOff(p);
  await p.locator('.demo-toggle').click();
  await p.getByRole('menuitem', { name: /drar över 25 min/ }).click(); await wait(p, 400);
  await shotOn(p);
  await p.locator('.alert', { hasText: 'Risk för' }).first().getByRole('button').click(); await wait(p, 1300);
  await p.screenshot({ path: `${OUT}/d-delay.png` });
  await p.locator('.dash .side .panel').screenshot({ path: `${OUT}/e-fix.png` });
  await p.locator('.panel-foot').getByRole('button', { name: 'Före/efter' }).click(); await wait(p, 1200);
  await p.screenshot({ path: `${OUT}/d-beforeafter.png` });
  await p.locator('.modal-foot').getByRole('button', { name: 'Godkänn ändring' }).click(); await wait(p, 900);

  // Urgent visit
  await p.locator('.dash').getByRole('button', { name: 'Akutbesök', exact: true }).click(); await wait(p, 500);
  await p.screenshot({ path: `${OUT}/d-urgent-form.png` });
  await p.getByRole('button', { name: 'Visa föreslagna team' }).click(); await wait(p, 1300);
  await p.screenshot({ path: `${OUT}/d-urgent.png` });
  await p.locator('.us-left').screenshot({ path: `${OUT}/e-urgent.png` });
  await p.locator('.modal-foot').getByRole('button', { name: /^Tilldela/ }).click(); await wait(p, 1500);
  await p.screenshot({ path: `${OUT}/d-after-urgent.png` });
  await p.locator('.rail-btn', { hasText: 'Dagen' }).click(); await wait(p, 800);
  await p.screenshot({ path: `${OUT}/d-report.png` });
  await p.evaluate(() => [...document.querySelectorAll('.demostrip .seg button')].find((b) => b.textContent.includes('Båda')).click());
  await wait(p, 1200);
  await p.locator('.phone-screen').screenshot({ path: `${OUT}/m-urgent-home.png` });
  // Anna signs Bosse's journal from the banner; coordinator sees status + billing basis
  const MP = p.locator('.phone .mapp');
  await MP.locator('.mbanner.journal').click(); await wait(p, 300);
  await MP.getByRole('button', { name: 'Börja diktera' }).click(); await wait(p, 600);
  await MP.getByRole('button', { name: 'Klar' }).click(); await wait(p, 1800);
  await MP.getByRole('button', { name: 'Lägg till', exact: true }).click();
  await MP.getByRole('button', { name: 'Signera journal' }).click();
  await MP.locator('.sheet').getByRole('button', { name: 'Signera' }).click(); await wait(p, 2200);
  await MP.getByRole('button', { name: 'Tillbaka' }).last().click();
  await p.locator('.dash .rail-btn', { hasText: 'Idag' }).click();
  await p.locator('.dash .vetfilter button', { hasText: 'Anna' }).click(); await wait(p, 300);
  await p.locator('.dash .stop', { hasText: 'Bosse' }).click(); await wait(p, 600);
  await p.locator('.dash .dr-scroll').evaluate((el) => el.scrollTo(0, 9999)); await wait(p, 400);
  await p.locator('.dash .drawer').screenshot({ path: `${OUT}/c-journal-drawer.png` });
  await p.locator('.dash .jr-coord').screenshot({ path: `${OUT}/e-jr-coord.png` });
  // Locked visit + System view
  await p.locator('.dash .drawer .panel-head .iconbtn').click();
  await p.locator('.dash .stop', { hasText: 'Sigge' }).click(); await wait(p, 500);
  await p.locator('.dash .drawer').screenshot({ path: `${OUT}/e-locked.png` });
  await p.locator('.dash .rail-btn', { hasText: 'System' }).click(); await wait(p, 600);
  await p.screenshot({ path: `${OUT}/d-system.png` });
  await p.close();
}

/* ——— Mobile (phone screen element, status bar included) ——— */
{
  const p = await b.newPage({ viewport: { width: 1200, height: 1040 }, deviceScaleFactor: 3 });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(URL + '#veterinar'); await wait(p);
  await shotOn(p);
  const S = p.locator('.phone-screen');
  const M = p.locator('.phone .mapp');
  await wait(p, 600);
  await S.screenshot({ path: `${OUT}/m-home.png` });

  await M.getByRole('button', { name: 'Detaljer' }).click(); await wait(p, 500);
  await M.locator('.checklist button').nth(0).click(); await M.locator('.checklist button').nth(1).click();
  await p.evaluate(() => { const b = document.querySelector('.phone .mbody'); const ac = [...b.querySelectorAll('.mcard')].find((c) => c.textContent.includes('Viktigt att veta')); const top = b.querySelector('.mtop').offsetHeight; b.scrollTo({ top: ac.offsetTop - top - 14, behavior: 'instant' }); });
  await wait(p, 500);
  await S.screenshot({ path: `${OUT}/m-detail.png` });
  await p.evaluate(() => document.querySelector('.phone .mbody').scrollTo({ top: 0, behavior: 'instant' }));
  await S.screenshot({ path: `${OUT}/m-detail-top.png` });
  await M.locator('.mtop .iconbtn').click(); await wait(p, 300);

  // on the way
  await M.getByRole('button', { name: 'Starta navigering' }).first().click(); await wait(p, 900);
  await S.screenshot({ path: `${OUT}/m-onway.png` });
  await M.getByRole('button', { name: 'Jag är framme' }).first().click();
  await M.getByRole('button', { name: 'Starta besök' }).first().click(); await wait(p, 400);
  await M.locator('.checklist button').nth(0).click(); await M.locator('.checklist button').nth(1).click();
  await M.locator('.tchips .chipbtn').nth(0).click(); await M.locator('.tchips .chipbtn').nth(2).click();
  // Journal by dictation
  await M.getByRole('button', { name: /Diktera journal/ }).click(); await wait(p, 500);
  await S.screenshot({ path: `${OUT}/m-jr-intro.png` });
  await M.getByRole('button', { name: 'Börja diktera' }).click(); await wait(p, 3000);
  await S.screenshot({ path: `${OUT}/m-jr-rec.png` });
  await M.getByRole('button', { name: 'Klar' }).click(); await wait(p, 1900);
  await S.screenshot({ path: `${OUT}/m-jr-draft-top.png` });
  await p.evaluate(() => { const b = document.querySelector('.phone .mbody'); const med = b.querySelector('.med.flagged') || b.querySelector('.med'); const card = med.closest('.mcard'); const top = b.querySelector('.mtop').offsetHeight; b.scrollTo({ top: card.offsetTop - top - 250, behavior: 'instant' }); });
  await wait(p, 400);
  await S.screenshot({ path: `${OUT}/m-jr-draft.png` });
  await M.getByRole('button', { name: 'Lägg till', exact: true }).click();
  await M.getByRole('button', { name: 'Signera journal' }).click(); await wait(p, 500);
  await M.locator('.sheet').getByRole('button', { name: 'Signera' }).click(); await wait(p, 2200);
  await S.screenshot({ path: `${OUT}/m-jr-signed.png` });
  await M.getByRole('button', { name: 'Tillbaka' }).last().click(); await wait(p, 400);
  await S.screenshot({ path: `${OUT}/m-invisit.png` });
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click(); await wait(p, 500);
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await wait(p, 2700);

  // Luna runs late
  for (const n of ['Starta navigering', 'Jag är framme', 'Starta besök']) { await M.getByRole('button', { name: n }).first().click(); await wait(p, 250); }
  await M.getByRole('button', { name: 'Förläng' }).click();
  await M.getByRole('button', { name: '+25 min' }).click(); await wait(p, 1100);
  await S.screenshot({ path: `${OUT}/m-delay.png` });
  await M.getByRole('button', { name: 'Se optimerad rutt' }).click(); await wait(p, 1200);
  await S.screenshot({ path: `${OUT}/m-proposal.png` });
  await p.close();
}
console.log('ERRORS', errs);
await b.close();
