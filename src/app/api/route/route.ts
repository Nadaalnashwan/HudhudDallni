import { NextResponse } from "next/server";
import { computeRoute } from "@/lib/server/routes";
import type { LatLng } from "@/lib/types";

export async function POST(req: Request) {
  const { points, steps }: { points: LatLng[]; steps?: boolean } = await req.json();
  if (!Array.isArray(points) || points.length < 2 || points.length > 8) return NextResponse.json({ error: "bad points" }, { status: 400 });
  return NextResponse.json(await computeRoute(points, { steps }));
}
