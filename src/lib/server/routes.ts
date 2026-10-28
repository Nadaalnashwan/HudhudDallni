import "server-only";
import { decodePolyline, estimateDrive } from "../geo";
import type { LatLng, RouteResult } from "../types";

const KEY = process.env.GOOGLE_MAPS_API_KEY;

const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

function demoRoute(points: LatLng[]): RouteResult {
  const legs = points.slice(1).map((p, i) => estimateDrive(points[i], p));
  return {
    path: points,
    legs,
    distanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    durationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
    source: "demo",
  };
}

/** Driving route through points in order (origin → stops). Falls back to estimates. */
export async function computeRoute(points: LatLng[]): Promise<RouteResult> {
  if (points.length < 2) return demoRoute(points);
  if (!KEY) return demoRoute(points);
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
    console.error("Routes API failed, using estimate", e);
    return demoRoute(points);
  }
}
