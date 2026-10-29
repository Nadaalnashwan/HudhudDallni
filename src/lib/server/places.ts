import "server-only";
import { nameMatchScore } from "../arabic";
import { CATEGORY_META, SUBCATEGORY_META } from "../catalog";
import { DEMO_PLACES } from "../demoPlaces";
import { haversineKm } from "../geo";
import { supabaseConfigured } from "../supabase";
import type { Category, LatLng, Place, PlaceTag, Subcategory } from "../types";
import { getPlaceById, queryPlaces } from "./supabasePlaces";

export { PlacesUnavailableError } from "./supabasePlaces";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const SEARCH_RADIUS_M = 6000; // Google Places location bias around the previous stop

/**
 * Exactly one place source is active — sources are never mixed:
 * Supabase (hudhud_demo) → Google Places → local offline demo.
 */
export const placesMode = (): Place["source"] => (supabaseConfigured() ? "supabase" : KEY ? "google" : "demo");

type SearchOpts = {
  category: Category;
  subcategory?: Subcategory;
  neighborhood?: string;
  query?: string; // a place name the user mentioned
  near: LatLng;
};

/**
 * Places whose name matches what the user typed, best match first ("أكاديمية طويق", "التعليم",
 * "النخيل مول"). Matching ignores hamza/ta-marbuta/diacritic spelling and a leading "ال".
 */
export function matchByName(pool: Place[], query?: string): Place[] {
  if (!query?.trim()) return [];
  return pool
    .map((p) => ({ p, s: nameMatchScore(p.name, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}

/** Candidates for one step. Returns the full filtered set (named matches first); the planner ranks by distance. */
export async function searchPlaces(opts: SearchOpts): Promise<Place[]> {
  const mode = placesMode();
  if (mode === "supabase") {
    const rows = await queryPlaces(opts);
    const named = matchByName(rows, opts.query);
    return named.length ? named : rows;
  }
  if (mode === "google") return googleSearch(opts);

  let pool = DEMO_PLACES.filter((p) => p.category === opts.category && (!opts.subcategory || p.subcategory === opts.subcategory));
  if (opts.neighborhood) pool = pool.filter((p) => p.district === opts.neighborhood);
  const named = matchByName(pool, opts.query?.replace(/\(تجريبي\)/g, ""));
  return named.length ? named : pool;
}

/** "ودني بانوراما": places anywhere in the data whose name matches, best first. */
export async function findPlacesByName(query: string): Promise<Place[]> {
  const mode = placesMode();
  if (mode === "google") return [];
  const pool = mode === "supabase" ? (await Promise.all((Object.keys(CATEGORY_META) as Category[]).map((category) => queryPlaces({ category })))).flat() : DEMO_PLACES;
  return matchByName(pool, query);
}

export async function getPlace(id: string, category: Category): Promise<Place | null> {
  if (id.startsWith("demo-")) return DEMO_PLACES.find((p) => p.id === id) ?? null;
  if (placesMode() === "supabase") return getPlaceById(id);
  if (KEY) return googleDetails(id, category);
  return null;
}

// ---------------------------------------------------------------- Google Places (optional)

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.photos",
  "places.outdoorSeating",
  "places.goodForChildren",
  "places.editorialSummary",
  "places.currentOpeningHours.openNow",
].join(",");

const PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: { name: string }[];
  outdoorSeating?: boolean;
  goodForChildren?: boolean;
  editorialSummary?: { text: string };
  currentOpeningHours?: { openNow?: boolean };
};

/** Only derive tags from fields Google actually returns — never guess "quiet". */
function googleTags(p: GooglePlace): PlaceTag[] {
  const tags: PlaceTag[] = [];
  const summary = p.editorialSummary?.text ?? "";
  if (/هادئ|هادي|quiet|calm|cozy/i.test(summary)) tags.push("quiet");
  if (p.outdoorSeating || /outdoor|خارجي/i.test(summary)) tags.push("outdoor");
  if (p.goodForChildren) tags.push("family");
  if (p.priceLevel === "PRICE_LEVEL_INEXPENSIVE") tags.push("budget");
  return tags;
}

function fromGoogle(p: GooglePlace, category: Category, subcategory?: Subcategory): Place {
  return {
    id: p.id,
    name: p.displayName?.text ?? "مكان",
    category,
    subcategory,
    location: { lat: p.location.latitude, lng: p.location.longitude },
    address: p.formattedAddress ?? "",
    rating: p.rating,
    ratingCount: p.userRatingCount,
    priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    photoUrl: p.photos?.[0] ? `/api/photo?name=${encodeURIComponent(p.photos[0].name)}` : undefined,
    tags: googleTags(p),
    summary: p.editorialSummary?.text,
    openNow: p.currentOpeningHours?.openNow,
    source: "google",
    isDemo: false,
    locationStatus: "verified",
    locationSource: "google",
  };
}

async function googleSearch(opts: SearchOpts): Promise<Place[]> {
  const meta = CATEGORY_META[opts.category];
  const sub = opts.subcategory ? SUBCATEGORY_META[opts.subcategory].label : "";
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      textQuery: `${opts.query || `${meta.query} ${sub}`.trim()} ${opts.neighborhood ? `حي ${opts.neighborhood}` : ""} الرياض`,
      languageCode: "ar",
      regionCode: "SA",
      pageSize: 20,
      locationBias: { circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: SEARCH_RADIUS_M } },
    }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? [])
    .map((p) => fromGoogle(p, opts.category, opts.subcategory))
    .sort((a, b) => haversineKm(a.location, opts.near) - haversineKm(b.location, opts.near));
}

async function googleDetails(id: string, category: Category): Promise<Place | null> {
  const mask = FIELDS.replaceAll("places.", "");
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ar`, {
    headers: { "X-Goog-Api-Key": KEY!, "X-Goog-FieldMask": mask },
  });
  return res.ok ? fromGoogle((await res.json()) as GooglePlace, category) : null;
}
