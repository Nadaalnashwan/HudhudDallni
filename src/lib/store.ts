"use client";
import { getBrowserSupabase } from "./supabase";
import type { Place, Plan, Preferences, Review, Visit } from "./types";

/**
 * Our own Hudhud data (preferences, plans, visits, feedback, reviews).
 *
 * Supabase mode: the user gets an anonymous Supabase Auth session, and every
 * private row is owned by auth.uid() under the hudhud_demo RLS policies —
 * no service-role key, no open writes. Only places that exist in
 * hudhud_demo.places can be referenced (foreign keys).
 *
 * Local mode (clearly labelled in the UI): used when Supabase or anonymous
 * sign-in is not available, or for the offline demo places. Reviews are never
 * sent to Google.
 */

export const DEFAULT_PREFS: Preferences = { consent: false, likes: [], avoid: [], notes: [], neighborhoods: [], cuisines: [], cafeTypes: [] };

const ls = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ---------------------------------------------------------------- auth

export type StoreStatus = { mode: "supabase" | "local"; reason?: string };
let status: StoreStatus | null = null;
let userPromise: Promise<string | null> | null = null;

/** Anonymous Supabase session (needs "Allow anonymous sign-ins" in the dashboard). */
export function ensureUser(): Promise<string | null> {
  const db = getBrowserSupabase();
  if (!db) {
    status = { mode: "local", reason: "Supabase غير مهيأ" };
    return Promise.resolve(null);
  }
  return (userPromise ??= (async () => {
    const { data } = await db.auth.getSession();
    if (data.session) {
      status = { mode: "supabase" };
      return data.session.user.id;
    }
    const { data: signed, error } = await db.auth.signInAnonymously();
    if (error || !signed.user) {
      status = { mode: "local", reason: `تسجيل الدخول المجهول غير مفعّل (${error?.message ?? "no user"})` };
      userPromise = null; // allow a retry after the setting is enabled
      return null;
    }
    status = { mode: "supabase" };
    return signed.user.id;
  })());
}

export async function storeStatus(): Promise<StoreStatus> {
  await ensureUser();
  return status ?? { mode: "local" };
}

/** Only database places can be written to hudhud_demo tables. */
const dbPlace = (p: { source: Place["source"] }) => p.source === "supabase";

export function localUserId(): string {
  let id = ls.get<string | null>("hudhud.userId", null);
  if (!id) {
    id = crypto.randomUUID();
    ls.set("hudhud.userId", id);
  }
  return id;
}

// ---------------------------------------------------------------- preferences

export async function loadPreferences(): Promise<Preferences> {
  const local = { ...DEFAULT_PREFS, ...ls.get<Partial<Preferences>>("hudhud.prefs", {}) };
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (!uid || !db) return local;
  const { data, error } = await db.from("user_preferences").select("preferences,learning_consent").eq("user_id", uid).maybeSingle();
  if (error || !data) return local;
  return { ...DEFAULT_PREFS, ...(data.preferences as Partial<Preferences>), consent: data.learning_consent };
}

export async function savePreferences(p: Preferences): Promise<StoreStatus["mode"]> {
  ls.set("hudhud.prefs", p);
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (!uid || !db) return "local";
  const { consent, ...preferences } = p;
  const { error } = await db
    .from("user_preferences")
    .upsert({ user_id: uid, preferences, learning_consent: consent, updated_at: new Date().toISOString() });
  if (error) console.error("save preferences", error);
  return error ? "local" : "supabase";
}

/** "امسح تفضيلاتي": removes the stored row entirely, not just the values. */
export async function clearPreferences() {
  ls.set("hudhud.prefs", DEFAULT_PREFS);
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (uid && db) await db.from("user_preferences").delete().eq("user_id", uid);
}

// ---------------------------------------------------------------- plans & visits

export async function savePlan(plan: Plan) {
  ls.set("hudhud.lastPlan", plan);
  if (!plan.startedAt || !plan.stops.every((s) => dbPlace(s.place))) return;
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (!uid || !db) return;
  const { error } = await db.from("outing_plans").upsert({ id: plan.id, user_id: uid, title: plan.stops.map((s) => s.place.name).join(" ← ").slice(0, 200), status: "saved", updated_at: new Date().toISOString() });
  if (error) return console.error("save plan", error);
  await db.from("outing_stops").delete().eq("plan_id", plan.id);
  await db.from("outing_stops").insert(plan.stops.map((s, i) => ({ plan_id: plan.id, place_id: s.place.id, stop_order: i + 1, is_locked: s.locked })));
}

export const loadLastPlan = () => ls.get<Plan | null>("hudhud.lastPlan", null);
export const loadVisits = () => ls.get<Visit[]>("hudhud.visits", []);
export const saveVisits = (v: Visit[]) => ls.set("hudhud.visits", v);

/** Called when the user confirms the visit. Returns the visit row id in Supabase mode. */
export async function confirmVisit(v: Visit): Promise<string | undefined> {
  if (!dbPlace(v)) return undefined;
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (!uid || !db) return undefined;
  const { data, error } = await db.from("visits").insert({ user_id: uid, place_id: v.placeId, confirmed_by_user: true }).select("id").single();
  if (error) console.error("visit", error);
  return data?.id;
}

