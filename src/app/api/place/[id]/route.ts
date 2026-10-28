import { NextResponse } from "next/server";
import { getPlace } from "@/lib/server/places";
import type { Category } from "@/lib/types";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = (new URL(req.url).searchParams.get("category") ?? "cafe") as Category;
  try {
    const place = await getPlace(id, category);
    return place ? NextResponse.json({ place }) : NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: "database_unavailable", detail: (e as Error).message }, { status: 503 });
  }
}
