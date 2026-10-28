import { NextResponse } from "next/server";
import { buildStops, type BuildInput } from "@/lib/server/planner";
import { computeRoute } from "@/lib/server/routes";

export async function POST(req: Request) {
  const input: BuildInput = await req.json();
  const stops = await buildStops(input);
  const route = stops.length ? await computeRoute([input.origin, ...stops.map((s) => s.place.location)]) : undefined;
  return NextResponse.json({ stops, route });
}
