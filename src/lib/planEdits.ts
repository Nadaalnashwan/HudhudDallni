import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, TAG_LABELS } from "./catalog";
import { formatKm } from "./geo";
import type { ConstraintEdit, LatLng, ParsedRequest, Place, Plan, PlaceTag, Priority, StepSpec } from "./types";

/**
 * Turns a plan-change decision into planner input, and the planner's actual result into chat
 * text. Pure functions: the client runs them, the tests run them against the demo data.
 */

export const MAX_STOPS = 6;
export const HISTORY_LIMIT = 10;

/** The per-step part of the planner input (same shape as `BuildInput` in server/planner). */
export type StepInput = {
  steps: StepSpec[];
  keep: (Place | null)[];
  locked: boolean[];
  excluded: string[][];
  nearest?: boolean[];
  fallback?: ({ step: StepSpec; place: Place } | null)[];
  avoid?: string[];
  avoidNames?: string[];
  seen?: string[];
};

/** Plan-wide settings an edit may change. */
export type PlanSettings = { origin: LatLng; originLabel: string; district?: string; priority: Priority; tags: PlaceTag[] };

export const settingsOf = (p: Plan): PlanSettings => ({ origin: p.origin, originLabel: p.originLabel, district: p.district, priority: p.priority, tags: p.tags ?? [] });

const uniq = <T,>(l: T[]) => [...new Set(l)];

/** "النادي" / "الكوفي" — how a stop is referred to in chat. */
export const stopLabel = (s: StepSpec) => "ال" + CATEGORY_META[s.category].label;

/** "مطعم إيطالي" — the activity of a step. */
export const stepTypeLabel = (s: StepSpec) =>
  s.subcategory && !SUBCATEGORY_META[s.subcategory].label.includes(CATEGORY_META[s.category].label)
    ? `${CATEGORY_META[s.category].label} ${SUBCATEGORY_META[s.subcategory].label}`
    : CATEGORY_META[s.category].label;

export const samePlaces = (a: Plan, b: Plan) => a.stops.length === b.stops.length && a.stops.every((s, i) => s.place.id === b.stops[i].place.id);

/** Rebuild from stop i (the chat "غير الكوفي" / card "غيّره" path): earlier and locked later stops stay. */
export function replaceStopInput(plan: Plan, i: number, o: { place?: Place; exclude?: boolean; step?: Partial<StepSpec>; nearer?: boolean; onlyThis?: boolean }): StepInput {
  return {
    steps: plan.stops.map((s, j) => (j === i && o.step ? { ...s.step, ...o.step } : s.step)),
    // "بس" keeps everything after the changed stop; otherwise only locked stops survive.
    keep: plan.stops.map((s, j) => (j < i ? s.place : j === i ? o.place ?? null : s.locked || o.onlyThis ? s.place : null)),
    excluded: plan.stops.map((s, j) => (j === i && o.exclude ? [...s.excluded, s.place.id] : s.excluded)),
    locked: plan.stops.map((s, j) => (j === i ? false : s.locked)),
    nearest: plan.stops.map((_, j) => j === i && Boolean(o.nearer)),
    // no other candidate for a rebuilt stop: keep its place rather than dropping it
    fallback: plan.stops.map((s, j) => (j >= i ? { step: s.step, place: s.place } : null)),
  };
}

/**
 * "غيرلي الأماكن": same activities, a new place for every unlocked stop (every stop with includeLocked).
 * Each rebuilt stop excludes everything shown in the current plan; if a stop has no other
 * candidate it keeps its place (and the reply says so).
 */
export function replaceAllInput(plan: Plan, o: { includeLocked?: boolean; rejected?: string[]; seen?: string[] } = {}): StepInput {
  const current = plan.stops.map((s) => s.place.id);
  const stays = (s: Plan["stops"][number]) => s.locked && !o.includeLocked;
  return {
    steps: plan.stops.map((s) => s.step),
    keep: plan.stops.map((s) => (stays(s) ? s.place : null)),
    locked: plan.stops.map((s) => stays(s)),
    excluded: plan.stops.map((s) => (stays(s) ? s.excluded : uniq([...s.excluded, ...current]))),
    fallback: plan.stops.map((s) => (stays(s) ? null : { step: s.step, place: s.place })),
    avoid: o.rejected,
    avoidNames: plan.stops.filter((s) => !stays(s)).map((s) => s.place.name),
    seen: o.seen,
  };
}

