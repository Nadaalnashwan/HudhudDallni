import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, subcategoriesOf } from "./catalog";
import type { AssistantResponse, Category, ParsedRequest, PlaceTag, Priority, StepSpec, Subcategory } from "./types";

/**
 * Rule-based understanding of Saudi-dialect requests. Used when Groq is not
 * configured, and as a safety net when the LLM returns something invalid.
 */

export type IntentContext = {
  planSteps: { category: Category; locked: boolean }[];
  pending?: Partial<ParsedRequest>;
};

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

const PREFIX = "(?:^|[\\s،,.؟?!:\\-←>])(?:و|ب|ل|ف)?(?:ال)?";

const CATEGORY_WORDS: Record<Category, string[]> = {
  gym: ["نادي", "جيم", "gym", "اتمرن", "تمرين"],
  cafe: ["كوفي", "قهوه", "كافيه", "كافي", "مقهي", "coffee", "cafe"],
  restaurant: ["مطعم", "اتغدي", "غدا", "اتعشي", "عشا", "اكل", "جوعان", "restaurant"],
  dessert: ["حلا", "حلي", "حلويات", "كيك", "ايس كريم", "ايسكريم"],
  park: ["حديقه", "منتزه", "ممشي", "امشي"],
  mall: ["مول", "تسوق", "مجمع تجاري"],
  entertainment: ["ترفيه", "العاب", "قيمز", "ملاهي"],
};

// A cuisine/type word alone ("أبي برجر") implies its category only where that is unambiguous.
const IMPLYING: Category[] = ["restaurant", "dessert", "entertainment"];
const STEP_SEPARATOR = /(بعده|بعدها|بعدين|ثم|وبعد)/;
const REFERENCE = /(?:^|\s)(من|عند|جنب|حول|قرب)\s*$/;

const TAG_WORDS: Record<PlaceTag, string[]> = {
  quiet: ["هادي", "هادئ", "هدوء", "رايق"],
  outdoor: ["خارجي", "خارجيه", "برا", "outdoor", "مكشوف"],
  family: ["عوائل", "عائلي", "اطفال", "عيال"],
  budget: ["رخيص", "اقتصادي", "ميزانيه", "سعر مناسب", "اسعار مناسبه"],
  work: ["اذاكر", "مذاكره", "شغل", "لابتوب", "اشتغل"],
  late: ["متاخر", "سهر", "اخر الليل"],
};

const ORDINALS: [RegExp, (n: number) => number][] = [
  [/(الاول|اول محطه|اول مكان)/, () => 0],
  [/(الثاني|ثاني)/, () => 1],
  [/(الثالث|ثالث)/, () => 2],
  [/(الرابع|رابع)/, () => 3],
  [/(الاخير|اخر مكان|اخر محطه)/, (n) => n - 1],
];

const firstMatch = (text: string, w: string) => new RegExp(PREFIX + normalize(w)).exec(text)?.index ?? -1;

export function findCategories(text: string): { category: Category; at: number }[] {
  const hits: { category: Category; at: number }[] = [];
  const add = (category: Category, words: string[]) => {
    for (const w of words) {
      // every occurrence, so "كوفي ... وبعده كوفي ثاني" yields two stops
      const re = new RegExp(PREFIX + normalize(w), "g");
      for (const m of text.matchAll(re)) {
        // "قريب من الكوفي" refers back to an earlier stop — it is not a new stop
        if (REFERENCE.test(text.slice(0, m.index! + 1))) continue;
        hits.push({ category, at: m.index! });
      }
    }
  };
  (Object.keys(CATEGORY_WORDS) as Category[]).forEach((c) => add(c, CATEGORY_WORDS[c]));
  (Object.keys(SUBCATEGORY_META) as Subcategory[]).forEach((s) => {
    const { category, words } = SUBCATEGORY_META[s];
    if (IMPLYING.includes(category)) add(category, words);
  });
  hits.sort((a, b) => a.at - b.at);
  // Merge repeated mentions of one category ("مطعم برجر") unless a separator ("وبعده") splits them.
  const out: { category: Category; at: number }[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && last.category === h.category && !STEP_SEPARATOR.test(text.slice(last.at, h.at))) continue;
    out.push(h);
  }
  return out;
}

