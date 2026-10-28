import "server-only";
import { SUBCATEGORY_META } from "../catalog";
import { getServerSupabase } from "../supabase";
import type { Category, Place, PlaceTag, Subcategory } from "../types";

/** Row shape of hudhud_demo.places. */
type PlaceRow = {
  id: string;
  name_ar: string;
  category: string;
  subcategory: string;
  neighborhood: string;
  address_ar: string | null;
  latitude: number;
  longitude: number;
  rating: number | string | null;
  review_count: number | null;
  price_level: number | null;
  tags: string[] | null;
  amenities: string[] | null;
  opening_hours: { open?: string; close?: string; days?: string } | null;
  image_url: string | null;
  is_demo: boolean | null;
  source: string | null;
};

const COLUMNS =
  "id,name_ar,category,subcategory,neighborhood,address_ar,latitude,longitude,rating,review_count,price_level,tags,amenities,opening_hours,image_url,is_demo,source";

export class PlacesUnavailableError extends Error {}

/** Map Arabic DB tags/subcategory to app tags — only facts the record states. */
function tagsFrom(r: PlaceRow): PlaceTag[] {
  const t = new Set<PlaceTag>();
  const tags = r.tags ?? [];
  if (tags.includes("هادئ") || r.subcategory === "quiet") t.add("quiet");
  if (tags.includes("مناسب للمذاكرة") || r.subcategory === "study") t.add("work");
  if (tags.includes("اقتصادي") || r.price_level === 1) t.add("budget");
  return [...t];
}

function toPlace(r: PlaceRow): Place {
  const sub = r.subcategory in SUBCATEGORY_META ? (r.subcategory as Subcategory) : undefined;
  const h = r.opening_hours;
  return {
    id: r.id,
    name: r.name_ar,
    category: r.category as Category,
    subcategory: sub,
    location: { lat: r.latitude, lng: r.longitude },
    address: r.address_ar ?? `حي ${r.neighborhood}، الرياض`,
    district: r.neighborhood,
    rating: r.rating == null ? undefined : Number(r.rating),
    ratingCount: r.review_count ?? undefined,
    priceLevel: r.price_level ?? undefined,
    photoUrl: r.image_url ?? undefined,
    tags: tagsFrom(r),
    labels: [...(r.tags ?? []).filter((x) => x !== "تجريبي"), ...(r.amenities ?? [])],
    hours: h?.open && h?.close ? `${h.open} – ${h.close}${h.days === "daily" ? " يومياً" : ""}` : undefined,
    source: "supabase",
    isDemo: r.is_demo !== false,
  };
}

// Short cache: the seed is static and a whole category is at most a few hundred rows.
const cache = new Map<string, { at: number; rows: Place[] }>();
const TTL = 60_000;

/** Exact DB filters: category, optional subcategory and neighborhood. Distance/ranking happen in app code. */
export async function queryPlaces(f: { category: Category; subcategory?: Subcategory; neighborhood?: string }): Promise<Place[]> {
  const db = getServerSupabase();
  if (!db) throw new PlacesUnavailableError("Supabase is not configured");
  const key = `${f.category}|${f.subcategory ?? ""}|${f.neighborhood ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;

  let q = db.from("places").select(COLUMNS).eq("category", f.category);
  if (f.subcategory) q = q.eq("subcategory", f.subcategory);
  if (f.neighborhood) q = q.eq("neighborhood", f.neighborhood);
  const { data, error } = await q.limit(500);
  if (error) throw new PlacesUnavailableError(`${error.code ?? ""} ${error.message}`.trim());
  const rows = (data as PlaceRow[]).map(toPlace);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const db = getServerSupabase();
  if (!db) return null;
  const { data, error } = await db.from("places").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new PlacesUnavailableError(error.message);
  return data ? toPlace(data as PlaceRow) : null;
}

export async function countPlaces(): Promise<number> {
  const db = getServerSupabase();
  if (!db) throw new PlacesUnavailableError("Supabase is not configured");
  const { count, error } = await db.from("places").select("id", { count: "exact", head: true });
  if (error) throw new PlacesUnavailableError(`${error.code ?? ""} ${error.message}`.trim());
  return count ?? 0;
}
