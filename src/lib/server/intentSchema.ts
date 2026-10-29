import { z } from "zod";
import { areaCenter, CATEGORY_META, DISTRICTS, SUBCATEGORY_META, TAG_LABELS } from "../catalog";
import type { IntentContext } from "../intent";
import { MAX_STOPS } from "../planEdits";
import type { AssistantAction, Category, ClarifyOption, ConstraintEdit, ParsedRequest, PlaceTag, PreferenceUpdate, StepSpec, Subcategory } from "../types";

/**
 * The model's structured output. Labels are internal; users never type them. The vocabulary
 * (categories, subcategories, tags, districts) comes from the catalog, never a hard-coded list.
 * Parsing has two stages: the Zod shape, then deterministic checks against the current plan.
 * Anything that fails either returns null and the caller falls back to the rules.
 */
export const INTENTS = [
  "create_plan",
  "replace_entire_plan",
  "replace_all_places",
  "replace_single_stop",
  "edit_plan_constraints",
  "add_stop",
  "remove_stop",
  "lock_stop",
  "unlock_stop",
  "search_places",
  "clarify_request",
  "undo_plan_change",
  "chat",
] as const;
export type Intent = (typeof INTENTS)[number];

const CATS = Object.keys(CATEGORY_META) as Category[];
const SUBS = Object.keys(SUBCATEGORY_META) as Subcategory[];
const TAGS = Object.keys(TAG_LABELS) as PlaceTag[];

const text = z.string().trim();
const optText = text.nullish();
const strings = z.array(z.string()).nullish();
const index = z.number().int().nullish();
const flag = z.boolean().nullish();

const StepSchema = z.object({
  category: z.string().nullish(),
  subcategory: z.string().nullish(),
  placeName: optText,
  tags: strings,
  district: optText,
});
const RequestSchema = z.object({
  steps: z.array(StepSchema).nullish(),
  district: optText,
  priority: z.enum(["distance", "rating", "balanced"]).nullish(),
  tags: strings,
  avoidTags: strings,
  spread: flag,
});
const ConstraintsSchema = z.object({
  district: optText,
  priority: z.enum(["distance", "rating", "balanced"]).nullish(),
  addTags: strings,
  removeTags: strings,
  women: flag,
  nearer: flag,
  avoidTags: strings,
  spread: flag,
});
const LearnedSchema = z.object({
  likes: strings,
  avoid: strings,
  cuisines: strings,
  cafeTypes: strings,
  neighborhoods: strings,
  budget: z.string().nullish(),
  distance: z.string().nullish(),
});

export const GeminiOutputSchema = z.object({
  reply: optText,
  intent: z.enum(INTENTS),
  index,
  after: index,
  step: StepSchema.nullish(),
  request: RequestSchema.nullish(),
  constraints: ConstraintsSchema.nullish(),
  nearer: flag,
  onlyThis: flag,
  includeLocked: flag,
  question: optText,
  options: z.array(z.object({ label: optText, value: optText })).nullish(),
  pending: RequestSchema.nullish(),
  learned: LearnedSchema.nullish(),
});
export type GeminiOutput = z.infer<typeof GeminiOutputSchema>;

type RawStep = z.infer<typeof StepSchema>;
type RawRequest = z.infer<typeof RequestSchema>;

class Invalid extends Error {}
function fail(why: string): never {
  throw new Invalid(why);
}

const isCat = (c: unknown): c is Category => CATS.includes(c as Category);
const isSub = (s: unknown): s is Subcategory => SUBS.includes(s as Subcategory);
const cleanTags = (t?: string[] | null) => (t ?? []).filter((x): x is PlaceTag => TAGS.includes(x as PlaceTag));
const nonEmpty = (v?: string | null) => (v ? v : undefined);

/** A subcategory must belong to its category; a made-up or mismatched one rejects the output. */
function checkSub(category: Category, sub?: string | null): Subcategory | undefined {
  if (!sub) return undefined;
  if (!isSub(sub) || SUBCATEGORY_META[sub].category !== category) fail(`subcategory ${sub} does not belong to ${category}`);
  return sub as Subcategory;
}