/**
 * "سو لي خطة ثانية": a new itinerary. Locked stops survive (unless includeLocked) — on the first new
 * step of the same activity, or inserted at their old position. No current place is reused while
 * the data has other options.
 */
export function regenerateInput(plan: Plan, request: ParsedRequest | undefined, o: { includeLocked?: boolean; rejected?: string[]; seen?: string[] } = {}): StepInput & { settings: PlanSettings } {
  const base = settingsOf(plan);
  const req = request ?? { steps: plan.stops.map((s) => s.step), district: plan.district, priority: plan.priority, tags: base.tags };
  const tags = uniq(req.tags ?? []);
  const district = req.district && DISTRICTS[req.district] ? req.district : undefined;
  const settings: PlanSettings = district
    ? { origin: DISTRICTS[district], originLabel: `حي ${district}`, district, priority: req.priority ?? base.priority, tags }
    : { ...base, district: request ? undefined : base.district, priority: req.priority ?? base.priority, tags };
  const steps: StepSpec[] = req.steps.slice(0, MAX_STOPS).map((s) => ({ ...s, tags: uniq([...(s.tags ?? []), ...tags]) }));
  const keep: (Place | null)[] = steps.map(() => null);
  const locked = steps.map(() => false);
  if (!o.includeLocked) {
    plan.stops.forEach((s, j) => {
      if (!s.locked) return;
      const at = steps.findIndex((st, k) => !keep[k] && st.category === s.step.category);
      if (at >= 0) {
        steps[at] = s.step;
        keep[at] = s.place;
        locked[at] = true;
      } else if (steps.length < MAX_STOPS) {
        const pos = Math.min(j, steps.length);
        steps.splice(pos, 0, s.step);
        keep.splice(pos, 0, s.place);
        locked.splice(pos, 0, true);
      }
    });
  }
  const keptIds = keep.filter((p): p is Place => Boolean(p)).map((p) => p.id);
  return {
    steps,
    keep,
    locked,
    excluded: steps.map(() => []),
    avoid: uniq([...plan.stops.map((s) => s.place.id).filter((id) => !keptIds.includes(id)), ...(o.rejected ?? [])]),
    avoidNames: plan.stops.filter((s) => !keptIds.includes(s.place.id)).map((s) => s.place.name),
    seen: o.seen,
    settings,
  };
}

/** "أرخص" / "أهدأ" / "خليها بالملقا": rebuild the unlocked stops under the edited plan-wide settings. */
export function constraintsInput(plan: Plan, edit: ConstraintEdit, o: { rejected?: string[] } = {}): StepInput & { settings: PlanSettings } {
  const base = settingsOf(plan);
  const tags = uniq([...base.tags, ...(edit.addTags ?? [])]).filter((t) => !edit.removeTags?.includes(t));
  const district = edit.district && DISTRICTS[edit.district] ? edit.district : undefined;
  const settings: PlanSettings = {
    ...base,
    ...(district ? { origin: DISTRICTS[district], originLabel: `حي ${district}`, district } : {}),
    priority: edit.nearer ? "distance" : edit.priority ?? base.priority,
    tags,
  };
  const steps = plan.stops.map((s) => {
    if (s.locked) return s.step;
    const st: StepSpec = { ...s.step, tags: uniq([...(s.step.tags ?? []), ...(edit.addTags ?? [])]).filter((t) => !edit.removeTags?.includes(t)) };
    if (edit.women && st.category === "gym") st.subcategory = "women";
    return st;
  });
  return {
    steps,
    keep: plan.stops.map((s) => (s.locked ? s.place : null)),
    locked: plan.stops.map((s) => s.locked),
    excluded: plan.stops.map((s) => s.excluded),
    nearest: plan.stops.map((s) => Boolean(edit.nearer) && !s.locked),
    fallback: plan.stops.map((s) => (s.locked ? null : { step: s.step, place: s.place })),
    avoid: o.rejected,
    settings,
  };
}

