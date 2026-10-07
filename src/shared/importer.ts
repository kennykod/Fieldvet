// File import of a day's bookings (e.g. an export from the practice system), with no server involved.
// Pure functions: parse a table, map columns, check rows, place addresses, distribute and plan the day.
// The demo places addresses by district or postcode on the schematic map; the real product uses a geocoding API.
import { buildVisits, ADDRESS_BOOK, KIND, VETS, t, type Species, type Visit, type VisitKind } from './data';
import type { LatLng } from './geo';
import { advance, capabilityGap, hhmm, LATE_TOL, optimizeRoute, planVet, stampBaseline, type World } from './engine';

// ——— 1. Parse ———
/** Decode file bytes: UTF-8 when valid, otherwise Windows-1252 (Excel's default "CSV" on Windows). */
export function decodeText(bytes: Uint8Array): string {
  let s: string;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { s = new TextDecoder('windows-1252').decode(bytes); }
  return s.replace(/^﻿/, '');
}

/** CSV/TSV with delimiter detection (; , tab) and quoted fields. Empty rows are dropped. */
export function parseTable(text: string): string[][] {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (d: string) => first.split('"').filter((_, i) => i % 2 === 0).join('').split(d).length - 1;
  const delim = [';', '\t', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ';');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x));
}

// ——— 2. Columns ———
export type FieldKey = 'id' | 'date' | 'time' | 'vet' | 'kind' | 'street' | 'postal' | 'area' | 'patient' | 'species' | 'breed' | 'owner' | 'phone' | 'note' | 'duration';
export const FIELDS: { key: FieldKey; label: string; required?: boolean; hint: string; words: string[] }[] = [
  { key: 'time', label: 'Tid', required: true, hint: 'Starttid, t.ex. 08:45', words: ['starttid', 'tid', 'start', 'klockslag', 'time', 'fran'] },
  { key: 'patient', label: 'Djurets namn', required: true, hint: 'T.ex. Bosse', words: ['djurnamn', 'djurets namn', 'djur', 'patient', 'namn pa djur'] },
  { key: 'street', label: 'Adress', required: true, hint: 'Gatuadress', words: ['besoksadress', 'gatuadress', 'adress', 'address', 'gata'] },
  { key: 'area', label: 'Ort eller stadsdel', hint: 'T.ex. Vasastan', words: ['stadsdel', 'postort', 'ort', 'omrade', 'stad', 'city'] },
  { key: 'postal', label: 'Postnummer', hint: 'T.ex. 113 24', words: ['postnummer', 'postnr', 'postkod', 'zip'] },
  { key: 'vet', label: 'Veterinär', hint: 'Tom: FieldVet fördelar', words: ['resurs', 'veterinar', 'personal', 'behandlare', 'ansvarig', 'vet'] },
  { key: 'kind', label: 'Besökstyp', hint: 'T.ex. Vaccination', words: ['bokningstyp', 'besokstyp', 'typ', 'tjanst', 'behandling', 'orsak', 'type'] },
  { key: 'id', label: 'Boknings-id', hint: 'För att känna igen bokningen', words: ['bokningsnr', 'bokningsnummer', 'bokningsid', 'bokning', 'ordernr', 'id', 'nr'] },
  { key: 'date', label: 'Datum', hint: 'Visas som dagens datum i demon', words: ['datum', 'dag', 'date'] },
  { key: 'species', label: 'Djurslag', hint: 'Hund, katt, kanin', words: ['djurslag', 'djurart', 'art', 'species'] },
  { key: 'breed', label: 'Ras', hint: 'Valfri', words: ['ras', 'breed'] },
  { key: 'owner', label: 'Ägare', hint: 'Namn', words: ['djuragare', 'agare', 'kundnamn', 'kund', 'owner'] },
  { key: 'phone', label: 'Telefon', hint: 'För knappen Ring', words: ['mobilnummer', 'telefonnummer', 'mobil', 'telefon', 'tel', 'phone'] },
  { key: 'note', label: 'Anteckning', hint: 'Portkod, parkering', words: ['kommentar', 'anteckning', 'meddelande', 'notering', 'info', 'portkod'] },
  { key: 'duration', label: 'Längd (min)', hint: 'Valfri', words: ['langd', 'varaktighet', 'minuter', 'tidsatgang', 'min'] },
];
export type Mapping = Record<FieldKey, number>; // column index, -1 = not used

