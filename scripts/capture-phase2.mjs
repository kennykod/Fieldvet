// Phase 2 pitch screenshots, taken while playing the guided demo story (deterministic from 09:45).
import { launch, APP } from '../tests/_env.mjs';
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await launch();
const errs = [];
const p = await b.newPage({ viewport: { width: 1600, height: 1080 }, deviceScaleFactor: 3 });
p.on('pageerror', (e) => errs.push(e.message));
const w = (ms = 600) => p.waitForTimeout(ms);
await p.goto(APP + '#samordnare'); await w(700);
await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Guidad demo/ }).first().click(); await w(700);
// Hide demo chrome (strip, toasts, story panel, spotlight) in the pictures.
await p.addStyleTag({ content: 'body.shot .story, body.shot .story-mini { display: none !important; } body.shot .demo-spot { outline: none !important; animation: none !important; }' });
const G = p.locator('.story');
const D = p.locator('.dash');
const PH = p.locator('.phone-screen');
const shot = async (fn) => { await p.evaluate(() => document.body.classList.add('shot')); await w(350); await fn(); await p.evaluate(() => document.body.classList.remove('shot')); };
const doStep = async () => { const d = G.locator('.story-foot .btn.soft'); if (await d.count()) { await d.click(); await w(1000); } };
const next = async () => { for (let k = 0; k < 20 && await G.locator('.story-foot .btn.primary').isDisabled(); k++) await w(250); await G.locator('.story-foot .btn.primary').click(); await w(500); };

// 1 overrun, 2 risk
await doStep(); await next();
await shot(async () => {
  await D.locator('.side-sec').first().screenshot({ path: `${OUT}/e-queue.png` });
  await D.locator('.daystats.ops').screenshot({ path: `${OUT}/e-summary.png` });
});
await next();
// 3 urgent arrives
await doStep(); await next();
// 4 open urgent → suggestions
await doStep();
await shot(async () => {
  await p.locator('.modal.urgent .us-left').screenshot({ path: `${OUT}/e-urgent2.png` });
  await p.locator('.modal.urgent').screenshot({ path: `${OUT}/d-urgent2.png` });
});
await next();
// 5 assign
await doStep(); await next();
// 6 receiving phone before confirming
await w(600);
await shot(async () => { await PH.screenshot({ path: `${OUT}/m-ack.png` }); });
await doStep(); await next();
// 7 new ETA for Milo's owner, then customer view
const st7 = ['[data-demo="risk-summary"]', '[data-demo="keep-plan"]', '[data-demo="send-eta"]'];
for (const s of st7) { await p.locator(s).first().click(); await w(700); }
await shot(async () => {
  await D.locator('.drawer').screenshot({ path: `${OUT}/e-eta-drawer.png` });
  await D.locator('.drawer .dr-eta').screenshot({ path: `${OUT}/e-eta-row.png` });
});
await p.locator('[data-demo="customer-view"]').first().click(); await w(700);
await shot(async () => {
  await p.locator('.modal.customer').screenshot({ path: `${OUT}/c-customer.png` });
  await p.locator('.modal.customer .cust-phone').screenshot({ path: `${OUT}/c-customer-phone.png` });
});
await next();
// 8 later: vet at Tessan hands off to the clinic
await w(900);
await p.locator('[data-demo="m-continue"]').click(); await w(600);
await shot(async () => { await PH.screenshot({ path: `${OUT}/m-invisit2.png` }); });
await p.locator('[data-demo="m-handoff"]').click(); await w(700);
await shot(async () => { await PH.screenshot({ path: `${OUT}/m-handoff.png` }); });
await p.locator('[data-demo="handoff-send"]').click(); await w(1600);
await shot(async () => { await PH.screenshot({ path: `${OUT}/m-handoff-sent.png` }); });
await next();
// 9 coordinator confirms the clinic slot
await p.locator('button.bell').click(); await w(400);
await p.locator('.popover .alert[data-kind="handoff"] button').click(); await w(700);
await shot(async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-handoff.png` }); });
await p.locator('[data-demo="handoff-confirm"]').click(); await w(1800);
await shot(async () => {
  await D.locator('.drawer').screenshot({ path: `${OUT}/e-handoff-drawer.png` });
  await PH.screenshot({ path: `${OUT}/m-clinic.png` });
});
await D.locator('.drawer .dr-scroll').evaluate((el) => el.scrollTo(0, 0));
const tl = D.locator('.drawer .vtl').locator('xpath=..');
await tl.scrollIntoViewIfNeeded();
await shot(async () => { await tl.screenshot({ path: `${OUT}/e-timeline.png` }); });
// Full dashboard at the end of the story (coordinator view).
await p.locator('.demostrip .seg button', { hasText: 'Samordnare' }).click(); await w(900);
await shot(async () => { await p.screenshot({ path: `${OUT}/d-story-end.png` }); });
console.log('errors', errs);
await b.close();