function checkStep(s: RawStep): StepSpec {
  if (!isCat(s.category)) fail(`unknown category ${s.category}`);
  const category = s.category as Category;
  const step: StepSpec = { category, subcategory: checkSub(category, s.subcategory), placeName: nonEmpty(s.placeName), tags: cleanTags(s.tags) };
  if (s.district && areaCenter(s.district)) step.district = s.district;
  return step;
}

function checkRequest(r: RawRequest | null | undefined, required: boolean): ParsedRequest | undefined {
  const steps = r?.steps ?? [];
  if (!steps.length) return required ? fail("request without steps") : undefined;
  if (steps.length > MAX_STOPS) fail(`more than ${MAX_STOPS} stops`);
  return {
    steps: steps.map(checkStep),
    district: r?.district && DISTRICTS[r.district] ? r.district : undefined,
    priority: r?.priority ?? "balanced",
    tags: cleanTags(r?.tags).filter((t) => !cleanTags(r?.avoidTags).includes(t)),
    ...(cleanTags(r?.avoidTags).length ? { avoidTags: cleanTags(r?.avoidTags) } : {}),
    ...(r?.spread ? { spread: true } : {}),
  };
}

/** Lenient: a half-understood clarification still carries what was understood. */
function pendingOf(r: RawRequest | null | undefined): Partial<ParsedRequest> {
  const steps = (r?.steps ?? []).filter((s) => isCat(s.category)).slice(0, MAX_STOPS);
  const out: Partial<ParsedRequest> = {};
  if (steps.length)
    out.steps = steps.map((s) => {
      const category = s.category as Category;
      const sub = s.subcategory && isSub(s.subcategory) && SUBCATEGORY_META[s.subcategory].category === category ? s.subcategory : undefined;
      return { category, subcategory: sub, placeName: nonEmpty(s.placeName), tags: cleanTags(s.tags) };
    });
  if (r?.district && DISTRICTS[r.district]) out.district = r.district;
  if (r?.priority) out.priority = r.priority;
  out.tags = cleanTags(r?.tags);
  return out;
}

function checkIndex(i: number | null | undefined, ctx: IntentContext): number {
  if (i === null || i === undefined || i < 0 || i >= ctx.planSteps.length) fail(`index ${i} outside the plan (${ctx.planSteps.length} stops)`);
  return i as number;
}

const needPlan = (ctx: IntentContext) => {
  if (!ctx.planSteps.length) fail("plan change without a plan");
};

