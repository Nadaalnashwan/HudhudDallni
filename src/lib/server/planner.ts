import "server-only";
import { CATEGORY_META, TAG_LABELS } from "../catalog";
import { formatKm, haversineKm } from "../geo";
import type { LatLng, Place, PlaceTag, PlanStop, Preferences, Priority, StepSpec } from "../types";
import { searchPlaces } from "./places";

export type BuildInput = {
  steps: StepSpec[];
  origin: LatLng;
  originLabel: string;
  priority: Priority;
  tags: PlaceTag[];
  preferences?: Preferences;
  /** Same length as steps; non-null entries keep that place (locked stops, chosen alternatives). */
  keep?: (Place | null)[];
  locked?: boolean[];
  excluded?: string[][];
};

const WEIGHTS: Record<Priority, { prox: number; rating: number }> = {
  distance: { prox: 0.6, rating: 0.2 },
  rating: { prox: 0.2, rating: 0.6 },
  balanced: { prox: 0.4, rating: 0.4 },
};

export const anchorName = (place: Place) => "ال" + CATEGORY_META[place.category].label;

function wantedTags(step: StepSpec, input: BuildInput): PlaceTag[] {
  const prefs = input.preferences?.consent ? input.preferences.likes : [];
  return [...new Set([...(step.tags ?? []), ...input.tags, ...prefs])];
}

function score(p: Place, anchor: LatLng, wanted: PlaceTag[], input: BuildInput) {
  const w = WEIGHTS[input.priority];
  const dist = haversineKm(anchor, p.location);
  const prox = Math.max(0, 1 - dist / 6);
  const rating = p.rating ? Math.min(1, Math.max(0, (p.rating - 3) / 2)) : 0.35;
  const pop = Math.min(1, Math.log10((p.ratingCount ?? 0) + 1) / 3.5) * 0.1;
  const tagMatch = wanted.length ? wanted.filter((t) => p.tags.includes(t)).length / wanted.length : 0;
  let s = w.prox * prox + w.rating * rating + 0.25 * tagMatch + pop;
  const minRating = input.preferences?.consent ? input.preferences.minRating : undefined;
  if (minRating && (p.rating ?? 0) < minRating) s -= 0.2;
  if (p.openNow === false) s -= 0.15;
  return s;
}

/** Human-readable "why this place" — only claims what the data supports. */
function reasonFor(p: Place, anchorLabel: string, distKm: number, wanted: PlaceTag[], input: BuildInput, userPicked: boolean) {
  const parts: string[] = [];
  if (userPicked) parts.push("اخترته أنت");
  parts.push(`يبعد ${formatKm(distKm)} عن ${anchorLabel}`);
  if (p.rating) parts.push(`تقييمه ${p.rating}${p.ratingCount ? ` من ${p.ratingCount.toLocaleString("ar-SA")} تقييم` : ""}`);
  const matched = wanted.filter((t) => p.tags.includes(t));
  const learned = input.preferences?.consent ? input.preferences.likes : [];
  for (const t of matched) parts.push(learned.includes(t) && !input.tags.includes(t) ? `${TAG_LABELS[t]} (يناسب تفضيلاتك السابقة)` : TAG_LABELS[t]);
  const missing = wanted.filter((t) => !p.tags.includes(t));
  if (missing.length) parts.push(`ما عندنا معلومة مؤكدة إنه ${missing.map((t) => TAG_LABELS[t]).join(" أو ")}`);
  return parts.join(" • ");
}

export async function buildStops(input: BuildInput): Promise<PlanStop[]> {
  const stops: PlanStop[] = [];
  const used = new Set<string>();
  for (let i = 0; i < input.steps.length; i++) {
    const step = input.steps[i];
    const prev = stops[stops.length - 1]?.place;
    const anchor = prev ? prev.location : input.origin;
    const anchorLabel = prev ? anchorName(prev) : input.originLabel;
    const excluded = input.excluded?.[i] ?? [];
    const wanted = wantedTags(step, input);
    const kept = input.keep?.[i];

    let candidates: Place[] = [];
    try {
      candidates = await searchPlaces({ category: step.category, query: step.placeName ?? step.query, near: anchor, radiusKm: i === 0 ? 5 : 2.5 });
      if (candidates.length < 3 && !step.placeName)
        candidates = await searchPlaces({ category: step.category, query: step.query, near: anchor, radiusKm: 8 });
    } catch (e) {
      console.error(e);
    }
    let eligible = candidates.filter((p) => !excluded.includes(p.id) && !used.has(p.id) && p.id !== kept?.id);
    // "قريب من اللي قبله": chained stops stay within a short hop when the data allows it.
    if (prev && !step.placeName) {
      for (const km of [3, 6]) {
        const near = eligible.filter((p) => haversineKm(anchor, p.location) <= km);
        if (near.length >= 2) {
          eligible = near;
          break;
        }
      }
    }
    const pool = eligible
      .map((p) => ({ p, s: score(p, anchor, wanted, input) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);

    const place = kept ?? pool.shift();
    if (!place) continue;
    used.add(place.id);
    const distKm = haversineKm(anchor, place.location);
    stops.push({
      step,
      place,
      alternatives: pool.slice(0, 4),
      excluded,
      locked: input.locked?.[i] ?? false,
      reason: reasonFor(place, anchorLabel, distKm, wanted, input, Boolean(step.placeName)),
      distanceFromPrevKm: distKm,
      anchorLabel,
    });
  }
  return stops;
}
