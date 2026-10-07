// Screenshots for the pitch and the onboarding guide, after the clarity pass.
import { launch, APP } from '../tests/_env.mjs';
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await launch();
const errs = [];
const page = async (vw, vh, dsf, hash) => {
  const p = await b.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(APP + hash); await p.waitForTimeout(800);
  await p.addStyleTag({ content: 'body.shot .story, body.shot .story-mini { display: none !important; } body.shot .demo-spot { outline: none !important; animation: none !important; }' });
  return p;
};
const shotOn = (p) => p.evaluate(() => document.body.classList.add('shot'));
const shotOff = (p) => p.evaluate(() => document.body.classList.remove('shot'));
/** Panel shots at a shorter window, so side panels are not stretched to the full height. */
const short = async (p, fn, h = 700) => { const vs = p.viewportSize(); await p.setViewportSize({ width: vs.width, height: h }); await p.waitForTimeout(300); await fn(); await p.setViewportSize(vs); await p.waitForTimeout(300); };
const clean = async (p, fn) => { await shotOn(p); await p.waitForTimeout(350); await fn(); await shotOff(p); };

/* ——— A: coordinator at the start of the day ——— */
{
  const p = await page(1440, 940, 2, '#samordnare');
  const D = p.locator('.dash');
  await clean(p, async () => {
    await p.screenshot({ path: `${OUT}/d-idag.png` });
    await D.locator('.topbar').screenshot({ path: `${OUT}/e-topbar.png` });
    await D.locator('.side').screenshot({ path: `${OUT}/e-side.png` });
    await D.locator('.side-sec.attention').screenshot({ path: `${OUT}/e-attention.png` });
    await D.locator('.board').screenshot({ path: `${OUT}/e-board.png` });
    await D.locator('.nexthour').screenshot({ path: `${OUT}/e-nexthour.png` });
  });
  await D.getByRole('button', { name: 'Mer', exact: true }).first().click(); await p.waitForTimeout(250);
  await clean(p, async () => { await D.locator('.tb-right').screenshot({ path: `${OUT}/e-mer.png` }); });
  await p.keyboard.press('Escape'); await D.getByRole('button', { name: 'Mer', exact: true }).first().click();
  await D.locator('.vetmark', { has: p.locator('text=JB') }).first().click({ force: true }); await p.waitForTimeout(500);
  await clean(p, async () => { await D.locator('.mapwrap').screenshot({ path: `${OUT}/e-teamcard-map.png` }); await D.locator('.teamcard').screenshot({ path: `${OUT}/e-teamcard.png` }); });
  await D.locator('.teamcard').getByRole('button', { name: 'Stäng teamkortet' }).click();
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // Sigge: locked time lives under "Mer"
  await D.getByRole('radio', { name: 'Hela dagen' }).click(); await D.locator('.b-visit', { hasText: 'Sigge' }).click(); await p.waitForTimeout(500);
  await D.locator('.panel-foot').getByRole('button', { name: 'Mer' }).click(); await p.waitForTimeout(250);
  await short(p, () => clean(p, async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-locked.png` }); }));
  await D.locator('.panel-foot').getByRole('button', { name: 'Mer' }).click();
  await D.locator('.drawer .panel-head .iconbtn').click(); await p.waitForTimeout(300);
  await D.getByRole('radio', { name: 'Från nu' }).click();
  // New urgent case from reception
  await D.locator('.alert[data-kind="urgent"] button').click(); await p.waitForTimeout(500);
  await clean(p, async () => { await p.locator('.modal.urgent').screenshot({ path: `${OUT}/e-urgent-form.png` }); });
  await p.getByRole('button', { name: 'Hitta veterinär' }).click(); await p.waitForTimeout(900);
  await clean(p, async () => { await p.locator('.modal.urgent').screenshot({ path: `${OUT}/d-urgent2.png` }); await p.locator('.modal.urgent .us-left').screenshot({ path: `${OUT}/e-urgent-one.png` }); });
  await p.locator('[data-demo="other-teams"]').click(); await p.waitForTimeout(300);
  await clean(p, async () => { await p.locator('.modal.urgent .us-left').screenshot({ path: `${OUT}/e-urgent2.png` }); });
  await p.locator('[data-demo="assign-urgent"]').click(); await p.waitForTimeout(700);
  await p.locator('.toast.has-action').first().screenshot({ path: `${OUT}/e-toast-urgent.png` });
  await p.waitForTimeout(400);
  await clean(p, async () => { await p.screenshot({ path: `${OUT}/d-after-urgent.png` }); });
  await D.getByRole('button', { name: 'Mer', exact: true }).first().click(); await p.getByRole('menuitem', { name: /Visa ändringar/ }).click(); await p.waitForTimeout(400);
  await short(p, () => clean(p, async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-history.png` }); }));
  await p.locator('.dash .rail-btn', { hasText: 'Rapport' }).click(); await p.waitForTimeout(700);
  await clean(p, async () => { await p.screenshot({ path: `${OUT}/d-report.png` }); });
  await p.close();
}