const norm = (s: string) => s.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function guessMapping(headers: string[]): Mapping {
  const h = headers.map(norm);
  const used = new Set<number>();
  const m = {} as Mapping;
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS) {
      if (m[f.key] != null && m[f.key] >= 0) continue;
      let hit = -1;
      for (const w of f.words) {
        hit = h.findIndex((x, i) => !used.has(i) && (pass === 'exact' ? x === w : x.split(' ').includes(w) || (w.length > 4 && x.includes(w))));
        if (hit >= 0) break;
      }
      m[f.key] = hit;
      if (hit >= 0) used.add(hit);
    }
  }
  return m;
}

// ——— 3. Values ———
/** Minutes since midnight from "08:45", "8.45", "2026-10-01 08:45", ISO, or an Excel serial number. */
export function parseTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+([.,]\d+)?$/.test(s) && !/^\d{3,4}$/.test(s)) {
    const n = parseFloat(s.replace(',', '.'));
    // Excel stores a time as a fraction of a day (0.375 = 09:00) and a date-time as a serial number (46296.5).
    if (n < 1 || n >= 1000) return Math.round((n % 1) * 24 * 60) % (24 * 60);
  }
  const m = s.match(/(?:^|[\sT])(\d{1,2})[:.](\d{2})(?![\d-])/) ?? s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function parseDateLabel(raw: string): string | undefined {
  const s = raw.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const se = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  const serial = /^\d{5}(\.\d+)?$/.test(s) ? new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000) : null; // Excel date
  const [y, mo, d] = iso ? [+iso[1], +iso[2], +iso[3]] : se ? [+se[3], +se[2], +se[1]] : serial ? [serial.getUTCFullYear(), serial.getUTCMonth() + 1, serial.getUTCDate()] : [0, 0, 0];
  if (!y) return undefined;
  const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
  return `${d} ${months[mo - 1] ?? ''}`.trim();
}

const KIND_WORDS: [RegExp, VisitKind][] = [
  [/akut|kräk|krak|diarr|mag/i, 'akut-mage'],
  [/vaccin/i, 'vaccination'],
  [/tand|mun/i, 'tand'],
  [/öra|öron|ora\b|oron/i, 'öron'],
  [/hud|klåda|klada|eksem/i, 'hud'],
  [/hält|halt|ben|led/i, 'hälta'],
  [/sår|sar\b|stygn/i, 'sår'],
  [/blodprov|provtag|prov\b/i, 'blodprov'],
  [/urin|kiss|njur/i, 'urin'],
  [/andn|hosta|luftväg/i, 'andning'],
  [/senior|hälsokontroll|halsokontroll|ålder/i, 'senior'],
  [/uppfölj|återbes|aterbes|kontroll/i, 'uppföljning'],
  [/allmän|allman|undersök|aptit|trött/i, 'aptit'],
];
const DEFAULT_MIN: Record<VisitKind, number> = { vaccination: 25, aptit: 40, öron: 30, senior: 40, sår: 30, hälta: 40, blodprov: 25, hud: 30, andning: 40, tand: 25, urin: 35, 'akut-mage': 45, uppföljning: 30 };

export function guessKind(raw: string): VisitKind | null {
  for (const [re, k] of KIND_WORDS) if (re.test(raw)) return k;
  return null;
}
function guessSpecies(raw: string): Species | null {
  if (/katt|cat/i.test(raw)) return 'Katt';
  if (/kanin|rabbit|marsvin|gnagare/i.test(raw)) return 'Kanin';
  if (/hund|dog|valp/i.test(raw)) return 'Hund';
  return null;
}
export function matchVet(raw: string): string | null {
  const s = norm(raw);
  if (!s) return null;
  const v = VETS.find((x) => norm(x.name) === s) ?? VETS.find((x) => norm(x.first) === s) ?? VETS.find((x) => s.split(' ').includes(norm(x.first)));
  return v?.id ?? null;
}

