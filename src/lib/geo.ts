import type { LatLng } from "./types";

export const RIYADH_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rough city-driving estimate used in demo mode: road factor 1.35, ~32 km/h average. */
export function estimateDrive(a: LatLng, b: LatLng) {
  const km = haversineKm(a, b) * 1.35;
  return { distanceMeters: Math.round(km * 1000), durationSeconds: Math.round((km / 32) * 3600) + 120 };
}

export function formatKm(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(1)} كم`;
}

export function formatMinutes(seconds: number) {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`;
}

/** Decode a Google encoded polyline. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
