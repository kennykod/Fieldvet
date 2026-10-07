// End-to-end click-through of the five demo flows in "Båda samtidigt" mode.
import { launch, APP, finish } from './_env.mjs';
const OUT = process.env.OUT || '/tmp/flow';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1680, height: 940 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(APP + '#bada');
await p.waitForTimeout(600);
const D = p.locator('.dash');
const M = p.locator('.phone .mapp');
let n = 0;
const shot = async (name) => { await p.waitForTimeout(750); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` }); };
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); await shot('FAIL-' + label); } };

// Flow 1 — normal morning
await shot('start');
await step('f1-anna', async () => { D.locator('[data-vetrow="anna"] .bhead').click(); await shot('f1-anna'); });
await step('f1-visit', async () => { await D.locator('.stop', { hasText: 'Luna' }).click(); await shot('f1-drawer'); });
await step('f1-back', async () => { await D.locator('.drawer .panel-head .iconbtn').click(); await p.keyboard.press('Escape'); });

// Flow 2 — vet starts the day
await step('f2', async () => {
  await M.getByRole('button', { name: 'Starta navigering' }).first().click(); await shot('f2-onway');
  await M.getByRole('button', { name: 'Jag är framme' }).first().click(); await shot('f2-arrived');
  await M.getByRole('button', { name: 'Starta besök' }).first().click(); await shot('f2-invisit');
  await M.locator('.m-more').click(); await M.locator('.checklist button').first().click();
  await M.locator('.tchips .chipbtn').first().click();
  await M.locator('.tchips .chipbtn').nth(1).click();
  await M.locator('.mcta').getByRole('button', { name: 'Avsluta besök' }).click(); await shot('f2-finish-sheet');
  await M.locator('.sheet').getByRole('button', { name: 'Avsluta besök' }).click(); await shot('f2-celebrate');
  await M.getByRole('button', { name: 'Nästa besök', exact: true }).click();
  await p.waitForTimeout(2400); await shot('f2-next');
});

// Flow 3 — visit runs late
await step('f3', async () => {
  await M.getByRole('button', { name: 'Starta navigering' }).first().click();
  await M.getByRole('button', { name: 'Jag är framme' }).first().click();
  await M.getByRole('button', { name: 'Starta besök' }).first().click();
  await M.getByRole('button', { name: 'Förläng' }).click();
  await M.getByRole('button', { name: '+25 min' }).click(); await shot('f3-delay-sheet');
  await M.getByRole('button', { name: 'Se förslag' }).click(); await shot('f3-vet-proposal');
  await M.getByRole('button', { name: 'Skicka till samordnaren' }).click(); await shot('f3-sent');
  await D.locator('.alert', { hasText: 'föreslår en ny rutt' }).getByRole('button').click(); await shot('f3-coord-fix');
  await D.locator('.panel-foot').getByRole('button', { name: 'Godkänn', exact: true }).click(); await shot('f3-approved');
  await M.locator('.mtop .iconbtn').click().catch(() => {});
  await M.locator('.mtabs button', { hasText: 'Rutt' }).click().catch(() => {}); await shot('f3-vet-route');
});

// Flow 4 — urgent visit
await step('f4', async () => {
  await D.getByRole('button', { name: 'Nytt akutärende' }).click(); await shot('f4-form');
  // A customer calls: the form starts empty and the address is typed in by hand.
  expect(await p.locator('#u-street').inputValue() === '', 'new urgent form starts empty');
  await p.getByRole('button', { name: 'Hitta veterinär' }).click();
  expect((await p.locator('.foot-miss').innerText()).includes('adress'), 'missing address explained');
  await p.locator('#u-name').fill('Pixel'); await p.locator('#u-owner').fill('Sara Lind'); await p.locator('#u-phone').fill('070-111 22 33');
  await p.locator('#u-street').fill('Hantverkargatan 12'); await p.locator('#u-place').fill('Stockholm');
  await p.locator('#u-reason').fill('Haltar kraftigt'); await p.locator('#u-kind').selectOption('hälta');
  await p.locator('#u-access').click();
  expect((await p.locator('.addr-hit').innerText()).includes('Hittar inte'), 'unknown area asks for a district');
  await p.locator('#u-place').fill('112 21 Stockholm');
  expect((await p.locator('.addr-hit').innerText()).includes('Kungsholmen'), 'postcode places the address');
  await p.locator('#u-street').fill('Ringv');
  await p.locator('.addr-sugg button', { hasText: 'Ringvägen 120' }).click();
  expect((await p.locator('#u-place').inputValue()).includes('Södermalm'), 'known address fills postcode and area');
  await p.locator('#u-street').fill('Hantverkargatan 12'); await p.locator('#u-place').fill('112 21 Stockholm');
  await p.getByRole('button', { name: 'Hitta veterinär' }).click(); await shot('f4-suggest');
  expect((await p.locator('.us-case').innerText()).includes('Hantverkargatan 12, Kungsholmen'), 'typed address used');
  await p.locator('.modal-foot').getByRole('button', { name: /^Tilldela/ }).click(); await shot('f4-assigned');
  await M.locator('.mtabs button', { hasText: 'Idag' }).click(); await shot('f4-vet-today');
  expect(await D.locator('.b-visit', { hasText: 'Pixel' }).count() === 1, 'typed-in urgent visit is on the timeline');
});

// Flow 5 — cancellation
await step('f5', async () => {
  await p.locator('.demo-toggle').click();
  await p.getByRole('menuitem', { name: 'En kund avbokar' }).click(); await shot('f5-cancelled');
  await p.keyboard.press('Escape');
  await D.locator('.alert', { hasText: 'avbokad' }).first().getByRole('button').click(); await shot('f5-proposal');
  const approve = p.locator('.modal-foot').getByRole('button', { name: 'Godkänn ändring' });
  if (await approve.count()) await approve.click(); else await p.locator('.modal-foot').getByRole('button', { name: 'Stäng' }).click();
  await shot('f5-approved');
  await M.locator('.mtabs button', { hasText: 'Rutt' }).click(); await shot('f5-vet-route');
});

// Drag-reassign on timeline
await step('drag', async () => {
  const blk = D.locator('[data-vetrow="johan"] .b-visit.st-kommande').first();
  const box = await blk.boundingBox();
  const target = await D.locator('[data-vetrow="erik"] .btrack').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + 30, target.y + 20, { steps: 8 });
  await p.mouse.move(box.x + 40, target.y + target.height / 2, { steps: 4 });
  await shot('drag-hover');
  expect(/Till Erik|Går inte/.test(await D.locator('.b-drophint').innerText()), 'impact shown before the drop');
  await p.mouse.up(); await shot('drag-impact');
});

// Secondary views
await step('views', async () => {
  await D.locator('.rail-btn', { hasText: 'Besök' }).click(); await shot('view-list');
  await D.locator('.rail-btn', { hasText: 'Meddelanden' }).click(); await shot('view-msg');
  await D.locator('.rail-btn', { hasText: 'Rapport' }).click(); await shot('view-report');
  await D.locator('.rail-btn', { hasText: 'Idag' }).click();
});
await b.close();
finish('flows', errs);
