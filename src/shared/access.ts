// Role-based access, enforced where data leaves the store — not by hiding buttons.
// In production the same rules run server-side; this module is written so it can move there unchanged.
import type { Visit } from './data';
import type { World } from './engine';
import type { Journal } from './journal';

export type Role = 'samordnare' | 'veterinar' | 'admin';

export type Permission =
  | 'plan:read'
  | 'plan:approve' // approve/reject proposals, reassign, add urgent visits
  | 'visit:lock'
  | 'location:read' // live vet positions
  | 'owner:contact'
  | 'journal:status' // signed / draft / missing + billing basis
  | 'journal:clinical' // clinical narrative: only the treating veterinarian
  | 'journal:write'
  | 'history:read' // read-only patient history from Provet: assigned patients only
  | 'audit:read'
  | 'config:write';

export const GRANTS: Record<Role, Permission[]> = {
  samordnare: ['plan:read', 'plan:approve', 'visit:lock', 'location:read', 'owner:contact', 'journal:status', 'audit:read'],
  veterinar: ['plan:read', 'owner:contact', 'journal:status', 'journal:clinical', 'journal:write', 'history:read'],
  admin: ['config:write', 'audit:read'],
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  'plan:read': 'Se dagens plan',
  'plan:approve': 'Godkänna och ändra planen',
  'visit:lock': 'Låsa besök',
  'location:read': 'Se veterinärernas position',
  'owner:contact': 'Kontakta djurägare',
  'journal:status': 'Se journalstatus och debiteringsunderlag',
  'journal:clinical': 'Läsa och skriva journaltext',
  'journal:write': 'Signera journal',
  'history:read': 'Läsa patienthistorik från Provet (egna patienter)',
  'audit:read': 'Läsa granskningslogg',
  'config:write': 'Ändra team, arbetstider och integrationer',
};

/** Fail closed: an unknown role or missing grant is a denial. */
export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role || !(role in GRANTS)) return false;
  return GRANTS[role].includes(perm);
}

/** Operational journal view: completion state and billing basis, never the clinical narrative. */
function journalStatusOnly(j: Journal): Journal {
  return {
    state: j.state, createdAt: j.createdAt, signedAt: j.signedAt, syncedAt: j.syncedAt, signedBy: j.signedBy, syncError: j.syncError, pendingSync: j.pendingSync,
    atgarder: j.atgarder, // procedures performed = billing basis
    lakemedel: j.lakemedel.map((m) => ({ name: m.name, strength: '', dose: '', route: '', duration: '', withdrawal: '' })),
    uppfoljning: j.uppfoljning ? 'Uppföljning begärd av veterinären' : undefined,
    transcript: '', anamnes: '', status: '', bedomning: '', rad: '', flags: [], redacted: true,
  };
}

/** What a given role may see of one visit. Returns null when the role may not see it at all. */
export function redactVisit(v: Visit, role: Role, actorVetId?: string): Visit | null {
  if (role === 'samordnare') {
    return {
      ...v,
      // Flags come from the journal system and are clinical (allergy, medication, diagnoses). Dispatch does not need them.
      flags: {},
      lastNote: undefined,
      journal: v.journal ? journalStatusOnly(v.journal) : undefined,
      note: undefined,
    };
  }
  if (role === 'veterinar') {
    if (v.vetId === actorVetId || v.movedFrom === actorVetId) return v;
    return null; // other vets' patients are not shown in the field app
  }
  return null; // admin: configuration only, no patient data
}

/** Role-scoped copy of the world. Scheduling fields are untouched so plans stay identical. */
export function viewWorld(w: World, role: Role, actorVetId?: string): World {
  const visits: World['visits'] = {};
  for (const [id, v] of Object.entries(w.visits)) {
    const r = redactVisit(v, role, actorVetId);
    if (r) visits[id] = r;
  }
  if (role === 'veterinar') {
    const routes = Object.fromEntries(Object.entries(w.routes).map(([k, r]) => [k, k === actorVetId ? r : []]));
    return { ...w, visits, routes };
  }
  return { ...w, visits };
}
