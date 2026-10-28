import { NextResponse } from "next/server";
import { geminiEnabled, geminiStatus } from "@/lib/server/gemini";
import { placesMode } from "@/lib/server/places";
import { countPlaces } from "@/lib/server/supabasePlaces";

/** Reports which sources are live, and actually pings the database so the UI can show failures. */
export async function GET() {
  const places = placesMode();
  let placesCount: number | undefined;
  let dbError: string | undefined;
  if (places === "supabase") {
    try {
      placesCount = await countPlaces();
    } catch (e) {
      dbError = (e as Error).message;
    }
  }
  const { model, usableKeys } = geminiStatus();
  // key values are never returned — only how many are usable
  return NextResponse.json({ places, placesCount, dbError, ai: geminiEnabled() ? "gemini" : "rules", aiModel: geminiEnabled() ? model : undefined, aiKeys: usableKeys });
}