/** Private feedback, stored only when the user agreed to let it improve recommendations. */
export async function saveFeedback(v: Visit, f: { sentiment: "positive" | "neutral" | "negative"; reason?: string; notes?: string }) {
  if (!dbPlace(v)) return;
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  if (!uid || !db) return;
  const { error } = await db.from("feedback").insert({ user_id: uid, place_id: v.placeId, ...f, use_for_learning: true });
  if (error) console.error("feedback", error);
}

// ---------------------------------------------------------------- reviews

export async function publishReview(
  r: Omit<Review, "id" | "userId" | "storage" | "createdAt">,
  v: Visit,
  extra: { visitId?: string; negativeReason?: string },
): Promise<Review["storage"]> {
  const createdAt = new Date().toISOString();
  const uid = dbPlace(v) ? await ensureUser() : null;
  const db = getBrowserSupabase();
  if (uid && db) {
    const { error } = await db.from("reviews").insert({
      user_id: uid,
      place_id: r.placeId,
      visit_id: extra.visitId ?? null,
      rating: r.rating,
      review_text: r.body,
      negative_reason: extra.negativeReason ?? null,
      publish_consent: true,
      is_published: true,
    });
    if (error) throw new Error(error.message);
    return "supabase";
  }
  const all = ls.get<Review[]>("hudhud.reviews", []);
  ls.set("hudhud.reviews", [{ ...r, id: crypto.randomUUID(), userId: localUserId(), createdAt, storage: "local" }, ...all]);
  return "local";
}

type ReviewRow = { id: string; user_id: string; place_id: string; rating: number; review_text: string | null; negative_reason: string | null; created_at: string };

/** Published Hudhud reviews for a place — separate from the seeded/synthetic rating. */
export async function listReviews(place: Place): Promise<Review[]> {
  const db = getBrowserSupabase();
  if (db && dbPlace(place)) {
    const { data, error } = await db
      .from("reviews")
      .select("id,user_id,place_id,rating,review_text,negative_reason,created_at")
      .eq("place_id", place.id)
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (!error && data)
      return (data as ReviewRow[]).map((x) => ({
        id: x.id,
        placeId: x.place_id,
        placeName: place.name,
        rating: x.rating,
        experience: x.rating >= 4 ? "excellent" : x.rating === 3 ? "average" : "bad",
        reasons: x.negative_reason ? x.negative_reason.split("، ") : [],
        body: x.review_text ?? "",
        createdAt: x.created_at,
        userId: x.user_id,
        storage: "supabase",
      }));
  }
  return ls.get<Review[]>("hudhud.reviews", []).filter((r) => r.placeId === place.id);
}

// ---------------------------------------------------------------- دلّني feedback (about the assistant, not places)

export type AssistantFeedback = {
  helpful: "yes" | "partly" | "no";
  usedPlace: "yes" | "no" | "not_yet";
  improvements: ("accuracy" | "proximity" | "variety" | "understanding" | "editing")[];
};

const ASK_KEY = "hudhud.dallniAsked";
const ASK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** Ask at most once per outing, and not again within 12 hours — never nag. */
export function shouldAskDallni(planKey: string): boolean {
  const a = ls.get<{ keys: string[]; at: number }>(ASK_KEY, { keys: [], at: 0 });
  return !a.keys.includes(planKey) && Date.now() - a.at > ASK_COOLDOWN_MS;
}
export function markDallniAsked(planKey: string) {
  const a = ls.get<{ keys: string[]; at: number }>(ASK_KEY, { keys: [], at: 0 });
  ls.set(ASK_KEY, { keys: [...a.keys, planKey].slice(-50), at: Date.now() });
}

export async function saveAssistantFeedback(f: AssistantFeedback, planId?: string): Promise<StoreStatus["mode"]> {
  const uid = await ensureUser();
  const db = getBrowserSupabase();
  const isUuid = planId && /^[0-9a-f-]{36}$/i.test(planId);
  if (uid && db) {
    const { error } = await db
      .from("assistant_feedback")
      .insert({ user_id: uid, plan_id: isUuid ? planId : null, helpful: f.helpful, used_place: f.usedPlace, improvements: f.improvements });
    if (!error) return "supabase";
    console.error("assistant feedback", error);
  }
  ls.set("hudhud.assistantFeedback", [...ls.get<AssistantFeedback[]>("hudhud.assistantFeedback", []), f]);
  return "local";
}

export type DallniStats = {
  plans_started: number;
  responses: number;
  helpful_yes: number;
  helpful_partly: number;
  helpful_no: number;
  used_yes: number;
  used_no: number;
  used_not_yet: number;
  improvements: Record<string, number>;
  published_reviews: number;
};

/** Aggregate-only numbers from the database (no individual feedback is ever read). */
export async function loadDallniStats(): Promise<DallniStats | null> {
  const db = getBrowserSupabase();
  if (!db) return null;
  const { data, error } = await db.rpc("dallni_stats");
  return error ? null : (data as DallniStats);
}
