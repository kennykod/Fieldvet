// Minimal .xlsx reader for the demo: unzips with the browser's DecompressionStream and reads the first sheet.
// Enough for exports (text, numbers, dates as serial numbers). No formulas, styles or multiple sheets.

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

async function unzip(buf: Uint8Array, want: (name: string) => boolean): Promise<Record<string, string>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Filen är inte en giltig Excel-fil.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files: Record<string, string> = {};
  const dec = new TextDecoder('utf-8');
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lnl = dv.getUint16(local + 26, true), lel = dv.getUint16(local + 28, true);
    const start = local + 30 + lnl + lel;
    const raw = buf.subarray(start, start + size);
    files[name] = dec.decode(method === 0 ? raw : await inflate(raw));
  }
  return files;
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;

/** Returns the first worksheet as rows of cell strings. */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buf);
  const files = await unzip(bytes, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const parse = (x: string) => new DOMParser().parseFromString(x, 'application/xml');
  const shared = files['xl/sharedStrings.xml'] ? [...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')) : [];
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (files['xl/workbook.xml'] && files['xl/_rels/workbook.xml.rels']) {
    const first = parse(files['xl/workbook.xml']).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...parse(files['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheetXml = files[sheetPath] ?? Object.entries(files).find(([k]) => k.startsWith('xl/worksheets/'))?.[1];
  if (!sheetXml) throw new Error('Hittade inget kalkylblad i filen.');
  const rows: string[][] = [];
  for (const r of [...parse(sheetXml).getElementsByTagName('row')]) {
    const row: string[] = [];
    for (const c of [...r.getElementsByTagName('c')]) {
      const i = colIndex(c.getAttribute('r') ?? 'A1');
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const val = type === 's' ? shared[+v] ?? '' : type === 'inlineStr' ? [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('') : v;
      row[i] = val.trim();
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((x) => x));
}
