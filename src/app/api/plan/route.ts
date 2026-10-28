import { NextResponse } from "next/server";
import { PlacesUnavailableError } from "@/lib/server/places";
import { buildStops, type BuildInput } from "@/lib/server/planner";
import { computeRoute } from "@/lib/server/routes";

export async function POST(req: Request) {
  const input: BuildInput = await req.json();
  try {
    const stops = await buildStops(input);
    const route = stops.length ? await computeRoute([input.origin, ...stops.map((s) => s.place.location)]) : undefined;
    return NextResponse.json({ stops, route });
  } catch (e) {
    console.error("plan failed", e);
    const db = e instanceof PlacesUnavailableError;
    return NextResponse.json(
      { error: db ? "database_unavailable" : "plan_failed", detail: (e as Error).message },
      { status: db ? 503 : 500 },
    );
  }
}
