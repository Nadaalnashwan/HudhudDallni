import { NextResponse } from "next/server";
import { groqEnabled } from "@/lib/server/groq";
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
  return NextResponse.json({ places, placesCount, dbError, ai: groqEnabled() ? "groq" : "rules" });
}
