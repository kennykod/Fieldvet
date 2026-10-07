// Import screenshots for the pitch.
import { launch, APP } from '../tests/_env.mjs';
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
await p.goto(APP + '#samordnare'); await p.waitForTimeout(700);
await p.evaluate(() => document.body.classList.add('shot')); await p.waitForTimeout(300);
await p.locator('.dash').getByRole('button', { name: 'Mer', exact: true }).click(); await p.getByRole('menuitem', { name: /Importera/ }).click(); await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Använd exempelfil' }).click(); await p.waitForTimeout(200);
await p.locator('.modal.import').screenshot({ path: `${OUT}/e-import-map.png` });
await p.getByRole('button', { name: /Kontrollera/ }).click(); await p.waitForTimeout(400);
await p.locator('.modal.import').screenshot({ path: `${OUT}/e-import-check.png` });
await p.getByLabel('Välj stadsdel för Pixel').selectOption('Solna'); await p.waitForTimeout(200);
await p.getByRole('button', { name: /Planera och godkänn/ }).click(); await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelectorAll('.toast, .toasts').forEach((t) => t.remove()));
await p.screenshot({ path: `${OUT}/d-import-done.png` });
await b.close();
console.log('ok');