/* ——— B: coordinator resolves a delay (deterministic story state) ——— */
{
  const p = await page(1440, 940, 2, '#samordnare');
  const D = p.locator('.dash');
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Guidad demo/ }).first().click(); await p.waitForTimeout(700);
  await p.locator('.story .story-foot .btn.soft').click(); await p.waitForTimeout(900);
  await p.locator('.story-head button[aria-label="Avsluta demoberättelsen"]').click();
  await p.locator('.demostrip .seg button', { hasText: 'Samordnare' }).click(); await p.waitForTimeout(900);
  await clean(p, async () => {
    await p.screenshot({ path: `${OUT}/d-risk.png` });
    await D.locator('.side-sec.attention').screenshot({ path: `${OUT}/e-queue.png` });
    await D.locator('.topbar .tb-title').screenshot({ path: `${OUT}/e-daysum-risk.png` });
    await D.locator('[data-vetrow="anna"]').screenshot({ path: `${OUT}/e-row-late.png` });
    await D.locator('.board').screenshot({ path: `${OUT}/e-board-risk.png` });
  });
  await D.locator('.alert', { hasText: 'Milo' }).first().getByRole('button').click(); await p.waitForTimeout(1200);
  await clean(p, async () => { await p.screenshot({ path: `${OUT}/d-delay.png` }); });
  await short(p, () => clean(p, async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-fix.png` }); }));
  await p.locator('[data-demo="alts"]').click(); await p.waitForTimeout(400);
  await short(p, () => clean(p, async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-fix-alts.png` }); }));
  await p.locator('[data-demo="alts"]').click();
  await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).click(); await p.waitForTimeout(600);
  await p.locator('.toast.has-action').first().screenshot({ path: `${OUT}/e-toast.png` });
  await clean(p, async () => { await p.screenshot({ path: `${OUT}/d-after-fix.png` }); });
  await p.close();
}

/* ——— C: the vet's day on the phone ——— */
{
  const p = await page(1200, 1040, 3, '#veterinar');
  const M = p.locator('.phone .mapp'); const S = p.locator('.phone-screen');
  const s = async (n) => { await shotOn(p); await p.waitForTimeout(400); await S.screenshot({ path: `${OUT}/${n}.png` }); await shotOff(p); };
  await s('m-home');
  await M.locator('.nc-patient').click(); await p.waitForTimeout(400); await s('m-detail-top');
  await M.locator('.mtop .iconbtn').click(); await p.waitForTimeout(300);
  await M.locator('[data-demo="m-nav"]').click(); await p.waitForTimeout(4500); await s('m-onway');
  await M.locator('[data-demo="m-arrive"]').click(); await p.waitForTimeout(400); await s('m-arrived');
  await M.locator('[data-demo="m-start"]').click(); await p.waitForTimeout(500); await s('m-invisit');
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(500); await s('m-finish');
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await p.waitForTimeout(800); await s('m-after');
  await M.getByRole('button', { name: 'Nästa besök', exact: true }).click(); await p.waitForTimeout(500); await s('m-next');
  await M.locator('[data-demo="m-nav"]').click(); await M.locator('[data-demo="m-arrive"]').click(); await M.locator('[data-demo="m-start"]').click(); await p.waitForTimeout(400);
  await M.getByRole('button', { name: 'Förläng' }).click(); await M.getByRole('button', { name: '+25 min' }).click(); await p.waitForTimeout(1200); await s('m-delay');
  await M.getByRole('button', { name: 'Fortsätt enligt plan' }).click(); await p.waitForTimeout(4500);
  await M.locator('[data-demo="m-handoff"]').click(); await p.waitForTimeout(600); await s('m-handoff');
  await M.locator('.sheet-back').click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(300);
  await M.locator('.mtop .iconbtn').click(); await p.waitForTimeout(400);
  await M.locator('.me-btn').click(); await p.waitForTimeout(500); await s('m-profile');
  await p.close();
}

