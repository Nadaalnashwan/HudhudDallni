"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Plan, Preferences, Review, Visit } from "./types";

/**
 * Persistence for our own Hudhud data (plans, preferences, reviews).
 * Uses Supabase when configured, otherwise the browser's localStorage (Demo Mode).
 * Reviews here are our app's reviews — never sent to Google.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let client: SupabaseClient | null = null;
const db = () => (url && anon ? (client ??= createClient(url, anon)) : null);
export const storeMode = () => (url && anon ? "supabase" : "local");

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

export const DEFAULT_PREFS: Preferences = { consent: false, likes: [], avoid: [], notes: [] };

export function getUserId(): string {
  let id = ls.get<string | null>("hudhud.userId", null);
  if (!id) {
    id = crypto.randomUUID();
    ls.set("hudhud.userId", id);
  }
  return id;
}

export async function loadPreferences(): Promise<Preferences> {
  const local = ls.get<Preferences>("hudhud.prefs", DEFAULT_PREFS);
  const d = db();
  if (!d) return local;
  const { data } = await d.from("preferences").select("data").eq("user_id", getUserId()).maybeSingle();
  return (data?.data as Preferences) ?? local;
}

export async function savePreferences(p: Preferences) {
  ls.set("hudhud.prefs", p);
  const d = db();
  if (d) await d.from("preferences").upsert({ user_id: getUserId(), data: p, consent: p.consent, updated_at: new Date().toISOString() });
}

export async function savePlan(plan: Plan) {
  ls.set("hudhud.lastPlan", plan);
  const d = db();
  if (d)
    await d.from("plans").upsert({
      id: plan.id,
      user_id: getUserId(),
      stops: plan.stops.map((s) => ({ category: s.step.category, placeId: s.place.id, name: s.place.name, locked: s.locked })),
      started_at: plan.startedAt ?? null,
    });
}

export const loadLastPlan = () => ls.get<Plan | null>("hudhud.lastPlan", null);

export const loadVisits = () => ls.get<Visit[]>("hudhud.visits", []);
export async function saveVisits(v: Visit[]) {
  ls.set("hudhud.visits", v);
}
export async function recordVisit(v: Visit) {
  const d = db();
  if (d) await d.from("visits").insert({ user_id: getUserId(), plan_id: v.planId, place_id: v.placeId, place_name: v.placeName, status: v.status });
}

export async function publishReview(r: Review) {
  const all = ls.get<Review[]>("hudhud.reviews", []);
  ls.set("hudhud.reviews", [r, ...all]);
  const d = db();
  if (d) {
    const { error } = await d.from("reviews").insert({
      id: r.id,
      user_id: r.userId,
      place_id: r.placeId,
      place_name: r.placeName,
      rating: r.rating,
      experience: r.experience,
      reasons: r.reasons,
      body: r.body,
    });
    if (error) throw error;
  }
}

export async function listReviews(placeId: string): Promise<Review[]> {
  const d = db();
  if (d) {
    const { data } = await d.from("reviews").select("*").eq("place_id", placeId).order("created_at", { ascending: false });
    if (data)
      return data.map((x) => ({
        id: x.id,
        placeId: x.place_id,
        placeName: x.place_name,
        rating: x.rating,
        experience: x.experience,
        reasons: x.reasons ?? [],
        body: x.body,
        createdAt: x.created_at,
        userId: x.user_id,
      }));
  }
  return ls.get<Review[]>("hudhud.reviews", []).filter((r) => r.placeId === placeId);
}
