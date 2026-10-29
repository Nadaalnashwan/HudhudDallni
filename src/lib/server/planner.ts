import "server-only";
import { nameMatches, nameMatchScore } from "../arabic";
import { anchorLabel, DISTRICTS, SUBCATEGORY_META, TAG_LABELS } from "../catalog";
import { formatKm, haversineKm } from "../geo";
import type { LatLng, Place, PlaceTag, PlanStop, Preferences, Priority, StepSpec } from "../types";
import { placesMode, searchPlaces } from "./places";

export type BuildInput = {
  steps: StepSpec[];
  origin: LatLng;
  originLabel: string;
  district?: string; // restricts the FIRST stop to this neighborhood
  priority: Priority;
  tags: PlaceTag[];
  preferences?: Preferences;
  /** Same length as steps; non-null entries keep that place (locked stops, chosen alternatives). */
  keep?: (Place | null)[];
  locked?: boolean[];
  excluded?: string[][];
  nearest?: boolean[]; // "أبي كوفي أقرب": pick the closest candidate for that step
  /** Plan-wide: never pick these ids for any step, unless a step would otherwise have no place at all. */
  avoid?: string[];
  /** Plan-wide: venue names to skip like `avoid` (another branch of a rejected chain is not a new place). */
  avoidNames?: string[];
  /** Plan-wide: places already shown this session; ranked after unseen ones ("give me something new"). */
  seen?: string[];
  /** Same length as steps; used only when a step has no eligible candidate (e.g. "replace all" ran out of options). */
  fallback?: ({ step: StepSpec; place: Place } | null)[];
};

const WEIGHTS: Record<Priority, { prox: number; rating: number }> = {
  distance: { prox: 0.6, rating: 0.2 },
  rating: { prox: 0.2, rating: 0.6 },
  balanced: { prox: 0.4, rating: 0.4 },
};

const anchorName = (place: Place) => anchorLabel(place.category, place.subcategory);

const learned = (input: BuildInput) => (input.preferences?.consent ? input.preferences : undefined);

function wantedTags(step: StepSpec, input: BuildInput): PlaceTag[] {
  return [...new Set([...(step.tags ?? []), ...input.tags, ...(learned(input)?.likes ?? [])])];
}

/** Deterministic score: proximity (Haversine) + rating + stated/learned preferences. */
function score(p: Place, anchor: LatLng, step: StepSpec, wanted: PlaceTag[], input: BuildInput) {
  const w = WEIGHTS[input.priority];
  const dist = haversineKm(anchor, p.location);
  const prox = Math.max(0, 1 - dist / 6);
  const rating = p.rating ? Math.min(1, Math.max(0, (p.rating - 3) / 2)) : 0.35;
  const pop = Math.min(1, Math.log10((p.ratingCount ?? 0) + 1) / 3.5) * 0.1;
  const tagMatch = wanted.length ? wanted.filter((t) => p.tags.includes(t)).length / wanted.length : 0;
  let s = w.prox * prox + w.rating * rating + 0.25 * tagMatch + pop;
  const prefs = learned(input);
  if (prefs) {
    // Learned tastes only nudge ranking when the user did not ask for a specific type.
    if (!step.subcategory && p.subcategory && [...prefs.cuisines, ...prefs.cafeTypes].includes(p.subcategory)) s += 0.15;
    if (p.district && prefs.neighborhoods.includes(p.district)) s += 0.05;
    if (prefs.budget === "low" && (p.priceLevel ?? 2) <= 1) s += 0.1;
    if (prefs.minRating && (p.rating ?? 0) < prefs.minRating) s -= 0.2;
  }
  if (p.openNow === false) s -= 0.15;
  return s;
}

/** Human-readable "why this place" — only claims what the data supports. */
function reasonFor(p: Place, step: StepSpec, anchorLabel: string, distKm: number, wanted: PlaceTag[], input: BuildInput) {
  const parts: string[] = [];
  if (step.placeName && nameMatches(p.name, step.placeName)) parts.push("اخترته أنت");
  if (step.subcategory) parts.push(SUBCATEGORY_META[step.subcategory].label);
  parts.push(`يبعد تقريباً ${formatKm(distKm)} عن ${anchorLabel}`);
  if (p.rating) parts.push(`تقييمه ${p.rating}${p.ratingCount ? ` (${p.ratingCount.toLocaleString("en-US")})` : ""}`);
  const prefs = learned(input);
  for (const t of wanted.filter((t) => p.tags.includes(t)))
    parts.push(prefs?.likes.includes(t) && !input.tags.includes(t) && !step.tags?.includes(t) ? `${TAG_LABELS[t]} (يناسب تفضيلاتك)` : TAG_LABELS[t]);
  if (prefs && !step.subcategory && p.subcategory && [...prefs.cuisines, ...prefs.cafeTypes].includes(p.subcategory))
    parts.push(`${SUBCATEGORY_META[p.subcategory].label} (من تفضيلاتك)`);
  // Only flag gaps for what the user asked for now — a learned taste is a nudge, not a requirement.
  const missing = [...new Set([...(step.tags ?? []), ...input.tags])].filter((t) => !p.tags.includes(t));
  if (missing.length) parts.push(`ما عندنا معلومة مؤكدة إنه ${missing.map((t) => TAG_LABELS[t]).join(" أو ")}`);
  return parts.join(" • ");
}

