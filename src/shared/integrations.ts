// External systems behind adapters (Provet's own adapters live in shared/provet.ts). The prototype ships mock implementations only and says so in the UI.
// Swapping in a real service means implementing the same interface; the domain and UI do not change.
import { driveMin, roadKm, type LatLng } from './geo';

export type IntegrationMode = 'mock' | 'live';
export interface IntegrationInfo { key: string; name: string; example: string; mode: IntegrationMode; purpose: string; production: string }

export interface RoutingAdapter {
  info: IntegrationInfo;
  travelMinutes(a: LatLng, b: LatLng, departAt: number): number;
  distanceKm(a: LatLng, b: LatLng): number;
}

export interface SpeechAdapter {
  info: IntegrationInfo;
}

/** Clinic calendar: free slots when a home visit continues at the clinic. */
export interface ClinicSlot { at: number; label: string }
export interface ClinicCalendarAdapter {
  info: IntegrationInfo;
  /** Next free slots at or after `earliest` (minutes after midnight). */
  nextSlots(earliest: number, count?: number): ClinicSlot[];
}

const MockRouting: RoutingAdapter = {
  info: {
    key: 'routing', name: 'Karta och restider', example: 't.ex. Google Maps, HERE eller Mapbox', mode: 'mock',
    purpose: 'Adress till position och restid med trafik. Navigering öppnas i veterinärens vanliga kartapp.',
    production: 'Ruttjänst med trafikdata. Prototypen använder fågelvägen × omvägsfaktor och en rusningsmodell.',
  },
  travelMinutes: driveMin,
  distanceKm: roadKm,
};

const h = (x: string) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
/** Fixed, deterministic day at the clinic (demo). */
const CLINIC_DAY: ClinicSlot[] = [
  { at: h('10:30'), label: 'Undersökning' }, { at: h('11:15'), label: 'Undersökning med ultraljud' }, { at: h('13:30'), label: 'Undersökning' },
  { at: h('14:00'), label: 'Undersökning med ultraljud' }, { at: h('14:30'), label: 'Undersökning med ultraljud' }, { at: h('15:30'), label: 'Undersökning' },
];
const MockClinic: ClinicCalendarAdapter = {
  info: {
    key: 'clinic', name: 'Provet · kliniktider', example: 'Provet, bokning', mode: 'mock',
    purpose: 'Lediga tider när ett hembesök behöver fortsätta på kliniken.',
    production: 'Läs lediga tider och boka via Provets API. Prototypen har en fast påhittad dag.',
  },
  nextSlots: (earliest, count = 2) => CLINIC_DAY.filter((x) => x.at >= earliest).slice(0, count),
};

const MockSpeech: SpeechAdapter = {
  info: {
    key: 'speech', name: 'Tal till text', example: 'i telefonen eller EU-hostad tjänst', mode: 'mock',
    purpose: 'Diktering av journalutkast. Ljudet sparas inte.',
    production: 'Personuppgiftsbiträdesavtal, lagring inom EU och ingen träning på data. Prototypen spelar upp en förinspelad text.',
  },
};

/** Team chat (Slack). FieldVet reads chosen channels and posts operational events. Never clinical content. */
export const SLACK_INFO: IntegrationInfo = {
  key: 'slack', name: 'Teamchatt', example: 'Slack', mode: 'mock',
  purpose: 'Samordnaren ser klinikens Slack-trådar i dashboarden. FieldVet postar godkända planer, avbokningar och akutbesök.',
  production: 'Slack-app med OAuth, Events API och chat.postMessage, bara i utvalda kanaler. Inga journaluppgifter lämnar FieldVet.',
};

/** Provet is the master system. Each adapter is one narrow job; see shared/provet.ts for the contracts. */
export const PROVET_INFO: IntegrationInfo[] = [
  { key: 'provet-booking', name: 'Provet · bokningar', example: 'ProvetBookingAdapter', mode: 'mock',
    purpose: 'Läser dagens hembesök. Vanliga bokningar görs i Provet, inte i FieldVet. Filimport är reservväg.',
    production: 'Provets API med OAuth 2.0 och webhooks för ändrade bokningar. Kräver avtal och aktivering per klinik.' },
  { key: 'provet-patient', name: 'Provet · ägare och kontaktval', example: 'ProvetPatientAdapter', mode: 'mock',
    purpose: 'Hämtar det minsta som behövs för dagen: namn, adress, åtkomst, viktiga flaggor och om ägaren tar emot sms.',
    production: 'Provet är master för kontaktval. FieldVet sparar inga egna samtycken och kringgår aldrig Provet.' },
  { key: 'provet-history', name: 'Provet · patienthistorik', example: 'ProvetClinicalHistoryAdapter', mode: 'mock',
    purpose: 'Visa historik i veterinärens app: hämtas först när veterinären ber om den, bara för egna patienter, endast läsning.',
    production: 'Anrop från FieldVets server efter behörighetskontroll. Inga Provet-nycklar i appen. Varje läsning loggas.' },
  { key: 'provet-messaging', name: 'Provet · kundmeddelanden', example: 'ProvetMessagingAdapter', mode: 'mock',
    purpose: 'FieldVet skickar en händelse (t.ex. På väg) med en fast nyckel. Provet skickar klinikens mall till ägaren.',
    production: 'Klinikens kommunikationsflöde i Provet. Vilka mallar och kanaler som finns via API måste bekräftas med Provet.' },
  { key: 'provet-journal', name: 'Provet · journal', example: 'ProvetJournalWritebackAdapter', mode: 'mock',
    purpose: 'Skriver tillbaka journalen först när veterinären har granskat och signerat. Försök igen skapar aldrig en andra anteckning.',
    production: 'Vilka journalfält som får skrivas och hur signering går till i Provet måste bekräftas innan lansering.' },
];
export const integrations = { routing: MockRouting, speech: MockSpeech, clinic: MockClinic };
export const INTEGRATIONS: IntegrationInfo[] = [...PROVET_INFO, integrations.clinic.info, integrations.routing.info, integrations.speech.info, SLACK_INFO];
