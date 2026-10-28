import type { PreferenceUpdate, Preferences } from "./types";

/** Reasons the feedback UI offers; Gemini may only map a free-text note onto these. */
export const NEGATIVE_REASONS = ["الزحمة", "النظافة", "الأسعار", "الخدمة", "الموقع", "سبب آخر"];
export const POSITIVE_REASONS = ["المكان هادي", "الخدمة ممتازة", "الأسعار مناسبة", "مناسب للمذاكرة", "الأكل/القهوة لذيذة", "قريب ومناسب"];
export const FEEDBACK_REASONS = [...NEGATIVE_REASONS.filter((r) => r !== "سبب آخر"), ...POSITIVE_REASONS];

export type FeedbackAnalysis = { reasons: string[]; summary?: string; learned?: PreferenceUpdate; engine: "gemini" | "none" };

const union = <T,>(a: T[], b?: T[]) => [...new Set([...a, ...(b ?? [])])];

/** Merges a preference update (from chat or a feedback note) into saved preferences. */
export function mergePreferences(prefs: Preferences, u: PreferenceUpdate | undefined): Preferences {
  if (!u) return prefs;
  return {
    ...prefs,
    likes: union(prefs.likes, u.likes),
    avoid: union(prefs.avoid, u.avoid),
    neighborhoods: union(prefs.neighborhoods, u.neighborhoods),
    cuisines: union(prefs.cuisines, u.cuisines),
    cafeTypes: union(prefs.cafeTypes, u.cafeTypes),
    ...(u.budget ? { budget: u.budget } : {}),
    ...(u.distance ? { distance: u.distance } : {}),
  };
}
