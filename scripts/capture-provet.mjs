// Screenshots for the Provet integration (pitch + onboarding): communication states, history, duplicates, failures.
import { launch, APP } from '../tests/_env.mjs';
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1080 }, deviceScaleFactor: 3 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(APP + '#bada'); await p.waitForTimeout(900);
await p.addStyleTag({ content: 'body.shot .story, body.shot .story-mini { display: none !important; } body.shot .demo-spot { outline: none !important; animation: none !important; }' });
const D = p.locator('.dash'); const M = p.locator('.phone .mapp'); const PH = p.locator('.phone-screen');
const on = () => p.evaluate(() => document.body.classList.add('shot'));
const off = () => p.evaluate(() => document.body.classList.remove('shot'));
const hideToasts = () => p.evaluate(() => document.querySelectorAll('.toasts').forEach((t) => { t.style.visibility = 'hidden'; }));
const showToasts = () => p.evaluate(() => document.querySelectorAll('.toasts').forEach((t) => { t.style.visibility = ''; }));
const phone = async (n) => { await p.evaluate(() => document.querySelectorAll('.phone .mbody').forEach((e) => { e.style.scrollBehavior = 'auto'; e.scrollTop = 0; })); await on(); await hideToasts(); await p.waitForTimeout(350); await PH.screenshot({ path: `${OUT}/${n}.png` }); await showToasts(); await off(); };
const el = async (loc, n) => { await on(); await hideToasts(); await p.waitForTimeout(300); await loc.screenshot({ path: `${OUT}/${n}.png` }); await showToasts(); await off(); };
const demo = async (name) => { await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name }).click(); await p.waitForTimeout(300); };
const drawer = async (name) => { await D.locator('.b-visit', { hasText: name }).first().click(); await p.waitForTimeout(500); };
const closeDrawer = async () => { await D.locator('.drawer .panel-head .iconbtn').click(); await p.waitForTimeout(300); };

// 1. Starta navigering → På väg → Provet informerar ägaren
await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(150); await phone('m-sending');
await p.waitForTimeout(1000); await phone('m-informed');
await el(D.locator('[data-vetrow="anna"]'), 'e-vc-comm');
await drawer('Bos'); await el(D.locator('.drawer .dr-eta'), 'e-dr-eta-sent'); await closeDrawer();

// 2. Visa historik
await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(120); await phone('m-history-loading');
await p.waitForTimeout(900); await phone('m-history');
await M.getByRole('button', { name: 'Visa hela anteckningen' }).first().click(); await p.waitForTimeout(700); await phone('m-history-note');
await M.locator('[data-demo="history-back"]').click(); await p.waitForTimeout(300);

// 3. Köer: ny tid en gång
await demo(/Köer på Annas väg/); await p.waitForTimeout(1300); await phone('m-updated');
await el(D.locator('[data-vetrow="anna"]'), 'e-vc-comm-updated');
await el(D.locator('[data-vetrow="anna"] .b-chip.comm'), 'e-row-comm');
await el(D.locator('[data-vetrow="anna"] .bline'), 'e-row-line');
await drawer('Bos'); await el(D.locator('.drawer .dr-eta'), 'e-dr-eta-updated');
await D.locator('[data-demo="customer-view"]').click(); await p.waitForTimeout(600);
await el(p.locator('.modal.customer'), 'c-customer-provet');
await el(p.locator('.modal.customer .cust-phone'), 'c-customer-phone-bosse');
await p.locator('.modal.customer .modal-head button[aria-label="Stäng"]').click(); await closeDrawer();

// 4. Samma händelse igen: ingen dubblett
await demo(/skickar samma händelse igen/); await p.waitForTimeout(500);
await p.locator('.toast').last().screenshot({ path: `${OUT}/e-toast-dup.png` });
await D.locator('.rail-btn', { hasText: 'System' }).click(); await p.waitForTimeout(500);
await el(D.locator('.rep-card', { has: p.locator('.provet-sync') }), 'e-provet-sync');
await el(D.locator('.rep-card').first(), 'e-provet-adapters');
await D.locator('.rail-btn', { hasText: 'Idag' }).click(); await p.waitForTimeout(400);

// 5. Provet svarar inte: veterinären fortsätter, samordnaren får ärendet
for (const x of ['m-arrive', 'm-start']) { await M.locator(`[data-demo="${x}"]`).click(); await p.waitForTimeout(200); }
await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click();
await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(500);
await M.getByRole('button', { name: 'Nästa besök', exact: true }).click(); await p.waitForTimeout(300);
await demo('Provet slutar svara');
await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(1300); await phone('m-failed');
await el(D.locator('.side-sec.attention'), 'e-attention-comm');
await drawer('Luna'); await el(D.locator('.drawer .dr-eta'), 'e-dr-eta-failed'); await closeDrawer();
await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(1000); await phone('m-history-down');
await M.locator('[data-demo="history-back"]').click();
await demo('Provet svarar igen'); await p.waitForTimeout(1300);

// 6. Ägaren tar inte emot sms enligt Provet (Sigge)
for (let i = 0; i < 7; i++) {
  if (/Sigge/.test(await M.locator('.nextcard').innerText()) && /Starta navigering/.test(await M.locator('.mcta').innerText())) break;
  for (const x of ['m-nav', 'm-arrive', 'm-start']) { const bt = M.locator(`[data-demo="${x}"]`); if (await bt.count()) { await bt.click(); await p.waitForTimeout(250); } }
  const fin = M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' });
  if (await fin.count()) { await fin.click(); await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(400); }
  const nx = M.getByRole('button', { name: 'Nästa besök', exact: true }); if (await nx.count()) { await nx.click(); await p.waitForTimeout(300); }
}
await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(1000); await phone('m-nosms');
await el(D.locator('.side-sec.attention'), 'e-attention-nosms');
await drawer('Sig'); await el(D.locator('.drawer .dr-eta'), 'e-dr-eta-blocked'); await closeDrawer();

// 7. Offline: sparad sammanfattning
await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(1000); await M.locator('[data-demo="history-back"]').click();
await demo('Anna tappar täckning');
await M.locator('[data-demo="m-history"]').first().click(); await p.waitForTimeout(500); await phone('m-history-offline');
await b.close();
console.log(errs.length ? errs.join('\n') : 'ok');
