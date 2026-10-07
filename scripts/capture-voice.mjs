import { createRequire } from 'module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
const OUT = '/home/claude/fieldvet/pitch/shots';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1500, height: 1040 }, deviceScaleFactor: 3 });
// Stand-in for the viewer's AI runtime so screenshots are reproducible; answers are built from the same tool data.
await p.addInitScript(() => {
  const sample = async (input, opts) => {
    const q = input[input.length - 1].content;
    const tools = Object.fromEntries((opts.tools || []).map((t) => [t.name, t]));
    let text;
    if (/säg till/i.test(q)) { const n0 = await tools.get_next_visit.execute({}, {}); await tools.draft_message_to_coordinator.execute({ text: `Jag är ca 10 minuter sen till ${n0.patient}.` }, {}); text = 'Jag har gjort ett utkast till Maria. Tryck Skicka om det stämmer.'; }
    else { const n = await tools.get_next_visit.execute({}, {}); text = `Till ${n.patient} på ${n.address.split(',')[0]} tar det ${n.drive_minutes} minuter. Åk senast ${n.leave_by}, så är du framme ${n.eta}.`; }
    opts.onText?.({ text, delta: text });
    return { text, truncated: false };
  };
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
});
await p.goto('file:///home/claude/fieldvet/dist/fieldvet.local.html?intro=0#bada'); await p.waitForTimeout(800);
await p.evaluate(() => document.body.classList.add('shot'));
const M = p.locator('.phone .mapp'); const S = p.locator('.phone-screen'); const D = p.locator('.dash');
const w = (ms = 700) => p.waitForTimeout(ms);
await M.getByRole('button', { name: 'Fråga FieldVet' }).click(); await w();
await M.getByRole('button', { name: 'Håll inne och prata' }).click(); await w();
await S.screenshot({ path: `${OUT}/v-listen.png` });
await M.getByRole('button', { name: /Hur lång tid tar det till nästa kund/ }).click(); await w(900);
await M.getByRole('button', { name: 'Håll inne och prata' }).click();
await M.getByRole('button', { name: /Säg till Maria/ }).click(); await w(900);
await S.screenshot({ path: `${OUT}/v-answer.png` });
await M.locator('.mtop .iconbtn').first().click(); await w(300);
await M.locator('.mtabs button', { hasText: 'Inkorg' }).click(); await w();
await M.getByRole('button', { name: 'Spela in röstmeddelande' }).click(); await w(2600);
await S.screenshot({ path: `${OUT}/v-record.png` });
await M.getByRole('button', { name: 'Klar' }).click(); await M.getByRole('button', { name: 'Skicka röstmeddelande' }).click(); await w(500);
await D.locator('.alert', { hasText: 'Röstmeddelande' }).getByRole('button').click(); await w(800);
await D.locator('.chat .bubble.voice').screenshot({ path: `${OUT}/v-coord-bubble.png` });
await D.locator('.chat').screenshot({ path: `${OUT}/v-coord-chat.png` });
await b.close();
console.log('ok');
