import type { LatLng } from './geo';
import type { Journal } from './journal';

export type Species = 'Hund' | 'Katt' | 'Kanin';
export type VisitStatus = 'planerad' | 'påväg' | 'framme' | 'pågår' | 'klar' | 'avbokad';
export type Priority = 'normal' | 'akut';
export type Special = 'Ultraljud' | 'Syrgas' | 'Dropp';

export interface Vet {
  id: string;
  name: string;
  first: string;
  initials: string;
  color: string;
  phone: string;
  car: string;
  start: LatLng;
  startLabel: string;
  shift: { start: number; end: number };
  exotics: boolean; // behörighet för kanin/smådjur
  special: Special[]; // utrustning i bilen utöver standard
}

export interface Visit {
  id: string;
  patient: { name: string; species: Species; breed: string; age: string; sex: string; weight?: string };
  owner: { first: string; last: string; phone: string };
  address: { street: string; area: string; postal: string };
  loc: LatLng;
  reason: string;
  kind: VisitKind;
  duration: number; // planerad besökstid, min
  window: { from: number; to: number }; // ankomstfönster som ägaren fått
  priority: Priority;
  vetId: string;
  status: VisitStatus;
  actual: { departedAt?: number; arrivedAt?: number; startedAt?: number; finishedAt?: number };
  extension: number; // extra minuter lagda på pågående besök
  plannedArrive?: number; // morgonplanens ankomst, baslinje för försening
  flags: { allergy?: string; medication?: string; warning?: string };
  lastNote?: string;
  access: string[];
  flexible?: boolean;
  flexWindow?: { from: number; to: number }; // överenskommet flexibelt spann
  isNew?: boolean;
  movedFrom?: string;
  timeChangedFrom?: number; // tidigare kommunicerad starttid
  note?: string;
  photos?: string[];
  treatments?: string[];
  followUp?: boolean;
  checklist?: Record<string, boolean>;
  journal?: Journal;
  locked?: { reason: string; by: string; at?: number }; // frozen: engine may not move or re-time it
  assignedAt?: number; // when the coordinator assigned a new (urgent) visit
  ack?: number; // when the receiving vet confirmed it in the app
  trafficDelay?: number; // extra minutes on the current drive (queues), demo
}

export type VisitKind =
  | 'vaccination'
  | 'aptit'
  | 'öron'
  | 'senior'
  | 'sår'
  | 'hälta'
  | 'blodprov'
  | 'hud'
  | 'andning'
  | 'tand'
  | 'urin'
  | 'akut-mage'
  | 'uppföljning';

export const KIND: Record<VisitKind, { label: string; equipment: string[]; needs?: Special[]; exotic?: boolean }> = {
  vaccination: { label: 'Vaccination', equipment: ['Vaccin enligt bokning', 'Sprutor och kanyler', 'Chipläsare', 'Bärbar våg'] },
  aptit: { label: 'Allmän undersökning', equipment: ['Stetoskop', 'Termometer', 'Blodprovsset', 'Bärbar våg'] },
  öron: { label: 'Öronundersökning', equipment: ['Otoskop', 'Öronrengöring', 'Provpinnar för cytologi', 'Mikroskopglas'] },
  senior: { label: 'Seniorkontroll', equipment: ['Blodtrycksmätare', 'Blodprovsset', 'Urinprovsburk', 'Bärbar våg'] },
  sår: { label: 'Sårkontroll', equipment: ['Sårvårdsset', 'Förband', 'Sterila handskar', 'Klorhexidin'] },
  hälta: { label: 'Hälta', equipment: ['Stetoskop', 'Smärtlindring, injektion', 'Bandage', 'Bärbar våg'] },
  blodprov: { label: 'Provtagning', equipment: ['Blodprovsset', 'Kylväska för prover', 'Remiss till lab'] },
  hud: { label: 'Hud och klåda', equipment: ['Hudskrapa', 'Tejpprov', 'Mikroskopglas', 'Woodslampa'] },
  andning: { label: 'Andningsbesvär', equipment: ['Bärbar syrgas', 'Pulsoximeter', 'Stetoskop', 'Akutväska'], needs: ['Syrgas'] },
  tand: { label: 'Tandkontroll', equipment: ['Munspekulum', 'Pannlampa', 'Bärbar våg'], exotic: true },
  urin: { label: 'Urinvägar', equipment: ['Urinprovsburk', 'Urinsticka', 'Bärbart ultraljud'], needs: ['Ultraljud'] },
  'akut-mage': { label: 'Akut mag-tarm', equipment: ['Akutväska', 'Droppaggregat', 'Blodprovsset', 'Illamåendemedicin'], needs: ['Dropp'] },
  uppföljning: { label: 'Uppföljning', equipment: ['Sårvårdsset', 'Stygnsax', 'Bärbar våg'] },
};

