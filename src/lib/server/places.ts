import "server-only";
import { CATEGORY_META } from "../catalog";
import { DEMO_GOOGLE_REVIEWS, DEMO_PLACES } from "../demoPlaces";
import { haversineKm } from "../geo";
import type { Category, LatLng, Place, PlaceTag } from "../types";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
export const placesMode = (): "google" | "demo" => (KEY ? "google" : "demo");

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
  reviews?: { authorAttribution?: { displayName?: string }; rating?: number; text?: { text?: string } }[];
};

/** Only derive tags from fields Google actually returns — never guess "quiet". */
function tagsFrom(p: GooglePlace): PlaceTag[] {
  const tags: PlaceTag[] = [];
  const summary = p.editorialSummary?.text ?? "";
  if (/هادئ|هادي|quiet|calm|cozy/i.test(summary)) tags.push("quiet");
  if (p.outdoorSeating || /outdoor|خارجي/i.test(summary)) tags.push("outdoor");
  if (p.goodForChildren) tags.push("family");
  if (p.priceLevel === "PRICE_LEVEL_INEXPENSIVE") tags.push("budget");
  return tags;
}

function fromGoogle(p: GooglePlace, category: Category): Place {
  return {
    id: p.id,
    name: p.displayName?.text ?? "مكان",
    category,
    location: { lat: p.location.latitude, lng: p.location.longitude },
    address: p.formattedAddress ?? "",
    rating: p.rating,
    ratingCount: p.userRatingCount,
    priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    photoUrl: p.photos?.[0] ? `/api/photo?name=${encodeURIComponent(p.photos[0].name)}` : undefined,
    tags: tagsFrom(p),
    summary: p.editorialSummary?.text,
    openNow: p.currentOpeningHours?.openNow,
    source: "google",
  };
}

export async function searchPlaces(opts: {
  category: Category;
  query?: string;
  near: LatLng;
  radiusKm?: number;
}): Promise<Place[]> {
  const radiusKm = opts.radiusKm ?? 4;
  if (!KEY) {
    const pool = DEMO_PLACES.filter((p) => p.category === opts.category);
    const q = opts.query?.replace(/\(تجريبي\)/g, "").trim();
    const named = q ? pool.filter((p) => p.name.includes(q)) : [];
    if (named.length) return named;
    const inRange = pool.filter((p) => haversineKm(p.location, opts.near) <= radiusKm);
    // Widen automatically so demo never returns empty.
    return inRange.length >= 3 ? inRange : pool.sort((a, b) => haversineKm(a.location, opts.near) - haversineKm(b.location, opts.near)).slice(0, 8);
  }

  const meta = CATEGORY_META[opts.category];
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      textQuery: `${opts.query || meta.query} في الرياض`,
      languageCode: "ar",
      regionCode: "SA",
      pageSize: 15,
      locationBias: {
        circle: { center: { latitude: opts.near.lat, longitude: opts.near.lng }, radius: Math.min(radiusKm * 1000, 50000) },
      },
    }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places ?? []).map((p) => fromGoogle(p, opts.category));
}

export type PlaceDetails = { place: Place; googleReviews: { author: string; rating: number; text: string }[] };

export async function getPlaceDetails(id: string, category: Category): Promise<PlaceDetails | null> {
  if (!KEY || id.startsWith("demo-")) {
    const place = DEMO_PLACES.find((p) => p.id === id);
    return place ? { place, googleReviews: DEMO_GOOGLE_REVIEWS } : null;
  }
  const mask = FIELDS.replaceAll("places.", "") + ",reviews";
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=ar`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": mask },
  });
  if (!res.ok) return null;
  const p = (await res.json()) as GooglePlace;
  return {
    place: fromGoogle(p, category),
    googleReviews: (p.reviews ?? []).map((r) => ({
      author: r.authorAttribution?.displayName ?? "مستخدم Google",
      rating: r.rating ?? 0,
      text: r.text?.text ?? "",
    })),
  };
}