/**
 * Builds stops in the user's order. Every stop after the first is searched around
 * the PREVIOUS selected stop, so changing one stop re-anchors everything after it.
 * Errors from the place source propagate (no silent fallback to other data).
 */
export async function buildStops(input: BuildInput): Promise<PlanStop[]> {
  const stops: PlanStop[] = [];
  const used = new Set<string>();
  const avoid = new Set(input.avoid ?? []);
  const avoidNames = new Set(input.avoidNames ?? []);
  const seen = new Set(input.seen ?? []);
  const district = input.district && DISTRICTS[input.district] ? input.district : undefined;
  // Database and demo searches don't depend on the previous stop, so every step is fetched at once.
  // (Google Places searches near the previous stop, so it stays sequential.)
  const search = (step: StepSpec, neighborhood?: string, near?: LatLng) =>
    searchPlaces({ category: step.category, subcategory: step.subcategory, neighborhood, query: step.placeName, near: near ?? input.origin });
  const prefetched = placesMode() === "google" ? [] : await Promise.all(input.steps.map((step, i) => search(step, i === 0 ? district : undefined)));
  for (let i = 0; i < input.steps.length; i++) {
    const fallback = input.fallback?.[i];
    const prev = stops[stops.length - 1]?.place;
    const anchor = prev ? prev.location : input.origin;
    const anchorLabel = prev ? anchorName(prev) : input.originLabel;
    const excluded = input.excluded?.[i] ?? [];
    const kept = input.keep?.[i];
    const neighborhood = !prev ? district : undefined;

    // a prefetched list is reusable when it was fetched with the same district filter
    const candidates = prefetched[i] && (i === 0 ? district : undefined) === neighborhood ? prefetched[i] : await search(input.steps[i], neighborhood, anchor);

    const usable = (list: Place[]) => list.filter((p) => !excluded.includes(p.id) && !used.has(p.id) && p.id !== kept?.id);
    let eligible = usable(candidates);
    // The district has nothing new left for this stop: look just outside it instead of repeating a place.
    if (neighborhood && !kept && !eligible.some((p) => !avoid.has(p.id))) {
      const wider = usable(await search(input.steps[i], undefined, anchor)).filter((p) => !avoid.has(p.id));
      if (wider.length) eligible = wider;
    }
    // A plain "نادي" means a mixed gym; women-only gyms are picked only when asked for.
    if (input.steps[i].category === "gym" && !input.steps[i].subcategory) {
      const mixed = eligible.filter((p) => p.subcategory !== "women");
      if (mixed.length) eligible = mixed;
    }
    const fresh = eligible.filter((p) => !avoid.has(p.id));
    if (fresh.length) eligible = fresh;
    const otherNames = eligible.filter((p) => !avoidNames.has(p.name));
    if (otherNames.length) eligible = otherNames;
    // Nothing left for this step: keep what it had (when the caller allows it) instead of dropping the stop.
    const fallbackOnly = !kept && !eligible.length && fallback && !used.has(fallback.place.id);
    const step = fallbackOnly ? fallback.step : input.steps[i];
    const wanted = wantedTags(step, input);
    // A place the user named is wanted wherever it is; otherwise ("قريب من اللي قبله") keep each hop short.
    // Google already searched by that name, so its results are never narrowed by distance.
    const named = step.placeName ? eligible.filter((p) => nameMatches(p.name, step.placeName!)) : [];
    if (named.length) eligible = named;
    else if (!step.placeName || placesMode() !== "google") {
      for (const km of prev ? [3, 6, 12] : [6, 12]) {
        const near = eligible.filter((p) => haversineKm(anchor, p.location) <= km);
        if (near.length >= 2) {
          eligible = near;
          break;
        }
      }
    }
    const ranked = named.length
      ? eligible.sort((a, b) => nameMatchScore(b.name, step.placeName!) - nameMatchScore(a.name, step.placeName!) || haversineKm(anchor, a.location) - haversineKm(anchor, b.location))
      : input.nearest?.[i]
      ? eligible.sort((a, b) => haversineKm(anchor, a.location) - haversineKm(anchor, b.location))
      : eligible
          .map((p) => ({ p, s: score(p, anchor, step, wanted, input) }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.p);
    const pool = seen.size ? [...ranked.filter((p) => !seen.has(p.id)), ...ranked.filter((p) => seen.has(p.id))] : ranked;

    const place = kept ?? pool.shift() ?? (fallbackOnly ? fallback.place : undefined);
    if (!place) continue;
    used.add(place.id);
    const distKm = haversineKm(anchor, place.location);
    stops.push({
      step,
      place,
      alternatives: pool.slice(0, 4),
      excluded,
      locked: input.locked?.[i] ?? false,
      reason: reasonFor(place, step, anchorLabel, distKm, wanted, input),
      distanceFromPrevKm: distKm,
      anchorLabel,
    });
  }
  return stops;
}
