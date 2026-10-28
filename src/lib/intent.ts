import { CATEGORY_META, DISTRICTS } from "./catalog";
import type { AssistantResponse, Category, ParsedRequest, PlaceTag, Priority, StepSpec } from "./types";

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
};

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

export function findCategories(text: string): { category: Category; at: number; word: string }[] {
  const hits: { category: Category; at: number; word: string }[] = [];
  (Object.keys(CATEGORY_WORDS) as Category[]).forEach((category) => {
    for (const w of CATEGORY_WORDS[category]) {
      const m = new RegExp(PREFIX + normalize(w)).exec(text);
      if (m) hits.push({ category, at: m.index, word: w });
    }
  });
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set<Category>();
  return hits.filter((h) => (seen.has(h.category) ? false : (seen.add(h.category), true)));
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
  return findCategories(text).map(({ category }) => {
    const step: StepSpec = { category };
    if (category === "restaurant") {
      if (/(غدا|اتغدي)/.test(text)) step.mealTime = "lunch";
      if (/(عشا|اتعشي)/.test(text)) step.mealTime = "dinner";
    }
    return step;
  });
}

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
    if (/(شيل|احذف|الغ|ما ابي)/.test(text) && valid)
      return { engine, reply: "شلته من الخطة وأعدت ترتيب الباقي.", action: { type: "modify", op: "remove", index: idx! } };
    if (/(غير|بدل|ما عجبني|ماعجبني|غيره|ثاني غيره)/.test(text) && valid)
      return { engine, reply: "أبشر، بغيّره وأحدّث اللي بعده عشان يكون قريب منه.", action: { type: "modify", op: "replace", index: idx! } };
    if (/(ضيف|اضف|زيد|زود|وبعدها|وبعده)/.test(text)) {
      const steps = stepsFrom(text);
      if (steps.length === 1) return { engine, reply: `ضفت ${CATEGORY_META[steps[0].category].label} آخر الخطة.`, action: { type: "add", step: { ...steps[0], tags: findTags(text) } } };
    }
  }

  const tags = findTags(text);
  const district = findDistrict(text);
  const priority = findPriority(text);
  let steps = stepsFrom(text);

  // 2) Answer to a previous clarifying question
  if (ctx.pending) {
    if (!steps.length) steps = ctx.pending.steps ?? [];
    const request: ParsedRequest = {
      steps,
      district: district ?? ctx.pending.district,
      priority: priority ?? ctx.pending.priority ?? "balanced",
      tags: [...new Set([...(ctx.pending.tags ?? []), ...tags])],
    };
    if (steps.length) return { engine, reply: "تمام، لقيت لك هالخيارات 👇", action: { type: "plan", request } };
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
      reply: "ما فهمت عليك تمام 😅 قول لي وش تبي؟ مثلاً: «أبي كوفي هادي بالملقا» أو «نادي وبعده كوفي وبعده مطعم».",
      action: { type: "chat" },
    };
  }

  const request: ParsedRequest = { steps, district, priority, tags };
  if (steps.length === 1) {
    if (steps[0].category === "cafe" && !tags.length)
      return {
        engine,
        reply: "تفضل كوفي هادي أو فيه جلسات خارجية؟",
        action: {
          type: "clarify",
          question: "تفضل كوفي هادي أو فيه جلسات خارجية؟",
          options: [
            { label: "هادي", value: "هادي" },
            { label: "جلسات خارجية", value: "جلسات خارجية" },
            { label: "ما يفرق", value: "ما يفرق" },
          ],
          pending: request,
        },
      };
    if (!priority && !district)
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
  const chain = steps.map((s) => CATEGORY_META[s.category].label).join(" ← ");
  return {
    engine,
    reply: steps.length > 1 ? `أبشر! بخطط لك: ${chain}، وكل محطة قريبة من اللي قبلها.` : "تمام، لقيت لك هالخيارات 👇",
    action: { type: "plan", request: { ...request, priority: priority ?? "balanced" } },
  };
}