/* ——— D: the full chain via the guided story (urgent, customer ETA, clinic) ——— */
{
  const p = await page(1600, 1080, 3, '#samordnare');
  const D = p.locator('.dash'); const PH = p.locator('.phone-screen'); const G = p.locator('.story');
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Guidad demo/ }).first().click(); await p.waitForTimeout(700);
  const doStep = async () => { const d = G.locator('.story-foot .btn.soft'); if (await d.count()) { await d.click(); await p.waitForTimeout(1100); } };
  const next = async () => { for (let k = 0; k < 24 && await G.locator('.story-foot .btn.primary').isDisabled(); k++) await p.waitForTimeout(250); await G.locator('.story-foot .btn.primary').click(); await p.waitForTimeout(500); };
  await doStep(); await next(); await next(); await doStep(); await next();
  await doStep(); await next(); // suggestions open → step 5
  await doStep(); await next(); // assigned
  await p.waitForTimeout(600);
  await clean(p, async () => { await PH.screenshot({ path: `${OUT}/m-ack.png` }); });
  await doStep(); await next();
  // step 7: keep plan, send ETA, customer view
  for (const sel of ['.side .alert[data-kind="risk"] button', '[data-demo="alts"]', '[data-demo="keep-plan"]', '[data-demo="send-eta"]']) { await p.locator(sel).first().click(); await p.waitForTimeout(700); }
  await p.waitForTimeout(900);
  await clean(p, async () => { await D.locator('.drawer .dr-eta').screenshot({ path: `${OUT}/e-eta-row.png` }); });
  await p.locator('[data-demo="customer-view"]').first().click(); await p.waitForTimeout(700);
  await clean(p, async () => { await p.locator('.modal.customer').screenshot({ path: `${OUT}/c-customer.png` }); await p.locator('.modal.customer .cust-phone').screenshot({ path: `${OUT}/c-customer-phone.png` }); });
  await next(); await p.waitForTimeout(900);
  await p.locator('[data-demo="m-continue"]').click(); await p.waitForTimeout(600);
  await p.locator('[data-demo="m-handoff"]').click(); await p.waitForTimeout(700);
  await clean(p, async () => { await PH.screenshot({ path: `${OUT}/m-handoff-tessan.png` }); });
  await p.locator('[data-demo="handoff-send"]').click(); await p.waitForTimeout(1600);
  await next();
  await p.locator('.side .panel-head button[aria-label="Tillbaka"]').first().click().catch(() => {}); await p.waitForTimeout(400);
  await clean(p, async () => { await D.locator('.side-sec.attention').screenshot({ path: `${OUT}/e-attention-handoff.png` }); });
  await p.locator('.side .alert[data-kind="handoff"] button').click(); await p.waitForTimeout(700);
  await short(p, () => clean(p, async () => { await D.locator('.side .panel').screenshot({ path: `${OUT}/e-handoff.png` }); }), 820);
  await p.locator('[data-demo="handoff-confirm"]').click(); await p.waitForTimeout(1800);
  await D.locator('.dr-history').click(); await p.waitForTimeout(300);
  await clean(p, async () => {
    await PH.screenshot({ path: `${OUT}/m-clinic.png` });
    await D.locator('.drawer').screenshot({ path: `${OUT}/e-handoff-drawer.png` });
    const tl = D.locator('.drawer .vtl').locator('xpath=..');
    await tl.scrollIntoViewIfNeeded(); await tl.screenshot({ path: `${OUT}/e-timeline.png` });
  });
  await p.close();
}
console.log('errors', errs);
await b.close();