/** The subcategory mentioned within one step's segment of the sentence, limited to that category. */
export function findSubcategory(segment: string, category: Category): Subcategory | undefined {
  let best: { s: Subcategory; at: number } | undefined;
  for (const s of subcategoriesOf(category))
    for (const w of SUBCATEGORY_META[s].words) {
      const at = firstMatch(segment, w);
      if (at >= 0 && (!best || at < best.at)) best = { s, at };
    }
  return best?.s;
}

export function findTags(text: string): PlaceTag[] {
  return (Object.keys(TAG_WORDS) as PlaceTag[]).filter((t) => TAG_WORDS[t].some((w) => text.includes(normalize(w))));
}

export function findDistrict(text: string): string | undefined {
  return Object.keys(DISTRICTS).find((d) => {
    const n = normalize(d);
    return text.includes(n) || text.includes(n.replace(/^ال/, " "));
  });
}

export function findPriority(text: string): Priority | undefined {
  if (/(ما يفرق|مايفرق|اي شي|عادي|الاثنين|كلهم)/.test(text)) return "balanced";
  if (/(الاقرب|اقرب|قريب مني|قريب لي|المسافه|مسافه)/.test(text)) return "distance";
  if (/(تقييم|الافضل|احسن|اعلي|افضل)/.test(text)) return "rating";
  return undefined;
}

function stepsFrom(text: string): StepSpec[] {
  const hits = findCategories(text);
  return hits.map(({ category, at }, i) => {
    const segment = text.slice(at, hits[i + 1]?.at ?? text.length);
    const step: StepSpec = { category };
    const sub = findSubcategory(segment, category);
    if (sub) step.subcategory = sub;
    if (category === "restaurant") {
      if (/(غدا|اتغدي)/.test(segment)) step.mealTime = "lunch";
      if (/(عشا|اتعشي)/.test(segment)) step.mealTime = "dinner";
    }
    return step;
  });
}

const label = (s: StepSpec) => (s.subcategory ? `${CATEGORY_META[s.category].label} ${SUBCATEGORY_META[s.subcategory].label}` : CATEGORY_META[s.category].label);

function targetIndex(text: string, ctx: IntentContext): number | undefined {
  // A named category ("غير الكوفي") wins over ordinals, since "ثاني" also means "another one".
  for (const c of findCategories(text)) {
    const i = ctx.planSteps.findIndex((s) => s.category === c.category);
    if (i >= 0) return i;
  }
  for (const [re, f] of ORDINALS) if (re.test(text)) return f(ctx.planSteps.length);
  if (ctx.planSteps.length === 1) return 0;
  return undefined;
}

const PLAN_IDEAS = [
  { label: "نادي ← كوفي ← مطعم", value: "نادي وبعده كوفي قريب منه وبعده مطعم قريب من الكوفي" },
  { label: "كوفي ← عشا", value: "كوفي وبعده عشا قريب منه" },
  { label: "غدا ← حلا", value: "أتغدى وبعدها حلا قريب" },
  { label: "حديقة ← كوفي", value: "ممشى وبعده كوفي قريب" },
];

