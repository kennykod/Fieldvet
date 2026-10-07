// Screenshots of the urgent form with a typed-in address (onboarding guide).
import { launch, APP } from '../tests/_env.mjs';
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto(APP + '#samordnare'); await p.waitForTimeout(800);
await p.addStyleTag({ content: '.toasts { display: none !important; }' });
await p.locator('.dash').getByRole('button', { name: 'Nytt akutärende' }).click(); await p.waitForTimeout(300);
await p.locator('#u-name').fill('Pixel'); await p.locator('#u-owner').fill('Sara Lind'); await p.locator('#u-phone').fill('070-111 22 33');
await p.locator('#u-street').fill('Hantverkargatan 12'); await p.locator('#u-place').fill('112 21 Stockholm'); await p.locator('#u-access').fill('Portkod 1942, 3 tr');
await p.locator('#u-reason').fill('Haltar kraftigt på höger framben sedan i morse'); await p.locator('#u-kind').selectOption('hälta');
await p.locator('#u-reason').blur(); await p.waitForTimeout(300);
await p.locator('.modal.urgent').screenshot({ path: `${OUT}/e-urgent-form.png` });
await p.locator('#u-street').fill('Ringv'); await p.waitForTimeout(300);
const box = await p.locator('.addr').boundingBox(); const m = await p.locator('.modal.urgent').boundingBox();
await p.screenshot({ path: `${OUT}/e-urgent-addr.png`, clip: { x: m.x, y: box.y - 30, width: m.width, height: 150 } });
await b.close(); console.log('ok');
