const EARTH_RADIUS_M = 6_371_008.8;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 points. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export interface LockCheck {
  open: boolean;
  /** Metres between the reader and the place, or null when the reader gave no position. */
  distance: number | null;
}

/**
 * A "ghost touch" letter opens only when the reader reports a position inside its radius.
 * Unlocked letters are always open. Demo mode opens everything (for recording the video).
 */
export function checkLock(
  offering: { lat: number; lng: number; locked: number | boolean; lock_radius_m: number },
  reader: { lat?: number; lng?: number; accuracy?: number } | null,
  demo = false,
): LockCheck {
  let distance: number | null = null;
  if (reader && isValidLatLng(reader.lat, reader.lng)) {
    distance = haversineMeters(offering.lat, offering.lng, reader.lat as number, reader.lng as number);
  }
  if (!offering.locked || demo) return { open: true, distance };
  if (distance === null) return { open: false, distance: null };
  return { open: distance <= offering.lock_radius_m, distance };
}

/** Rough bounding box (degrees) around a point, used to pre-filter SQL before haversine. */
export function boxAround(lat: number, lng: number, meters: number) {
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.max(0.01, Math.cos(rad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