/** Zod-parsed output → an action that is safe to execute on this plan. Throws Invalid otherwise. */
function toActionStrict(o: GeminiOutput, ctx: IntentContext): AssistantAction {
  const n = ctx.planSteps.length;
  switch (o.intent) {
    case "create_plan":
    case "search_places":
      return { type: "plan", request: checkRequest(o.request, true)! };
    case "replace_entire_plan": {
      needPlan(ctx);
      // Without a usable new request, rebuild the same activities (still with every current place excluded).
      const request = checkRequest(o.request, false);
      return { type: "regenerate", request, includeLocked: o.includeLocked === true };
    }
    case "replace_all_places":
      needPlan(ctx);
      return { type: "replace_all", includeLocked: o.includeLocked === true };
    case "replace_single_stop": {
      const i = checkIndex(o.index, ctx);
      const current = ctx.planSteps[i];
      const raw = o.step;
      let step: Partial<StepSpec> | undefined;
      if (raw) {
        if (raw.category && !isCat(raw.category)) fail(`unknown category ${raw.category}`);
        const category = (raw.category as Category | undefined) ?? current.category;
        const subcategory = checkSub(category, raw.subcategory);
        const tags = cleanTags(raw.tags);
        const placeName = nonEmpty(raw.placeName);
        // changing the activity resets its type unless a matching one was given
        if (category !== current.category) step = { category, subcategory };
        else if (subcategory) step = { subcategory };
        if (tags.length) step = { ...step, tags };
        if (placeName) step = { ...step, placeName };
      }
      return { type: "modify", op: "replace", index: i, step, nearer: o.nearer === true, onlyThis: o.onlyThis === true };
    }
    case "edit_plan_constraints": {
      needPlan(ctx);
      const c = o.constraints;
      const edit: ConstraintEdit = {};
      if (c?.district) {
        if (!DISTRICTS[c.district]) fail(`unknown district ${c.district}`);
        edit.district = c.district;
      }
      if (c?.priority) edit.priority = c.priority;
      if (cleanTags(c?.addTags).length) edit.addTags = cleanTags(c?.addTags);
      if (cleanTags(c?.removeTags).length) edit.removeTags = cleanTags(c?.removeTags);
      if (c?.women) edit.women = true;
      if (cleanTags(c?.avoidTags).length) edit.avoidTags = cleanTags(c?.avoidTags);
      if (c?.spread) edit.spread = true;
      if (c?.nearer || o.nearer) edit.nearer = true;
      if (!Object.keys(edit).length) fail("empty constraint edit");
      return { type: "constraints", edit };
    }
    case "add_stop": {
      if (n >= MAX_STOPS) fail(`plan already has ${MAX_STOPS} stops`);
      if (!o.step) fail("add without a step");
      const after = o.after === null || o.after === undefined ? undefined : o.after;
      if (after !== undefined && (after < 0 || after >= n)) fail(`after ${after} outside the plan`);
      return { type: "add", step: checkStep(o.step!), after };
    }
    case "remove_stop":
      return { type: "modify", op: "remove", index: checkIndex(o.index, ctx) };
    case "lock_stop":
      return { type: "modify", op: "lock", index: checkIndex(o.index, ctx) };
    case "unlock_stop":
      return { type: "modify", op: "unlock", index: checkIndex(o.index, ctx) };
    case "clarify_request": {
      const question = nonEmpty(o.question);
      if (!question) fail("clarify without a question");
      const options: ClarifyOption[] = (o.options ?? [])
        .map((x) => ({ label: nonEmpty(x.label), value: nonEmpty(x.value) ?? nonEmpty(x.label) }))
        .filter((x): x is ClarifyOption => Boolean(x.label && x.value))
        .slice(0, 5);
      return { type: "clarify", question: question!, options, pending: pendingOf(o.pending) };
    }
    case "undo_plan_change":
      return ctx.canUndo ? { type: "undo" } : { type: "chat" };
    case "chat":
      return { type: "chat" };
  }
}

export type ValidatedOutput = { action: AssistantAction; reply?: string; learned?: PreferenceUpdate };

/** Validates the model's JSON. Returns null (with the reason) when it must not be used. */
export function validateOutput(raw: unknown, ctx: IntentContext): { ok: true; value: ValidatedOutput } | { ok: false; reason: string } {
  const parsed = GeminiOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  try {
    const action = toActionStrict(parsed.data, ctx);
    return { ok: true, value: { action, reply: nonEmpty(parsed.data.reply), learned: toLearned(parsed.data.learned) } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: e.message };
    throw e;
  }
}

function toLearned(l: GeminiOutput["learned"]): PreferenceUpdate | undefined {
  if (!l) return undefined;
  const subs = (v: string[] | null | undefined, c: Category) => (v ?? []).filter((x): x is Subcategory => isSub(x) && SUBCATEGORY_META[x].category === c);
  const out: PreferenceUpdate = {
    likes: cleanTags(l.likes),
    avoid: (l.avoid ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 5),
    cuisines: subs(l.cuisines, "restaurant"),
    cafeTypes: subs(l.cafeTypes, "cafe"),
    neighborhoods: (l.neighborhoods ?? []).filter((d) => Boolean(DISTRICTS[d])),
    budget: l.budget === "low" ? "low" : undefined,
    distance: l.distance === "distance" || l.distance === "rating" ? l.distance : undefined,
  };
  const any = Object.values(out).some((v) => (Array.isArray(v) ? v.length : v));
  return any ? out : undefined;
}

/** Actions that change the plan; their chat text must come from the planner's actual result. */
export const changesPlan = (a: AssistantAction) =>
  a.type === "plan" || a.type === "replace_all" || a.type === "regenerate" || a.type === "constraints" || a.type === "add" || a.type === "undo" || (a.type === "modify" && (a.op === "replace" || a.op === "remove"));