/** Short Arabic summary of a constraint edit ("أرخص، حي الملقا"). */
export function describeEdit(edit: ConstraintEdit) {
  const parts: string[] = [];
  if (edit.nearer || edit.priority === "distance") parts.push("أقرب");
  else if (edit.priority === "rating") parts.push("أعلى تقييم");
  for (const t of edit.addTags ?? []) parts.push(t === "budget" ? "أرخص" : t === "quiet" ? "أهدأ" : TAG_LABELS[t]);
  if (edit.women) parts.push("نادي نسائي");
  if (edit.district) parts.push(`حي ${edit.district}`);
  return parts.join("، ");
}

const km = (s: Plan["stops"][number]) => formatKm(s.distanceFromPrevKm ?? 0);

/**
 * What actually changed between two plans with the same activities, stop by stop.
 * Never claims a change that did not happen.
 */
export function describeSameShapeChange(before: Plan, after: Plan, o: { headline: string; unchanged: string; includeLocked?: boolean; stillBest?: boolean }) {
  const lines: string[] = [];
  const kept: string[] = [];
  let changed = 0;
  after.stops.forEach((s, i) => {
    const old = before.stops[i];
    if (old && old.place.id === s.place.id) {
      if (old.locked && !o.includeLocked) kept.push(`${stopLabel(s.step)} مثبّت فما غيرته (${s.place.name})`);
      else if (o.stillBest) kept.push(`${stopLabel(s.step)} للحين الأنسب فخليته (${s.place.name})`);
      else kept.push(`ما لقيت بديل مناسب لل${CATEGORY_META[s.step.category].label}، فخليته ${s.place.name}`);
      return;
    }
    changed++;
    const name = old?.place.name === s.place.name ? `${s.place.name} (فرع ثاني)` : s.place.name;
    lines.push(`${i + 1}. ${stepTypeLabel(s.step)}: ${old ? `${old.place.name} ← ` : ""}${name}${i ? ` (${km(s)} عن ${s.anchorLabel})` : ""}`);
  });
  if (after.stops.length < before.stops.length) kept.push(`ما لقيت مكان لـ ${before.stops.slice(after.stops.length).map((s) => stepTypeLabel(s.step)).join("، ")}`);
  if (!changed) return { changed: false, text: [o.unchanged, ...kept].join("\n") };
  return { changed: true, text: [o.headline, ...lines, ...kept].join("\n") };
}

/** A new itinerary: list it, and say which places had to stay because nothing else fit. */
export function describeNewItinerary(before: Plan, after: Plan) {
  if (samePlaces(before, after)) return { changed: false, text: "ما قدرت أطلع بخطة مختلفة عن الحالية من الأماكن المتوفرة، فخليتها مثل ما هي." };
  const old = new Set(before.stops.map((s) => s.place.id));
  const oldNames = new Set(before.stops.map((s) => s.place.name));
  const note = (s: Plan["stops"][number]) => (old.has(s.place.id) ? (s.locked ? " — مثبّت" : " — ما فيه بديل له") : oldNames.has(s.place.name) ? " (فرع ثاني)" : "");
  const lines = after.stops.map((s, i) => `${i + 1}. ${stepTypeLabel(s.step)}: ${s.place.name}${note(s)}${i ? ` (${km(s)} عن ${s.anchorLabel})` : ""}`);
  return { changed: true, text: `سويت لك خطة جديدة بدال السابقة:\n${lines.join("\n")}` };
}

/** Result of a constraint edit, including requests the data could not meet. */
export function describeConstraintChange(before: Plan, after: Plan, edit: ConstraintEdit) {
  const what = describeEdit(edit);
  const d = describeSameShapeChange(before, after, {
    headline: `عدّلت الخطة${what ? ` (${what})` : ""}:`,
    unchanged: `الأماكن الحالية هي الأنسب${what ? ` لـ ${what}` : ""} من البيانات المتوفرة، فما تغيّر شيء.`,
    stillBest: true,
  });
  const missing = edit.women ? after.stops.filter((s) => s.step.category === "gym" && !s.locked && s.place.subcategory !== "women") : [];
  if (!missing.length) return d;
  return { ...d, text: `${d.text}\nما لقيت نادي نسائي مناسب، فخليت ${missing.map((s) => s.place.name).join("، ")}.` };
}
