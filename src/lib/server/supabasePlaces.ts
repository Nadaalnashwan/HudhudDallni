import "server-only";
import { SUBCATEGORY_META } from "../catalog";
import { getServerSupabase } from "../supabase";
import type { Category, LocationStatus, Place, PlaceTag, Subcategory } from "../types";

/** Row shape of hudhud_demo.places. Newer rows (landmarks, everyday places) leave rating, price, hours and photo NULL. */
export type PlaceRow = {
  id: string;
  name_ar: string;
  category: string;
  subcategory: string;
  neighborhood: string | null;
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
  location_status?: string | null;
  location_source?: string | null;
};

const LEGACY_COLUMNS =
  "id,name_ar,category,subcategory,neighborhood,address_ar,latitude,longitude,rating,review_count,price_level,tags,amenities,opening_hours,image_url,is_demo,source";
const COLUMNS = `${LEGACY_COLUMNS},location_status,location_source`;
// Until the location_status migration is applied, PostgREST rejects the new columns (42703).
let columns = COLUMNS;

async function select<T>(run: (cols: string) => PromiseLike<{ data: T; error: { code?: string; message: string } | null }>) {
  const used = columns;
  const res = await run(used);
  // compare with the columns this call used: parallel searches can fail before any of them switches
  if (res.error?.code === "42703" && used !== LEGACY_COLUMNS) {
    columns = LEGACY_COLUMNS;
    return run(LEGACY_COLUMNS);
  }
  return res;
}

const LOCATION_STATUSES: LocationStatus[] = ["verified", "approximate", "synthetic"];

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

/** A finite, positive number, or undefined — NULL, "", 0 and NaN mean "no data". */
const positive = (v: number | string | null | undefined) => {
  const n = v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function toPlace(r: PlaceRow): Place {
  const sub = r.subcategory in SUBCATEGORY_META ? (r.subcategory as Subcategory) : undefined;
  const h = r.opening_hours;
  const district = r.neighborhood?.trim() || undefined;
  const isDemo = r.is_demo !== false;
  const status = LOCATION_STATUSES.find((s) => s === r.location_status);
  return {
    id: r.id,
    name: r.name_ar.replace(" (تجريبي)", "").replace(/^تجريبي\s*-\s*/, ""),
    category: r.category as Category,
    subcategory: sub,
    location: { lat: r.latitude, lng: r.longitude },
    address: r.address_ar?.trim() || (district ? `حي ${district}، الرياض` : "الرياض"),
    district,
    rating: positive(r.rating),
    ratingCount: positive(r.review_count),
    priceLevel: positive(r.price_level),
    photoUrl: r.image_url || undefined,
    tags: tagsFrom(r),
    labels: [...(r.tags ?? []).filter((x) => x !== "تجريبي"), ...(r.amenities ?? [])],
    hours: h?.open && h?.close ? `${h.open} – ${h.close}${h.days === "daily" ? " يومياً" : ""}` : undefined,
    source: "supabase",
    isDemo,
    // A row without a status predates the column: only demo rows existed then, so never assume "verified".
    locationStatus: status ?? (isDemo ? "synthetic" : "approximate"),
    locationSource: r.location_source || undefined,
  };
}

// Short cache: the seed is static and a whole category is about a thousand rows.
const cache = new Map<string, { at: number; rows: Place[] }>();
const TTL = 60_000;
const PAGE = 1000; // PostgREST's default max rows per response

/** Exact DB filters: category, optional subcategory and neighborhood. Distance/ranking happen in app code. */
export async function queryPlaces(f: { category: Category; subcategory?: Subcategory; neighborhood?: string }): Promise<Place[]> {
  const db = getServerSupabase();
  if (!db) throw new PlacesUnavailableError("Supabase is not configured");
  const key = `${f.category}|${f.subcategory ?? ""}|${f.neighborhood ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;

  // PostgREST caps each response, and a whole category can pass that, so read it page by page.
  const found: PlaceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await select((cols) => {
      let q = db.from("places").select(cols).eq("category", f.category);
      if (f.subcategory) q = q.eq("subcategory", f.subcategory);
      if (f.neighborhood) q = q.eq("neighborhood", f.neighborhood);
      return q.order("id").range(from, from + PAGE - 1);
    });
    if (error) throw new PlacesUnavailableError(`${error.code ?? ""} ${error.message}`.trim());
    const page = data as unknown as PlaceRow[];
    found.push(...page);
    if (page.length < PAGE) break;
  }
  const rows = found.map(toPlace);
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function getPlaceById(id: string): Promise<Place | null> {
  const db = getServerSupabase();
  if (!db) return null;
  const { data, error } = await select((cols) => db.from("places").select(cols).eq("id", id).maybeSingle());
  if (error) throw new PlacesUnavailableError(error.message);
  return data ? toPlace(data as unknown as PlaceRow) : null;
}

export async function countPlaces(): Promise<number> {
  const db = getServerSupabase();
  if (!db) throw new PlacesUnavailableError("Supabase is not configured");
  const { count, error } = await db.from("places").select("id", { count: "exact", head: true });
  if (error) throw new PlacesUnavailableError(`${error.code ?? ""} ${error.message}`.trim());
  return count ?? 0;
}
