// Geography + travel model for a schematic Stockholm.
export interface LatLng { lat: number; lng: number }

// Map projection (equirectangular around 59.33°N). 1 unit ≈ 10 m.
export const MAP = { minLng: 17.9, maxLng: 18.19, minLat: 59.285, maxLat: 59.375, kLat: 11000 };
const COS = Math.cos((59.33 * Math.PI) / 180);
export const MAP_W = Math.round((MAP.maxLng - MAP.minLng) * MAP.kLat * COS);
export const MAP_H = Math.round((MAP.maxLat - MAP.minLat) * MAP.kLat);

export function project(p: LatLng): { x: number; y: number } {
  return {
    x: (p.lng - MAP.minLng) * MAP.kLat * COS,
    y: (MAP.maxLat - p.lat) * MAP.kLat,
  };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road distance: straight line × detour factor for bridges and one-way streets. */
export function roadKm(a: LatLng, b: LatLng): number {
  const d = haversineKm(a, b);
  if (d < 0.05) return 0;
  return d * 1.38 + 0.3;
}

/** Average city speed by time of day (minutes since midnight). */
export function speedKmh(t: number): number {
  if ((t >= 435 && t < 540) || (t >= 930 && t < 1050)) return 21; // rusning
  return 27;
}

export const PARKING_MIN = 4; // parkering + gå till dörren

/** Drive time in whole minutes including parking. */
export function driveMin(a: LatLng, b: LatLng, departAt: number): number {
  const km = roadKm(a, b);
  if (km === 0) return 0;
  return Math.round((km / speedKmh(departAt)) * 60 + PARKING_MIN);
}