// ——— 4. Places (schematic geocoding for the demo) ———
export const AREAS: { name: string; loc: LatLng }[] = [
  { name: 'Vasastan', loc: { lat: 59.3435, lng: 18.049 } }, { name: 'Östermalm', loc: { lat: 59.3385, lng: 18.084 } },
  { name: 'Norrmalm', loc: { lat: 59.3345, lng: 18.061 } }, { name: 'Kungsholmen', loc: { lat: 59.3325, lng: 18.031 } },
  { name: 'Södermalm', loc: { lat: 59.3145, lng: 18.068 } }, { name: 'Gamla stan', loc: { lat: 59.3252, lng: 18.0712 } },
  { name: 'Djurgården', loc: { lat: 59.3262, lng: 18.108 } }, { name: 'Gärdet', loc: { lat: 59.3455, lng: 18.099 } },
  { name: 'Hjorthagen', loc: { lat: 59.3528, lng: 18.098 } }, { name: 'Hammarby sjöstad', loc: { lat: 59.3035, lng: 18.098 } },
  { name: 'Liljeholmen', loc: { lat: 59.3095, lng: 18.023 } }, { name: 'Hägersten', loc: { lat: 59.2995, lng: 17.985 } },
  { name: 'Årsta', loc: { lat: 59.2985, lng: 18.049 } }, { name: 'Johanneshov', loc: { lat: 59.2955, lng: 18.079 } },
  { name: 'Enskede', loc: { lat: 59.2885, lng: 18.068 } }, { name: 'Bromma', loc: { lat: 59.3385, lng: 17.943 } },
  { name: 'Alvik', loc: { lat: 59.3335, lng: 17.981 } }, { name: 'Traneberg', loc: { lat: 59.3345, lng: 17.972 } },
  { name: 'Fredhäll', loc: { lat: 59.3315, lng: 18.006 } }, { name: 'Stadshagen', loc: { lat: 59.3375, lng: 18.018 } },
  { name: 'Hornstull', loc: { lat: 59.3158, lng: 18.034 } }, { name: 'Skanstull', loc: { lat: 59.3075, lng: 18.076 } },
  { name: 'Solna', loc: { lat: 59.3595, lng: 18.003 } }, { name: 'Sundbyberg', loc: { lat: 59.3615, lng: 17.968 } },
  { name: 'Lidingö', loc: { lat: 59.3635, lng: 18.14 } }, { name: 'Nacka', loc: { lat: 59.3105, lng: 18.158 } },
  { name: 'Sickla', loc: { lat: 59.3045, lng: 18.123 } },
];
const POSTAL: Record<string, string> = {
  '111': 'Norrmalm', '112': 'Kungsholmen', '113': 'Vasastan', '114': 'Östermalm', '115': 'Gärdet', '116': 'Södermalm', '117': 'Hornstull',
  '118': 'Södermalm', '120': 'Hammarby sjöstad', '121': 'Johanneshov', '122': 'Enskede', '126': 'Hägersten', '129': 'Hägersten',
  '131': 'Nacka', '161': 'Bromma', '167': 'Bromma', '168': 'Bromma', '169': 'Solna', '170': 'Solna', '171': 'Solna', '172': 'Sundbyberg', '181': 'Lidingö',
};
const KNOWN = new Map([...buildVisits().map((v) => [norm(v.address.street), { loc: v.loc, area: v.address.area }] as const), ...ADDRESS_BOOK.map((a) => [norm(a.street), { loc: a.loc, area: a.area }] as const)]);

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
/** Deterministic offset so several addresses in one district don't sit on the same spot. */
export function jitter(loc: LatLng, key: string): LatLng {
  const h = hash(key);
  return { lat: loc.lat + (((h & 0xffff) / 0xffff) - 0.5) * 0.0075, lng: loc.lng + (((h >>> 16) / 0xffff) - 0.5) * 0.014 };
}
export type Placement = { loc: LatLng; area: string; how: 'känd adress' | 'stadsdel' | 'postnummer' };
export function placeAddress(street: string, postal: string, area: string): Placement | null {
  const known = KNOWN.get(norm(street.split(',')[0]));
  if (known) return { ...known, how: 'känd adress' };
  const hay = norm(`${area} ${street}`);
  const a = [...AREAS].sort((x, y) => y.name.length - x.name.length).find((x) => hay.includes(norm(x.name)));
  if (a) return { loc: jitter(a.loc, street), area: a.name, how: 'stadsdel' };
  const pc = (postal || street).match(/\b(\d{3})\s?\d{2}\b/);
  const byPostal = pc && POSTAL[pc[1]];
  if (byPostal) { const p = AREAS.find((x) => x.name === byPostal)!; return { loc: jitter(p.loc, street), area: p.name, how: 'postnummer' }; }
  return null;
}

