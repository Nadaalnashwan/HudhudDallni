import { NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/server/places";
import type { Category } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = (new URL(req.url).searchParams.get("category") ?? "cafe") as Category;
  const details = await getPlaceDetails(id, category);
  return details ? NextResponse.json(details) : NextResponse.json({ error: "not found" }, { status: 404 });
}
