import "server-only";
import { decodePolyline, haversineKm } from "../geo";
import type { LatLng, NavStep, RouteResult } from "../types";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
// Public OSRM demo server (OpenStreetMap data). Fine for a prototype; self-host or use a
// commercial provider for production traffic. Override with OSRM_URL.
const OSRM = process.env.OSRM_URL || "https://router.project-osrm.org";

const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** Without Google Routes we only know straight-line (Haversine) distance — no driving time is invented. */
function straightLine(points: LatLng[], error?: string): RouteResult {
  const legs = points.slice(1).map((p, i) => ({ distanceMeters: Math.round(haversineKm(points[i], p) * 1000) }));
  return { path: points, legs, distanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0), source: "straight_line", error };
}

// ---------------------------------------------------------------- OSRM (road network, OpenStreetMap)

type OsrmStep = { distance: number; name: string; maneuver: { type: string; modifier?: string; exit?: number } };
type OsrmRoute = { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: { distance: number; duration: number; steps?: OsrmStep[] }[] };

const TURN: Record<string, string> = {
  left: "انعطف يسار",
  right: "انعطف يمين",
  "slight left": "خذ يسار خفيف",
  "slight right": "خذ يمين خفيف",
  "sharp left": "انعطف يسار حاد",
  "sharp right": "انعطف يمين حاد",
  straight: "استمر سيدا",
  uturn: "سوّ يوتيرن",
};

/** OSRM maneuver → short Arabic instruction (basic guidance, not full turn-by-turn). */
function arabicStep(s: OsrmStep): string | null {
  const road = s.name ? ` على ${s.name}` : "";
  const turn = TURN[s.maneuver.modifier ?? ""] ?? "استمر";
  switch (s.maneuver.type) {
    case "depart":
      return `انطلق${road}`;
    case "arrive":
      return "وصلت للوجهة";
    case "roundabout":
    case "rotary":
      return `ادخل الدوار واطلع من المخرج ${s.maneuver.exit ?? ""}${road}`.replace(/\s+/g, " ");
    case "turn":
    case "end of road":
    case "fork":
    case "on ramp":
    case "off ramp":
    case "merge":
      return `${turn}${road}`;
    case "continue":
    case "new name":
      return s.distance < 30 ? null : `استمر${road}`;
    default:
      return `${turn}${road}`;
  }
}

async function osrmRoute(points: LatLng[], withSteps: boolean): Promise<RouteResult> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=${withSteps}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "HudhudDallni-prototype" } });
  const data = (await res.json()) as { code: string; message?: string; routes?: OsrmRoute[] };
  if (!res.ok || data.code !== "Ok" || !data.routes?.[0]) throw new Error(data.message || data.code || `OSRM ${res.status}`);
  const r = data.routes[0];
  const steps: NavStep[] = withSteps
    ? r.legs.flatMap((l) => l.steps ?? []).flatMap((s) => {
        const text = arabicStep(s);
        return text ? [{ text, distanceMeters: Math.round(s.distance) }] : [];
      })
    : [];
  return {
    path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    legs: r.legs.map((l) => ({ distanceMeters: Math.round(l.distance), durationSeconds: Math.round(l.duration) })),
    distanceMeters: Math.round(r.distance),
    durationSeconds: Math.round(r.duration),
    source: "osrm",
    steps: withSteps ? steps : undefined,
  };
}

/**
 * Road route through points in order (origin → stops): Google Routes when configured,
 * otherwise OSRM. If routing fails, returns straight lines flagged with `error` —
 * never presented as a driving distance.
 */
export async function computeRoute(points: LatLng[], opts: { steps?: boolean } = {}): Promise<RouteResult> {
  if (points.length < 2) return straightLine(points);
  if (!KEY) {
    try {
      return await osrmRoute(points, Boolean(opts.steps));
    } catch (e) {
      console.error("OSRM routing failed", (e as Error).message);
      return straightLine(points, (e as Error).message);
    }
  }
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters",
      },
      body: JSON.stringify({
        origin: wp(points[0]),
        destination: wp(points[points.length - 1]),
        intermediates: points.slice(1, -1).map(wp),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "ar",
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r) throw new Error("no route");
    const secs = (d?: string) => parseInt(d ?? "0", 10);
    return {
      path: decodePolyline(r.polyline.encodedPolyline),
      legs: r.legs.map((l: { distanceMeters?: number; duration?: string }) => ({
        distanceMeters: l.distanceMeters ?? 0,
        durationSeconds: secs(l.duration),
      })),
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: secs(r.duration),
      source: "google",
    };
  } catch (e) {
    console.error("Routes API failed, using straight lines", e);
    return straightLine(points, (e as Error).message);
  }
}
