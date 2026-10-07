import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/voice'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const errs = [];
const expect = (c, m) => { if (!c) errs.push('EXPECT ' + m); };

async function run(withAI) {
  const p = await b.newPage({ viewport: { width: 1680, height: 940 } });
  p.on('pageerror', (e) => errs.push(e.message));
  if (withAI) {
    // Fake viewer runtime: behaves like `sample` with tools (calls the page's tools, then answers).
    await p.addInitScript(() => {
      window.__calls = [];
      const sample = async (input, opts) => {
        const q = input[input.length - 1].content;
        const tools = Object.fromEntries((opts.tools || []).map((t) => [t.name, t]));
        let text;
        if (/säg till/i.test(q)) { await tools.draft_message_to_coordinator.execute({ text: 'Jag är ca 10 minuter sen till nästa besök.' }, {}); window.__calls.push('draft'); text = 'Jag har gjort ett utkast till Maria. Tryck Skicka om det stämmer.'; }
        else { const n = await tools.get_next_visit.execute({}, {}); window.__calls.push('next'); text = `Till ${n.patient} tar det ${n.drive_minutes} minuter. Du är framme ${n.eta}.`; }
        opts.onText?.({ text, delta: text });
        return { text, truncated: false, modelTierApplied: 'quick' };
      };
      window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
    });
  }
  await p.goto(APP + '#bada'); await p.waitForTimeout(800);
  return p;
}

// —— Voice message + assistant (fallback, no AI) ——
{
  const p = await run(false);
  const D = p.locator('.dash'); const M = p.locator('.phone .mapp');
  let n = 0; const shot = async (x) => { await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/a${String(++n).padStart(2, '0')}-${x}.png` }); };
  try {
    await M.locator('.mtabs button', { hasText: 'Inkorg' }).click();
    await M.getByRole('button', { name: 'Spela in röstmeddelande' }).click(); await p.waitForTimeout(1500); await shot('recording');
    await M.getByRole('button', { name: 'Klar' }).click(); await shot('review');
    await M.getByRole('button', { name: 'Skicka röstmeddelande' }).click(); await shot('sent');
    expect(await M.locator('.bubble.voice').count() === 1, 'voice bubble in app');
    expect(await D.locator('.alert', { hasText: 'Röstmeddelande från Anna' }).count() === 1, 'coordinator alert for voice message');
    await D.locator('.alert', { hasText: 'Röstmeddelande' }).getByRole('button').click(); await shot('coord-voice');
    expect(await D.locator('.chat .bubble.voice').count() === 1, 'voice bubble for coordinator');
    await D.locator('.chat .vb-play').click(); await p.waitForTimeout(300);
    // offline queue
    await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: 'Anna tappar täckning' }).click();
    await M.getByRole('button', { name: 'Spela in röstmeddelande' }).click(); await p.waitForTimeout(600);
    await M.getByRole('button', { name: 'Klar' }).click(); await M.getByRole('button', { name: 'Skicka röstmeddelande' }).click();
    expect(await D.locator('.chat .bubble.voice').count() === 1, 'queued voice not delivered while offline');
    await shot('offline-queued');
    await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: 'Anna får täckning igen' }).click(); await p.waitForTimeout(400);
    expect(await D.locator('.chat .bubble.voice').count() === 2, 'queued voice delivered after reconnect');
    // assistant, no AI available locally
    await M.locator('.mtabs button', { hasText: 'Idag' }).click();
    await M.getByRole('button', { name: 'Fråga FieldVet' }).click(); await shot('assistant-empty');
    await M.getByRole('button', { name: /Hur lång tid tar det till nästa kund/ }).click(); await p.waitForTimeout(800);
    const a = await M.locator('.as-a').last().innerText();
    expect(/Bosse|Nästa/.test(a) && /minuter/.test(a), 'local answer mentions next visit and minutes: ' + a);
    await M.locator('#as-q').fill('Vad är portkoden till Bosse?'); await M.getByRole('button', { name: 'Fråga', exact: true }).click(); await p.waitForTimeout(700);
    expect((await M.locator('.as-a').last().innerText()).includes('4512'), 'portkod answered');
    await shot('assistant-local');
  } catch (e) { errs.push('A ' + e.message.split('\n')[0]); await shot('FAIL'); }
  await p.close();
}
// —— Assistant with (fake) AI runtime ——
{
  const p = await run(true);
  const M = p.locator('.phone .mapp'); const D = p.locator('.dash');
  let n = 0; const shot = async (x) => { await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/b${String(++n).padStart(2, '0')}-${x}.png` }); };
  try {
    await M.getByRole('button', { name: 'Fråga FieldVet' }).click(); await p.waitForTimeout(400);
    expect((await M.locator('.as-mode').innerText()).includes('AI'), 'AI mode shown');
    await M.getByRole('button', { name: 'Håll inne och prata' }).click(); await shot('listening');
    await M.getByRole('button', { name: /Hur lång tid tar det till nästa kund/ }).click(); await p.waitForTimeout(800);
    const a = await M.locator('.as-a').last().innerText();
    expect(/Bosse/.test(a) && /10 minuter/.test(a) && /08:45/.test(a), 'AI answer grounded in tool data: ' + a);
    await M.getByRole('button', { name: 'Håll inne och prata' }).click();
    await M.getByRole('button', { name: /Säg till Maria/ }).click(); await p.waitForTimeout(800); await shot('draft');
    expect(await M.locator('.as-draft').count() === 1, 'draft card shown');
    expect(await D.locator('.alert', { hasText: 'minuter sen' }).count() === 0, 'draft not sent before confirmation');
    await M.locator('.as-draft').getByRole('button', { name: 'Skicka' }).click(); await p.waitForTimeout(300);
    expect(await D.locator('.alert', { hasText: 'minuter sen' }).count() === 1, 'sent after confirmation');
    await shot('sent');
    expect(JSON.stringify(await p.evaluate(() => window.__calls)) === '["next","draft"]', 'tools called');
  } catch (e) { errs.push('B ' + e.message.split('\n')[0]); await shot('FAIL'); }
  await p.close();
}
await b.close();
finish('voice', errs);
