// Import: example file, a real .xlsx, and a Windows-1252 CSV with commas. Then the day is planned and shown everywhere.
import { launch, APP, finish } from './_env.mjs';
import fs from 'fs';
const OUT = '/tmp/import'; fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const b = await launch();
const errs = [];
const expect = (cond, msg) => { if (!cond) errs.push('EXPECT ' + msg); };
const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(`STEP ${label}: ${e.message.split('\n')[0]}`); } };
const open = async (hash = '#bada') => {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && errs.push('CONSOLE ' + m.text()));
  await p.goto(APP + hash); await p.waitForTimeout(700);
  return p;
};
const openImport = async (p) => { await p.locator('.dash').getByRole('button', { name: 'Mer', exact: true }).click(); await p.getByRole('menuitem', { name: /Importera/ }).click(); await p.waitForTimeout(200); };

await step('example-file', async () => {
  const p = await open();
  await openImport(p);
  await p.getByRole('button', { name: 'Använd exempelfil' }).click();
  expect((await p.locator('#map-time option:checked').innerText()).startsWith('Starttid'), 'time column guessed');
  await p.getByRole('button', { name: /Kontrollera 18 rader/ }).click();
  expect((await p.locator('.imp-sum').innerText()).includes('17 klara'), '17 rows ready');
  expect(await p.locator('.imp-row.bad').count() === 1, 'one row cannot be placed (Kista)');
  await p.getByLabel('Välj stadsdel för Pixel').selectOption('Solna');
  expect((await p.locator('.imp-sum').innerText()).includes('18 klara'), 'fixing the district brings the row back');
  await p.getByRole('button', { name: /Planera och godkänn 18 besök/ }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/after-example.png` });
  const dash = await p.locator('.dash').innerText();
  expect((await p.locator('.toasts').innerText()).includes('Dagens plan importerad'), 'import confirmed');
  expect(dash.includes('18 besök idag'), 'summary shows the imported day');
  expect(!dash.includes('Bosse'), 'old demo day is gone');
  expect(await p.locator('.dash').getAttribute('data-plan') === '1', 'imported plan is version 1');
  expect((await p.locator('.phone .mapp').innerText()).includes('Molly'), 'Anna\'s app shows her first imported visit');
  // The imported day works like any other: overrun and a proposal.
  await p.locator('.demo-toggle').click(); await p.getByRole('menuitem', { name: /Spola fram/ }).click(); await p.waitForTimeout(300);
  expect(!(await p.locator('.dash .side').innerText()).includes('Dagens plan importerad'), 'import confirmation does not clutter Behöver åtgärdas');
  await p.close();
});

await step('xlsx', async () => {
  const p = await open('#samordnare');
  await openImport(p);
  await p.locator('#imp-file').setInputFiles('tests/fixtures/bokningar.xlsx'); await p.waitForTimeout(500);
  expect((await p.locator('.modal.import').innerText()).includes('bokningar.xlsx · 3 rader'), 'xlsx read');
  await p.getByRole('button', { name: /Kontrollera 3 rader/ }).click();
  const rows = await p.locator('.imp-rows').innerText();
  expect(rows.includes('Åsa-Lill') && rows.includes('09:00') && rows.includes('10:30'), 'names with å and Excel times read correctly');
  expect((await p.locator('.imp-sum').innerText()).includes('2 oktober'), 'Excel date read');
  await p.screenshot({ path: `${OUT}/xlsx-check.png` });
  await p.getByRole('button', { name: /Planera och godkänn 3 besök/ }).click(); await p.waitForTimeout(600);
  const dash = await p.locator('.dash').innerText();
  expect(dash.includes('3 besök idag'), 'three visits planned');
  await p.close();
});

await step('windows-csv', async () => {
  const p = await open('#samordnare');
  await openImport(p);
  const csv = 'Tid,Djur,Adress,Ort,Veterinär,Typ\r\n09:10,Göran,"Sveavägen 90, 113 59",Vasastan,Anna,Vaccination\r\n10:20,Nöff,Ringvägen 50,Södermalm,,Hälta\r\n';
  await p.locator('#imp-file').setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: /Kontrollera 2 rader/ }).click();
  const rows = await p.locator('.imp-rows').innerText();
  expect(rows.includes('Göran') && rows.includes('Nöff'), 'Windows-1252 decoded (å ä ö)');
  expect(rows.includes('FieldVet fördelar'), 'row without vet is distributed');
  await p.close();
});

await step('errors', async () => {
  const p = await open('#samordnare');
  await openImport(p);
  await p.locator('#imp-file').setInputFiles({ name: 'tom.csv', mimeType: 'text/csv', buffer: Buffer.from('Tid;Djur;Adress\n') });
  await p.waitForTimeout(300);
  expect((await p.locator('.imp-err').innerText()).includes('inga bokningar'), 'empty file explained');
  await p.locator('#imp-file').setInputFiles({ name: 'gammal.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
  await p.waitForTimeout(300);
  expect((await p.locator('.imp-err').innerText()).includes('.xls'), 'old Excel format explained');
  await p.locator('#imp-file').setInputFiles({ name: 'konstig.csv', mimeType: 'text/csv', buffer: Buffer.from('A;B;C\n1;2;3\n') });
  await p.waitForTimeout(300);
  expect(await p.getByRole('button', { name: /Kontrollera/ }).isDisabled(), 'cannot continue without required columns');
  await p.close();
});

await b.close();
finish('import', errs);