// ——— 5. Rows ———
export type IssueLevel = 'fel' | 'kontroll';
export interface Issue { level: IssueLevel; text: string; field?: FieldKey }
export interface ImportRow { line: number; visit: Visit | null; issues: Issue[]; vetFromFile: string | null; raw: Record<FieldKey, string> }

export function buildRows(table: string[][], m: Mapping, fixes: Record<number, string> = {}): { rows: ImportRow[]; dateLabel?: string } {
  const body = table.slice(1);
  const seen = new Set<string>();
  let dateLabel: string | undefined;
  const rows = body.map((cells, i): ImportRow => {
    const line = i + 2;
    const raw = Object.fromEntries(FIELDS.map((f) => [f.key, m[f.key] >= 0 ? (cells[m[f.key]] ?? '').trim() : ''])) as Record<FieldKey, string>;
    const issues: Issue[] = [];
    const time = parseTime(raw.time) ?? (raw.date ? parseTime(raw.date) : null);
    dateLabel ??= parseDateLabel(raw.date || raw.time);
    if (time == null) issues.push({ level: 'fel', text: raw.time ? `Tiden "${raw.time}" gick inte att läsa` : 'Tid saknas', field: 'time' });
    else if (time < t('07:00') || time > t('17:30')) issues.push({ level: 'kontroll', text: `${hhmm(time)} ligger utanför arbetstiden`, field: 'time' });
    if (!raw.patient) issues.push({ level: 'fel', text: 'Djurets namn saknas', field: 'patient' });
    const id = raw.id || `rad-${line}`;
    if (seen.has(id)) issues.push({ level: 'fel', text: `Bokning ${id} finns redan i filen`, field: 'id' });
    seen.add(id);
    const fixed = fixes[line] ? AREAS.find((a) => a.name === fixes[line]) : undefined;
    const place = fixed ? { loc: jitter(fixed.loc, raw.street || String(line)), area: fixed.name, how: 'stadsdel' as const } : placeAddress(raw.street, raw.postal, raw.area);
    if (!raw.street && !raw.area && !raw.postal) issues.push({ level: 'fel', text: 'Adress saknas', field: 'street' });
    else if (!place) issues.push({ level: 'fel', text: `Adressen kunde inte placeras på kartan${raw.area ? ` (${raw.area})` : ''}`, field: 'street' });
    const kindText = raw.kind || raw.note;
    const kind = guessKind(kindText) ?? 'aptit';
    if (!guessKind(kindText)) issues.push({ level: 'kontroll', text: raw.kind ? `Okänd besökstyp "${raw.kind}", räknas som allmän undersökning` : 'Besökstyp saknas, räknas som allmän undersökning', field: 'kind' });
    const vetFromFile = matchVet(raw.vet);
    if (raw.vet && !vetFromFile) issues.push({ level: 'kontroll', text: `Okänd veterinär "${raw.vet}", FieldVet fördelar besöket`, field: 'vet' });
    const species = guessSpecies(`${raw.species} ${raw.breed}`) ?? 'Hund';
    if (!guessSpecies(`${raw.species} ${raw.breed}`) && raw.species) issues.push({ level: 'kontroll', text: `Okänt djurslag "${raw.species}", räknas som hund`, field: 'species' });
    const minutes = Math.round(parseFloat(raw.duration.replace(',', '.')));
    const duration = minutes >= 10 && minutes <= 180 ? minutes : DEFAULT_MIN[kind];
    const [first, ...rest] = raw.owner.split(/\s+/).filter(Boolean);
    const blocking = issues.some((x) => x.level === 'fel');
    const visit: Visit | null = blocking || time == null || !place ? null : {
      id: `imp-${id.replace(/[^\w-]/g, '')}-${line}`,
      patient: { name: raw.patient, species, breed: raw.breed, age: '', sex: '' },
      owner: { first: first ?? 'Ägare', last: rest.join(' '), phone: raw.phone },
      address: { street: raw.street.split(',')[0] || place.area, area: place.area, postal: raw.postal || (raw.street.match(/\b\d{3}\s?\d{2}\b/)?.[0] ?? '') },
      loc: place.loc,
      reason: raw.kind || KIND[kind].label,
      kind, duration,
      window: { from: time, to: time + 30 },
      priority: kind === 'akut-mage' || /akut/i.test(raw.kind) ? 'akut' : 'normal',
      vetId: vetFromFile ?? '',
      status: 'planerad', actual: {}, extension: 0, flags: {},
      access: raw.note ? [raw.note] : ['Ring ägaren vid ankomst'],
    };
    return { line, visit, issues, vetFromFile, raw };
  });
  return { rows, dateLabel };
}