export function parseWithRules(raw: string, ctx: IntentContext): AssistantResponse {
  const text = normalize(raw);
  const engine = "rules" as const;

  // 1) Plan edits
  if (ctx.planSteps.length) {
    const idx = targetIndex(text, ctx);
    const valid = idx !== undefined && idx >= 0 && idx < ctx.planSteps.length;
    if (/(فك التثبيت|لا تثبت|الغ التثبيت)/.test(text) && valid)
      return { engine, reply: "تمام، فكيت التثبيت.", action: { type: "modify", op: "unlock", index: idx! } };
    if (/ثبت/.test(text) && valid)
      return { engine, reply: "ثبّته لك، ما راح يتغير.", action: { type: "modify", op: "lock", index: idx! } };
    if (/(شيل|احذف|ما ابي)/.test(text) && valid)
      return { engine, reply: "شلته من الخطة وأعدت ترتيب الباقي.", action: { type: "modify", op: "remove", index: idx! } };
    if (valid) {
      const target = ctx.planSteps[idx!].category;
      const sub = findSubcategory(text, target);
      const onlyThis = /(بس|فقط|لحاله)$|\s(بس|فقط|لحاله)\s/.test(text);
      // "خل المطعم إيطالي": change the stop's type → a real DB filter on the new subcategory
      if (sub && /(خل|خلي|خليه|بدل|غير|حول|يصير|يكون)/.test(text))
        return {
          engine,
          reply: `أبشر، بخليه ${SUBCATEGORY_META[sub].label}${onlyThis ? "" : " وأحدّث اللي بعده"}.`,
          action: { type: "modify", op: "replace", index: idx!, step: { subcategory: sub }, onlyThis },
        };
      if (/(اقرب|قريب اكثر)/.test(text))
        return { engine, reply: "أبشر، بجيب لك خيار أقرب.", action: { type: "modify", op: "replace", index: idx!, nearer: true, onlyThis } };
      if (/(غير|بدل|ما عجبني|ماعجبني|غيره|ثاني غيره)/.test(text))
        return {
          engine,
          reply: onlyThis ? "أبشر، بغيّره هو بس وأخلي الباقي مثل ما هو." : "أبشر، بغيّره وأحدّث اللي بعده عشان يكون قريب منه.",
          action: { type: "modify", op: "replace", index: idx!, onlyThis },
        };
    }
    if (/(ضيف|اضف|زيد|زود|وبعدها|وبعده)/.test(text)) {
      const steps = stepsFrom(text);
      if (steps.length === 1) return { engine, reply: `ضفت ${label(steps[0])} آخر الخطة.`, action: { type: "add", step: { ...steps[0], tags: findTags(text) } } };
    }
  }

  const tags = findTags(text);
  const district = findDistrict(text);
  const priority = findPriority(text);
  let steps = stepsFrom(text);

  // 2) Answer to a previous clarifying question
  if (ctx.pending) {
    if (!steps.length)
      steps = (ctx.pending.steps ?? []).map((st) => ({ ...st, subcategory: st.subcategory ?? findSubcategory(text, st.category) }));
    const request: ParsedRequest = {
      steps,
      district: district ?? ctx.pending.district,
      priority: priority ?? ctx.pending.priority ?? "balanced",
      tags: [...new Set([...(ctx.pending.tags ?? []), ...tags])],
    };
    if (steps.length) return { engine, reply: "تمام، لقيت لك هالخيارات", action: { type: "plan", request } };
  }

  // 3) Fresh request
  if (!steps.length) {
    if (/(خطط|طلعه|مشوار|وين اروح|وش اسوي|طلعتي)/.test(text))
      return {
        engine,
        reply: "حياك! وش ودك تسوي بالطلعة؟ اكتبها بالترتيب أو اختر وحدة:",
        action: { type: "clarify", question: "وش ودك تسوي بالطلعة؟", options: PLAN_IDEAS, pending: { tags, district, priority } },
      };
    return {
      engine,
      reply: "ما فهمت عليك تمام قول لي وش تبي؟ مثلاً: «أبي كوفي هادي بالملقا» أو «نادي وبعده كوفي وبعده مطعم».",
      action: { type: "chat" },
    };
  }

  const request: ParsedRequest = { steps, district, priority, tags };
  if (steps.length === 1) {
    if (steps[0].category === "cafe" && !tags.length && !steps[0].subcategory)
      return {
        engine,
        reply: "وش نوع الكوفي اللي تبيه؟",
        action: {
          type: "clarify",
          question: "وش نوع الكوفي اللي تبيه؟",
          options: [
            { label: "هادي", value: "هادي" },
            { label: "قهوة مختصة", value: "مختصة" },
            { label: "للمذاكرة", value: "للمذاكرة" },
            { label: "درايف ثرو", value: "درايف ثرو" },
            { label: "ما يفرق", value: "ما يفرق" },
          ],
          pending: request,
        },
      };
    if (!priority && !district && !steps[0].subcategory)
      return {
        engine,
        reply: "تهمك المسافة أكثر أو التقييم؟",
        action: {
          type: "clarify",
          question: "تهمك المسافة أكثر أو التقييم؟",
          options: [
            { label: "الأقرب لي", value: "الأقرب" },
            { label: "الأعلى تقييم", value: "الأعلى تقييم" },
            { label: "ما يفرق", value: "ما يفرق" },
          ],
          pending: request,
        },
      };
  }
  const chain = steps.map(label).join(" ← ");
  return {
    engine,
    reply: steps.length > 1 ? `أبشر! بخطط لك: ${chain}، وكل محطة قريبة من اللي قبلها.` : "تمام، لقيت لك هالخيارات",
    action: { type: "plan", request: { ...request, priority: priority ?? "balanced" } },
  };
}