export const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const VETS: Vet[] = [
  {
    id: 'anna', name: 'Anna Lindqvist', first: 'Anna', initials: 'AL', color: '#4C63D2',
    phone: '070-214 58 31', car: 'FV 01 · Kia e-Niro', start: { lat: 59.3322, lng: 18.0296 }, startLabel: 'Fridhemsplan',
    shift: { start: t('08:00'), end: t('16:30') }, exotics: true, special: ['Dropp'],
  },
  {
    id: 'johan', name: 'Johan Berg', first: 'Johan', initials: 'JB', color: '#B24B84',
    phone: '070-388 12 07', car: 'FV 02 · VW ID.4', start: { lat: 59.3077, lng: 18.076 }, startLabel: 'Skanstull',
    shift: { start: t('07:30'), end: t('16:00') }, exotics: false, special: ['Ultraljud', 'Dropp'],
  },
  {
    id: 'sara', name: 'Sara Nyström', first: 'Sara', initials: 'SN', color: '#5E8A2F',
    phone: '073-902 44 16', car: 'FV 03 · Kia e-Niro', start: { lat: 59.3385, lng: 18.09 }, startLabel: 'Karlaplan',
    shift: { start: t('08:00'), end: t('16:30') }, exotics: true, special: ['Syrgas'],
  },
  {
    id: 'erik', name: 'Erik Holm', first: 'Erik', initials: 'EH', color: '#1F8AAD',
    phone: '076-120 93 55', car: 'FV 04 · Skoda Enyaq', start: { lat: 59.3385, lng: 17.9395 }, startLabel: 'Brommaplan',
    shift: { start: t('09:00'), end: t('17:00') }, exotics: false, special: ['Ultraljud', 'Syrgas', 'Dropp'],
  },
];

type Seed = Omit<Visit, 'status' | 'actual' | 'extension' | 'window' | 'priority'> & {
  at: string;
  win?: number;
  priority?: Priority;
};