// ——— 6. Plan ———
export interface ImportResult { world: World; assignedByFieldVet: number; overloaded: string[]; count: number }

function score(vetId: string, route: string[], visits: Record<string, Visit>, now: number) {
  const vet = VETS.find((v) => v.id === vetId)!;
  const p = planVet(vet, route, visits, now);
  const late = p.stops.reduce((a, s) => a + Math.max(0, s.late - LATE_TOL), 0);
  const drive = p.stops.reduce((a, s) => a + s.drive, 0);
  return { value: drive + 3 * late + 2 * Math.max(0, p.overtime), overtime: p.overtime, worst: Math.max(0, ...p.stops.map((s) => s.late)) };
}

/** Build a new day: keep the vet from the file when asked, let FieldVet distribute the rest, then optimise each route. */
export function planImported(visitsIn: Visit[], opts: { keepVets: boolean; now?: number }): ImportResult {
  const dawn = t('06:30');
  const visits: Record<string, Visit> = {};
  const routes: Record<string, string[]> = Object.fromEntries(VETS.map((v) => [v.id, [] as string[]]));
  const queue: Visit[] = [];
  for (const v0 of [...visitsIn].sort((a, b) => a.window.from - b.window.from)) {
    const keep = opts.keepVets && v0.vetId && !capabilityGap(VETS.find((x) => x.id === v0.vetId)!, v0);
    const v = { ...v0, vetId: keep ? v0.vetId : '' };
    visits[v.id] = v;
    if (keep) routes[v.vetId].push(v.id); else queue.push(v);
  }
  const overloaded: string[] = [];
  // Urgent first, then by time: cheapest insertion among vets with the right competence and equipment.
  queue.sort((a, b) => (a.priority === 'akut' ? -1 : 0) - (b.priority === 'akut' ? -1 : 0) || a.window.from - b.window.from);
  for (const v of queue) {
    let best: { vetId: string; route: string[]; value: number; ok: boolean } | null = null;
    for (const vet of VETS) {
      if (capabilityGap(vet, v)) continue;
      const base = score(vet.id, routes[vet.id], visits, dawn).value;
      for (let i = 0; i <= routes[vet.id].length; i++) {
        const route = [...routes[vet.id].slice(0, i), v.id, ...routes[vet.id].slice(i)];
        const s = score(vet.id, route, visits, dawn);
        const ok = s.overtime <= 10 && s.worst <= 20;
        const value = s.value - base + (ok ? 0 : 1000);
        if (!best || value < best.value) best = { vetId: vet.id, route, value, ok };
      }
    }
    if (!best) { const any = VETS[0]; best = { vetId: any.id, route: [...routes[any.id], v.id], value: 0, ok: false }; }
    if (!best.ok) overloaded.push(v.id);
    routes[best.vetId] = best.route;
    visits[v.id] = { ...v, vetId: best.vetId };
  }
  for (const vet of VETS) routes[vet.id] = optimizeRoute(vet, routes[vet.id], visits, dawn);
  let w: World = { now: dawn, visits, routes, manualVet: '', planVersion: 1 };
  w = stampBaseline(w);
  const first = Math.min(...visitsIn.map((v) => v.window.from), t('08:45'));
  const now = opts.now ?? Math.max(dawn, Math.min(t('08:20'), first - 25));
  w = advance(w, now);
  return { world: { ...w, manualVet: 'anna' }, assignedByFieldVet: queue.length, overloaded, count: visitsIn.length };
}

