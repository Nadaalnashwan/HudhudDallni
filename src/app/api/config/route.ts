import { NextResponse } from "next/server";
import { groqEnabled } from "@/lib/server/groq";
import { placesMode } from "@/lib/server/places";

export async function GET() {
  return NextResponse.json({ places: placesMode(), ai: groqEnabled() ? "groq" : "rules" });
}
