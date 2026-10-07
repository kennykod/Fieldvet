// Journal drafts produced by (simulated) dictation + AI structuring.
// Structure follows SJVFS journal content: anamnes, status, bedömning, behandling, läkemedel (namn, styrka, dos, tid, karens).
import type { Visit, VisitKind } from './data';

export interface JournalMed { name: string; strength: string; dose: string; route: string; duration: string; withdrawal: string }
export interface JournalFlag { id: string; field: 'lakemedel' | 'status' | 'anamnes' | 'bedomning' | 'atgarder'; msg: string; fix: string; placeholder?: string; resolved?: boolean; value?: string }
export type JournalState = 'utkast' | 'signerad';
export interface Journal {
  state: JournalState;
  transcript: string;
  anamnes: string;
  status: string;
  bedomning: string;
  atgarder: string[];
  lakemedel: JournalMed[];
  rad: string;
  uppfoljning?: string;
  flags: JournalFlag[];
  createdAt: number;
  signedAt?: number;
  syncedAt?: number;
  signedBy?: string;
  auto?: boolean; // other vets' journals in the demo, created off-screen
  syncError?: string; // last write-back failure
  pendingSync?: boolean; // signed on the device, waiting for connectivity / journal system
  redacted?: boolean; // clinical fields removed for this role
}

type Template = Omit<Journal, 'state' | 'createdAt'>;

const T: Partial<Record<VisitKind, (v: Visit) => Template>> = {
  vaccination: (v) => ({
    transcript: `${v.patient.name}, ${v.patient.breed.toLowerCase()} ${v.patient.age}. Kommer för årlig vaccination. Ägaren har inte märkt något avvikande. Allmäntillstånd u.a., hjärta och lungor u.a., vikt ${v.patient.weight ?? 'noterad'}. Vaccinerar med Nobivac DHP, en dos subkutant. Inga reaktioner. Nästa vaccination om ett år.`,
    anamnes: 'Årlig vaccination. Ägaren har inte märkt något avvikande.',
    status: `Allmäntillstånd u.a. Hjärta och lungor u.a. Vikt ${v.patient.weight ?? '–'}.`,
    bedomning: 'Klinisk frisk.',
    atgarder: ['Klinisk undersökning', 'Vaccination', 'Vägning'],
    lakemedel: [{ name: 'Nobivac DHP', strength: '1 dos', dose: '1 ml', route: 's.c.', duration: 'Engångsdos', withdrawal: 'Ej tillämpligt' }],
    rad: 'Nästa vaccination om ett år.',
    flags: [{ id: 'batch', field: 'lakemedel', msg: 'Batchnummer för vaccinet nämndes inte.', fix: 'Lägg till batchnummer', placeholder: 'Batchnummer', value: 'A417C02' }],
  }),
  aptit: (v) => ({
    transcript: `${v.patient.name}, katt nio år. Nedsatt aptit i tre dagar, lite slö. Dricker normalt. Temp trettioåtta komma fem, lätt dehydrerad, cirka fem procent. Buken mjuk och oöm. Tar blodprov, hälsoprofil. Ger Cerenia en milligram per kilo subkutant och hundra milliliter Ringer subkutant. Ägaren ringer om hon inte äter i kväll. Jag ringer med provsvar i morgon.`,
    anamnes: 'Nedsatt aptit i tre dagar, något slö. Dricker normalt.',
    status: 'Temp 38,5 °C. Lätt dehydrerad, ca 5 %. Buk mjuk och oöm vid palpation.',
    bedomning: 'Inappetens, oklar genes. Blodprov för vidare utredning.',
    atgarder: ['Klinisk undersökning', 'Blodprov, hälsoprofil', 'Vätska s.c.', 'Illamåendebehandling'],
    lakemedel: [
      { name: 'Cerenia (maropitant)', strength: '10 mg/ml', dose: '1 mg/kg = 0,41 ml', route: 's.c.', duration: 'Engångsdos', withdrawal: 'Ej tillämpligt' },
      { name: 'Ringer-acetat', strength: '–', dose: '100 ml', route: 's.c.', duration: 'Engångsdos', withdrawal: 'Ej tillämpligt' },
    ],
    rad: 'Ägaren ringer om katten inte äter i kväll.',
    uppfoljning: 'Ring ägaren med provsvar i morgon.',
    flags: [{ id: 'strength', field: 'lakemedel', msg: 'Styrkan på Cerenia hördes inte. AI har antagit 10 mg/ml.', fix: 'Bekräfta 10 mg/ml' }],
  }),
  öron: (v) => ({
    transcript: `${v.patient.name}, cavapoo två år. Kliar vänster öra och skakar på huvudet sedan en vecka. Rodnad och brunt sekret i vänster hörselgång, trumhinnan hel. Cytologi visar jäst. Rengör och startar Easotic, en dos i vänster öra en gång dagligen i fem dagar. Återbesök om två veckor om det inte blivit bättre.`,
    anamnes: 'Klåda vänster öra och huvudskakningar sedan en vecka.',
    status: 'Rodnad och brunt sekret i vänster hörselgång. Trumhinnan hel.',
    bedomning: 'Otitis externa sin., jäst (Malassezia) enligt cytologi.',
    atgarder: ['Otoskopi', 'Cytologi', 'Öronrengöring'],
    lakemedel: [{ name: 'Easotic', strength: '–', dose: '1 dos (1 ml)', route: 'Vänster öra', duration: '1 gång dagligen i 5 dagar', withdrawal: 'Ej tillämpligt' }],
    rad: 'Håll örat torrt.',
    uppfoljning: 'Återbesök om två veckor om ingen förbättring.',
    flags: [],
  }),
  'akut-mage': (v) => ({
    transcript: `${v.patient.name}, katt tolv år. Kräkts upprepade gånger sedan i natt, vill inte dricka. Slö. Temp trettionio komma ett, dehydrerad cirka åtta procent, ömhet kraniellt i buken. Sätter dropp, Ringer-acetat. Ger Cerenia subkutant. Blodprov taget. Remiss till klinik för ultraljud i eftermiddag.`,
    anamnes: 'Upprepade kräkningar sedan natten. Vill inte dricka. Slö.',
    status: 'Temp 39,1 °C. Dehydrerad ca 8 %. Ömhet kraniellt i buken.',
    bedomning: 'Akut gastrit, differentialdiagnos främmande kropp eller pankreatit.',
    atgarder: ['Klinisk undersökning', 'Dropp', 'Blodprov', 'Remiss'],
    lakemedel: [
      { name: 'Ringer-acetat', strength: '–', dose: '200 ml', route: 'i.v.', duration: 'Under besöket', withdrawal: 'Ej tillämpligt' },
      { name: 'Cerenia (maropitant)', strength: '10 mg/ml', dose: '', route: 's.c.', duration: 'Engångsdos', withdrawal: 'Ej tillämpligt' },
    ],
    rad: 'Fasta till ultraljud. Ring om hon blir sämre.',
    uppfoljning: 'Ultraljud på kliniken i eftermiddag.',
    flags: [{ id: 'dose', field: 'lakemedel', msg: 'Dos för Cerenia saknas.', fix: 'Lägg till dos', placeholder: 'Dos', value: '1 mg/kg = 0,38 ml' }],
  }),
};