// ——— Example file (fictional data, shaped like a practice-system export) ———
export const EXAMPLE_NAME = 'exempel-bokningar.csv';
export const EXAMPLE_CSV = [
  'Bokningsnr;Datum;Starttid;Resurs;Bokningstyp;Djur;Djurslag;Kund;Mobil;Adress;Postnr;Ort;Kommentar',
  '50112;2026-10-01;08:30;Anna Lindqvist;Vaccination;Molly;Hund;Petra Sjöberg;070-111 22 01;Sankt Eriksgatan 58;113 34;Stockholm;Portkod 1942',
  '50113;2026-10-01;08:40;Sara Nyström;Hälsokontroll senior;Doris;Katt;Gunnar Åberg;070-111 22 02;Strandvägen 29;114 56;Stockholm;Hiss finns',
  '50114;2026-10-01;09:00;Johan Berg;Hälta höger bak;Rocky;Hund;Emma Lund;070-111 22 03;Götgatan 71;116 21;Stockholm;',
  '50115;2026-10-01;09:15;Erik Holm;Urinvägsbesvär;Smilla;Katt;Olof Berg;070-111 22 04;Drottningholmsvägen 190;168 66;Bromma;Villa, grind',
  '50116;2026-10-01;09:30;;Vaccination;Sixten;Hund;Maja Holm;070-111 22 05;Hantverkargatan 44;112 21;Stockholm;',
  '50117;2026-10-01;09:45;Anna Lindqvist;Tandkontroll;Nisse;Kanin;Leo Strand;070-111 22 06;Odengatan 90;113 22;Stockholm;Portkod 7731',
  '50118;2026-10-01;10:00;Sara Nyström;Hud och klåda;Bamse;Hund;Ida Wiklund;070-111 22 07;Valhallavägen 150;115 24;Stockholm;',
  '50119;2026-10-01;10:15;Johan Berg;Blodprov;Frida;Katt;Anton Lind;070-111 22 08;Hammarby allé 47;120 63;Stockholm;Gästparkering',
  '50120;2026-10-01;10:30;;Akut kräkningar;Tage;Katt;Sofia Ek;070-111 22 09;Fleminggatan 18;112 26;Stockholm;Ring vid ankomst',
  '50121;2026-10-01;10:45;Erik Holm;Sårkontroll;Kaj;Hund;Nils Borg;070-111 22 10;Solnavägen 12;171 65;Solna;',
  '50122;2026-10-01;11:00;Anna Lindqvist;Öronbesvär;Ludde;Hund;Karin Falk;070-111 22 11;Upplandsgatan 30;113 60;Stockholm;',
  '50123;2026-10-01;11:30;Sara Nyström;Kloklippning;Mimmi;Katt;Hanna Wall;070-111 22 12;Lidingövägen 75;115 41;Stockholm;',
  '50124;2026-10-01;12:30;Johan Berg;Uppföljning;Rex;Hund;Oskar Dahl;070-111 22 13;Hornsgatan 124;117 28;Stockholm;',
  '50125;2026-10-01;13:00;Erik Holm;Andningsbesvär;Zelda;Katt;Lisa Nord;070-111 22 14;Ålstensgatan 20;167 65;Bromma;',
  '50126;2026-10-01;13:15;Anna Lindqvist;Vaccination;Pixel;Katt;Jonas Kvist;070-111 22 15;Kistagången 14;164 40;Kista;',
  '50127;2026-10-01;13:45;Sara Nyström;Seniorkontroll;Elvis;Hund;Anna Frisk;070-111 22 16;Karlavägen 41;114 31;Stockholm;',
  '50128;2026-10-01;14:00;Johan Berg;Vaccination;Tussan;Katt;Eva Sand;070-111 22 17;Sickla allé 5;131 65;Nacka;',
  '50129;2026-10-01;14:30;Erik Holm;Hud och klåda;Charlie;Hund;Per Ahl;070-111 22 18;Tomtebogatan 22;113 38;Stockholm;',
].join('\n');
