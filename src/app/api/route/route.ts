import { NextResponse } from "next/server";
import { computeRoute } from "@/lib/server/routes";
import type { LatLng } from "@/lib/types";

export async function POST(req: Request) {
  const { points }: { points: LatLng[] } = await req.json();
  return NextResponse.json(await computeRoute(points));
}