const seeds: Seed[] = [
  // ——— Anna · Vasastan, Kungsholmen, Solna, Bromma ———
  {
    id: 'v-bosse', vetId: 'anna', at: '08:45', kind: 'vaccination', duration: 25,
    patient: { name: 'Bosse', species: 'Hund', breed: 'Labrador', age: '4 år', sex: 'Hane, kastrerad', weight: '34 kg' },
    owner: { first: 'Karin', last: 'Ek', phone: '070-551 20 84' },
    address: { street: 'Dalagatan 34', area: 'Vasastan', postal: '113 24' }, loc: { lat: 59.3418, lng: 18.0452 },
    reason: 'Årlig vaccination och kort hälsokontroll.',
    flags: { warning: 'Lindrig vaccinreaktion 2025 · observera 20 min', medication: 'Apoquel 16 mg vid behov' }, lastNote: 'Frisk vid förra besöket. Vikt 33,5 kg.',
    access: ['Portkod 4512', 'Hiss finns, 4 tr', 'Gästparkering på gården'],
  },
  {
    id: 'v-luna', vetId: 'anna', at: '09:40', kind: 'aptit', duration: 45,
    patient: { name: 'Luna', species: 'Katt', breed: 'Huskatt', age: '9 år', sex: 'Hona, kastrerad', weight: '4,1 kg' },
    owner: { first: 'Helena', last: 'Sjöberg', phone: '073-418 66 02' },
    address: { street: 'Kungsholms strand 147', area: 'Kungsholmen', postal: '112 48' }, loc: { lat: 59.3378, lng: 18.0318 },
    reason: 'Äter sämre sedan tre dagar, något slö.',
    flags: { allergy: 'Penicillin', medication: 'Ingen' }, lastNote: 'Tandsten grad 1 vid förra kontrollen.',
    access: ['Portkod 1893', 'Katten gömmer sig gärna under sängen', 'Ringklocka trasig, ring ägaren'],
  },
  {
    id: 'v-milo', vetId: 'anna', at: '10:20', kind: 'öron', duration: 30,
    patient: { name: 'Milo', species: 'Hund', breed: 'Cavapoo', age: '2 år', sex: 'Hane', weight: '8 kg' },
    owner: { first: 'Oskar', last: 'Lund', phone: '070-903 11 45' },
    address: { street: 'Råsundavägen 88', area: 'Solna', postal: '169 57' }, loc: { lat: 59.3622, lng: 18.0002 },
    reason: 'Kliar sig i vänster öra, skakar på huvudet.',
    flags: {}, lastNote: 'Öroninflammation höger öra i våras.',
    access: ['Villa, parkera på uppfarten', 'Hunden är glad och hoppar'],
  },
  {
    id: 'v-sigge', vetId: 'anna', at: '11:45', kind: 'senior', duration: 40,
    patient: { name: 'Sigge', species: 'Katt', breed: 'Norsk skogkatt', age: '14 år', sex: 'Hane, kastrerad', weight: '6,2 kg' },
    owner: { first: 'Gunnel', last: 'Wikström', phone: '08-26 44 19' },
    address: { street: 'Nyängsvägen 12', area: 'Bromma', postal: '167 61' }, loc: { lat: 59.3318, lng: 17.9612 },
    reason: 'Seniorkontroll med blodtryck och blodprov.',
    flags: { medication: 'Semintra 4 mg/ml dagligen', warning: 'Njurvärden förhöjda i mars' }, lastNote: 'Kreatinin 190 i mars. Kontroll var 6:e månad.',
    locked: { reason: 'Tiden är bekräftad med ägaren', by: 'Maria Ahlberg' },
    access: ['Ägaren går med rollator, ge tid vid dörren', 'Fri parkering på gatan'],
  },
  {
    id: 'v-ester', vetId: 'anna', at: '12:00', win: 240, flexible: true, kind: 'hud', duration: 30,
    patient: { name: 'Ester', species: 'Hund', breed: 'Pudel', age: '6 år', sex: 'Hona', weight: '21 kg' },
    owner: { first: 'Linnea', last: 'Dahl', phone: '072-240 57 90' },
    address: { street: 'Sankt Göransgatan 102', area: 'Stadshagen', postal: '112 17' }, loc: { lat: 59.3372, lng: 18.0189 },
    reason: 'Klåda på tassar och buk, rodnad hud.',
    flags: { allergy: 'Misstänkt foderallergi' }, lastNote: 'Provar hydrolyserat foder sedan augusti.',
    access: ['Portkod 7730', 'Ingen hiss, 3 tr', 'Betalparkering, zon 2', 'Hemma hela eftermiddagen'],
  },
  {
    id: 'v-doris', vetId: 'anna', at: '11:00', win: 300, flexible: true, kind: 'tand', duration: 25,
    patient: { name: 'Doris', species: 'Kanin', breed: 'Dvärgvädur', age: '5 år', sex: 'Hona', weight: '1,8 kg' },
    owner: { first: 'Sofia', last: 'Hedlund', phone: '070-661 38 22' },
    address: { street: 'Sankt Eriksgatan 71', area: 'Vasastan', postal: '113 32' }, loc: { lat: 59.3405, lng: 18.0368 },
    reason: 'Tandkontroll, äter långsamt.',
    flags: {}, lastNote: 'Tänder filade för 4 månader sedan.',
    access: ['Portkod 2208', 'Ägaren jobbar hemifrån, flexibel tid'],
  },

  // ——— Johan · Södermalm, Hammarby Sjöstad, Nacka ———
  {
    id: 'v-ellie', vetId: 'johan', at: '07:40', kind: 'vaccination', duration: 20,
    patient: { name: 'Ellie', species: 'Katt', breed: 'Ragdoll', age: '1 år', sex: 'Hona', weight: '3,6 kg' },
    owner: { first: 'Amir', last: 'Haddad', phone: '073-155 80 64' },
    address: { street: 'Götgatan 88', area: 'Södermalm', postal: '118 62' }, loc: { lat: 59.3118, lng: 18.0742 },
    reason: 'Andra vaccinationen.', flags: {}, access: ['Portkod 0619', 'Hiss finns'],
  },
  {
    id: 'v-nova', vetId: 'johan', at: '08:10', kind: 'sår', duration: 30,
    patient: { name: 'Nova', species: 'Hund', breed: 'Golden retriever', age: '7 år', sex: 'Hona', weight: '29 kg' },
    owner: { first: 'Emma', last: 'Palm', phone: '070-477 03 18' },
    address: { street: 'Lugnets allé 22', area: 'Hammarby Sjöstad', postal: '120 66' }, loc: { lat: 59.3041, lng: 18.0985 },
    reason: 'Sårkontroll efter borttagen knöl på bröstet.',
    flags: { medication: 'Metacam' }, lastNote: 'Operation 12 dagar sedan, stygn kan tas.',
    access: ['Portkod 5530', 'Garage under huset, plats 14'],
  },
  {
    id: 'v-tussan', vetId: 'johan', at: '09:20', kind: 'vaccination', duration: 25,
    patient: { name: 'Tussan', species: 'Katt', breed: 'Brittiskt korthår', age: '3 år', sex: 'Hona', weight: '4,4 kg' },
    owner: { first: 'Johanna', last: 'Ali', phone: '076-300 21 49' },
    address: { street: 'Sickla allé 9', area: 'Nacka', postal: '131 65' }, loc: { lat: 59.3048, lng: 18.1228 },
    reason: 'Vaccination och chipkontroll.', flags: {}, access: ['Portkod 3317'],
  },
  {
    id: 'v-harry', vetId: 'johan', at: '10:20', kind: 'hälta', duration: 40,
    patient: { name: 'Harry', species: 'Hund', breed: 'Tax', age: '8 år', sex: 'Hane', weight: '9 kg' },
    owner: { first: 'Per', last: 'Nordin', phone: '070-812 56 70' },
    address: { street: 'Värmdövägen 540', area: 'Nacka', postal: '131 42' }, loc: { lat: 59.3118, lng: 18.1605 },
    reason: 'Haltar på höger bakben sedan igår.',
    flags: { warning: 'Tidigare diskbråck 2023' }, lastNote: 'Diskbråck behandlat konservativt.',
    access: ['Radhus, gästplats vid soptunnorna', 'Nervös vid främlingar'],
  },
  {
    id: 'v-lilly', vetId: 'johan', at: '12:45', kind: 'uppföljning', duration: 30,
    patient: { name: 'Lilly', species: 'Hund', breed: 'Border collie', age: '5 år', sex: 'Hona', weight: '17 kg' },
    owner: { first: 'David', last: 'Strand', phone: '073-609 44 81' },
    address: { street: 'Hornsgatan 176', area: 'Södermalm', postal: '117 28' }, loc: { lat: 59.3158, lng: 18.0348 },
    reason: 'Uppföljning efter kastration, stygn.', flags: {}, access: ['Portkod 9044', 'Parkering på Långholmsgatan'],
  },
  {
    id: 'v-frasse', vetId: 'johan', at: '14:10', kind: 'senior', duration: 30,
    patient: { name: 'Frasse', species: 'Katt', breed: 'Huskatt', age: '16 år', sex: 'Hane, kastrerad', weight: '3,9 kg' },
    owner: { first: 'Birgitta', last: 'Åkesson', phone: '08-640 19 73' },
    address: { street: 'Swedenborgsgatan 30', area: 'Södermalm', postal: '118 27' }, loc: { lat: 59.3149, lng: 18.0636 },
    reason: 'Seniorkontroll, gått ner i vikt.', flags: { medication: 'Felimazole 2,5 mg' }, lastNote: 'Hypertyreos, välinställd i maj.',
    access: ['Portkod 1120', 'Hiss finns'],
  },

  // ——— Sara · Östermalm, Gärdet, Lidingö ———
  {
    id: 'v-kasper', vetId: 'sara', at: '08:25', priority: 'akut', kind: 'andning', duration: 40,
    patient: { name: 'Kasper', species: 'Hund', breed: 'Fransk bulldogg', age: '3 år', sex: 'Hane', weight: '12 kg' },
    owner: { first: 'Nils', last: 'Forsberg', phone: '070-218 90 33' },
    address: { street: 'Strandvägen 29', area: 'Östermalm', postal: '114 56' }, loc: { lat: 59.3339, lng: 18.0858 },
    reason: 'Akut: andas tungt sedan i natt, orolig.', flags: { warning: 'Brakycefal, undvik stress' },
    lastNote: 'Opererad för trånga näsborrar 2024.', access: ['Portkod 6621', 'Hiss, 2 tr'],
  },
  {
    id: 'v-maja', vetId: 'sara', at: '09:25', kind: 'blodprov', duration: 25,
    patient: { name: 'Maja', species: 'Katt', breed: 'Maine coon', age: '11 år', sex: 'Hona', weight: '6,8 kg' },
    owner: { first: 'Elin', last: 'Berglund', phone: '072-515 70 26' },
    address: { street: 'Värtavägen 44', area: 'Gärdet', postal: '115 29' }, loc: { lat: 59.3452, lng: 18.0978 },
    reason: 'Blodprov inför tandbehandling.', flags: {}, access: ['Portkod 4480'],
  },
  {
    id: 'v-otto', vetId: 'sara', at: '10:15', kind: 'hud', duration: 30,
    patient: { name: 'Otto', species: 'Hund', breed: 'Pudel', age: '4 år', sex: 'Hane', weight: '24 kg' },
    owner: { first: 'Carl', last: 'Wennberg', phone: '070-730 14 62' },
    address: { street: 'Kyrkvägen 12', area: 'Lidingö', postal: '181 35' }, loc: { lat: 59.3621, lng: 18.1402 },
    reason: 'Klåda runt ögon och öron.', flags: {}, access: ['Villa, grind med kodlås 1357'],
  },
  {
    id: 'v-selma', vetId: 'sara', at: '11:20', kind: 'hälta', duration: 45,
    patient: { name: 'Selma', species: 'Hund', breed: 'Berner sennen', age: '9 år', sex: 'Hona', weight: '41 kg' },
    owner: { first: 'Anders', last: 'Holmgren', phone: '070-344 26 91' },
    address: { street: 'Hjorthagsvägen 18', area: 'Hjorthagen', postal: '115 53' }, loc: { lat: 59.3528, lng: 18.0925 },
    reason: 'Stel i bakbenen, svårt att resa sig.', flags: { medication: 'Librela var 4:e vecka' }, access: ['Portkod 8012', 'Ingen hiss, 1 tr'],
  },
  {
    id: 'v-pontus', vetId: 'sara', at: '13:00', kind: 'tand', duration: 30,
    patient: { name: 'Pontus', species: 'Kanin', breed: 'Lejonhuvud', age: '6 år', sex: 'Hane', weight: '1,6 kg' },
    owner: { first: 'Ida', last: 'Mattsson', phone: '073-277 83 50' },
    address: { street: 'Valhallavägen 131', area: 'Östermalm', postal: '115 31' }, loc: { lat: 59.3449, lng: 18.0822 },
    reason: 'Tappar vikt, tandkontroll.', flags: {}, access: ['Portkod 3902'],
  },
  {
    id: 'v-morris', vetId: 'sara', at: '14:15', kind: 'sår', duration: 30,
    patient: { name: 'Morris', species: 'Katt', breed: 'Huskatt', age: '5 år', sex: 'Hane, kastrerad', weight: '5,3 kg' },
    owner: { first: 'Hanna', last: 'Lindgren', phone: '070-129 65 07' },
    address: { street: 'Odengatan 62', area: 'Vasastan', postal: '113 22' }, loc: { lat: 59.3431, lng: 18.0521 },
    reason: 'Sårkontroll efter bett i nacken.', flags: { allergy: 'Metacam, kräkts' }, access: ['Portkod 5518', 'Hiss finns'],
  },
  {
    id: 'v-rut', vetId: 'sara', at: '15:30', kind: 'senior', duration: 45,
    patient: { name: 'Rut', species: 'Hund', breed: 'Cocker spaniel', age: '13 år', sex: 'Hona', weight: '13 kg' },
    owner: { first: 'Lars', last: 'Ekström', phone: '08-663 27 40' },
    address: { street: 'Lidingövägen 75', area: 'Östermalm', postal: '115 37' }, loc: { lat: 59.3455, lng: 18.0875 },
    reason: 'Seniorkontroll, hjärtmissljud.', flags: { medication: 'Vetmedin' }, access: ['Portkod 2291'],
  },

  // ——— Erik · Bromma, Liljeholmen, Hägersten ———
  {
    id: 'v-alfons', vetId: 'erik', at: '09:30', kind: 'urin', duration: 35,
    patient: { name: 'Alfons', species: 'Katt', breed: 'Helig birma', age: '7 år', sex: 'Hane, kastrerad', weight: '5,0 kg' },
    owner: { first: 'Ulrika', last: 'Sandberg', phone: '070-866 42 13' },
    address: { street: 'Liljeholmsvägen 18', area: 'Liljeholmen', postal: '117 61' }, loc: { lat: 59.3098, lng: 18.0232 },
    reason: 'Kissar ofta och små mängder.', flags: {}, lastNote: 'Urinsten 2024.', access: ['Portkod 7042', 'Hiss finns'],
  },
  {
    id: 'v-stina', vetId: 'erik', at: '11:45', kind: 'vaccination', duration: 20,
    patient: { name: 'Stina', species: 'Hund', breed: 'Shetland sheepdog', age: '2 år', sex: 'Hona', weight: '8 kg' },
    owner: { first: 'Tobias', last: 'Lindblom', phone: '073-921 05 36' },
    address: { street: 'Hägerstensvägen 250', area: 'Hägersten', postal: '126 51' }, loc: { lat: 59.2972, lng: 17.9812 },
    reason: 'Vaccination.', flags: {}, access: ['Radhus, parkera på gatan'],
  },
  {
    id: 'v-bamse', vetId: 'erik', at: '14:00', kind: 'hud', duration: 40,
    patient: { name: 'Bamse', species: 'Hund', breed: 'Newfoundland', age: '5 år', sex: 'Hane', weight: '62 kg' },
    owner: { first: 'Kristina', last: 'Falk', phone: '070-455 90 28' },
    address: { street: 'Abrahamsbergsvägen 41', area: 'Bromma', postal: '168 30' }, loc: { lat: 59.3362, lng: 17.9528 },
    reason: 'Hot spots på halsen, kliar.', flags: {}, access: ['Villa, stor hund – håll grinden stängd'],
  },
];