function generic(v: Visit): Template {
  return {
    transcript: `${v.patient.name}, ${v.patient.species.toLowerCase()} ${v.patient.age}. ${v.reason} Undersökning genomförd. Ägaren informerad om fortsatt plan.`,
    anamnes: v.reason,
    status: 'Allmäntillstånd u.a.',
    bedomning: 'Se anamnes.',
    atgarder: ['Klinisk undersökning'],
    lakemedel: [],
    rad: 'Ägaren informerad om fortsatt plan.',
    flags: [],
  };
}

export function draftFor(v: Visit, now: number): Journal {
  const t = (T[v.kind] ?? generic)(v);
  return { ...t, flags: t.flags.map((f) => ({ ...f })), lakemedel: t.lakemedel.map((m) => ({ ...m })), state: 'utkast', createdAt: now };
}

export function autoSigned(v: Visit, at: number, by: string): Journal {
  return { ...draftFor(v, at), flags: [], state: 'signerad', signedAt: at + 4, syncedAt: at + 4, signedBy: by, auto: true };
}

/** Journal content requirements the draft is checked against. */
export function requirements(j: Journal) {
  const unresolved = j.flags.filter((f) => !f.resolved).length;
  const medsOk = j.lakemedel.every((m) => m.name && m.dose && m.route && m.duration);
  return [
    { label: 'Anamnes', ok: !!j.anamnes.trim() },
    { label: 'Status', ok: !!j.status.trim() },
    { label: 'Bedömning', ok: !!j.bedomning.trim() },
    { label: 'Åtgärder', ok: j.atgarder.length > 0 },
    { label: 'Läkemedel', ok: medsOk && unresolved === 0 },
  ];
}