export function buildVisits(): Visit[] {
  return seeds.map(({ at, win, priority, ...s }) => ({
    ...s,
    window: { from: t(at), to: t(at) + (win ?? 30) },
    flexWindow: s.flexible ? { from: t(at), to: t(at) + (win ?? 30) } : undefined,
    priority: priority ?? 'normal',
    status: 'planerad' as VisitStatus,
    actual: {},
    extension: 0,
  }));
}

/** Morning plan order per vet (engine re-optimises this at start of day). */
export function initialRoutes(visits: Visit[]): Record<string, string[]> {
  const r: Record<string, string[]> = {};
  for (const v of VETS) r[v.id] = [];
  for (const v of [...visits].sort((a, b) => a.window.from - b.window.from)) r[v.vetId].push(v.id);
  return r;
}

export const START_CLOCK = t('08:20');
export const DAY_LABEL = 'Tisdag 29 september';
export const COORDINATOR = { name: 'Maria Ahlberg', first: 'Maria', role: 'Kliniksamordnare' };

export interface UrgentPreset {
  patient: Visit['patient'];
  owner: Visit['owner'];
  address: Visit['address'];
  loc: LatLng;
  reason: string;
  kind: VisitKind;
  duration: number;
  access: string[];
  flags: Visit['flags'];
}

export const URGENT_PRESET: UrgentPreset = {
  patient: { name: 'Tessan', species: 'Katt', breed: 'Huskatt', age: '12 år', sex: 'Hona, kastrerad', weight: '3,8 kg' },
  owner: { first: 'Jonas', last: 'Eriksson', phone: '070-342 71 58' },
  address: { street: 'Fleminggatan 97', area: 'Kungsholmen', postal: '112 45' },
  loc: { lat: 59.3345, lng: 18.0246 },
  reason: 'Akut: kräkts upprepade gånger sedan i natt, slö och vill inte dricka.',
  kind: 'akut-mage',
  duration: 45,
  access: ['Portkod 3408', 'Hiss finns, 5 tr'],
  flags: { medication: 'Ingen' },
};

/** Fixed address book for the "Nytt hembesök" form. */
export const ADDRESS_BOOK: { street: string; area: string; postal: string; loc: LatLng }[] = [
  { street: 'Fleminggatan 97', area: 'Kungsholmen', postal: '112 45', loc: { lat: 59.3345, lng: 18.0246 } },
  { street: 'Tulegatan 41', area: 'Vasastan', postal: '113 53', loc: { lat: 59.3452, lng: 18.0598 } },
  { street: 'Ringvägen 120', area: 'Södermalm', postal: '116 61', loc: { lat: 59.3087, lng: 18.0829 } },
  { street: 'Bergsgatan 12', area: 'Solna', postal: '171 69', loc: { lat: 59.3598, lng: 18.0118 } },
  { street: 'Karlavägen 88', area: 'Östermalm', postal: '115 22', loc: { lat: 59.3389, lng: 18.0925 } },
  { street: 'Klövervägen 3', area: 'Bromma', postal: '167 50', loc: { lat: 59.3392, lng: 17.9608 } },
];
