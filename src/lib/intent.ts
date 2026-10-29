import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, subcategoriesOf, TAG_LABELS } from "./catalog";
import { RIYADH_CENTER } from "./geo";
import type { AssistantResponse, Category, ConstraintEdit, ParsedRequest, PlaceTag, Priority, StepSpec, Subcategory } from "./types";

/**
 * Rule-based understanding of Saudi-dialect requests. Used when Gemini is not
 * configured, and as a safety net when the LLM is unavailable or returns something invalid.
 * When a plan-change request is unclear it asks instead of guessing.
 */

export type PlanStepContext = {
  category: Category;
  subcategory?: Subcategory;
  locked: boolean;
  name?: string; // place name
  placeId?: string;
  distanceKm?: number; // from the previous stop (or the start)
};

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type IntentContext = {
  planSteps: PlanStepContext[];
  pending?: Partial<ParsedRequest>;
  plan?: { district?: string; priority?: Priority; tags?: PlaceTag[] };
  goal?: string; // the user's words that created the current plan
  history?: ChatTurn[]; // recent turns, oldest first
  rejectedIds?: string[]; // places the user already turned down this session
  canUndo?: boolean;
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه");

const PREFIX = "(?:^|[\\s،,.؟?!:\\-←>])(?:و|ب|ل|ف)?(?:ال)?";

// Singulars, broken plurals ("مطاعم"، "مقاهي"، "نوادي"), verbs ("اتعشى"، "اتسوق") and English, normalized.
const CATEGORY_WORDS: Record<Category, string[]> = {
  gym: ["نادي", "نوادي", "انديه", "جيم", "gym", "اتمرن", "تمرين", "تمارين", "اتدرب", "workout", "fitness"],
  cafe: ["كوفي", "قهوه", "قهاوي", "كافيه", "كافي", "مقهي", "مقاهي", "اتقهوي", "coffee", "cafe", "café"],
  restaurant: [
    "مطعم", "مطاعم", "اتغدي", "غدا", "اتعشي", "عشا", "اكل", "جوعان", "جعان", "وجبه", "وجبات", "طعام",
    "افطر", "فطور", "فطار", "افطار", "ريوق", "اتريق", "restaurant", "food", "dinner", "lunch", "breakfast", "eat",
  ],
  dessert: ["حلا", "حلي", "حلويات", "شي حلو", "كيك", "ايس كريم", "ايسكريم", "دونات", "كنافه", "بقلاوه", "وافل", "كريب", "dessert", "sweets"],
  park: ["حديقه", "حدايق", "منتزه", "ممشي", "امشي", "اتمشي", "تمشيه", "park", "walk"],
  mall: ["مول", "تسوق", "اتسوق", "مجمع تجاري", "مجمعات تجاريه", "سوق", "اسواق", "mall", "shopping"],
  entertainment: ["ترفيه", "العاب", "قيمز", "ملاهي", "بولينج", "بولنج", "فعاليات", "entertainment", "fun"],
  laundry: ["مغسله", "مغاسل", "مصبغه", "غسيل", "laundry"],
  mosque: ["مسجد", "مساجد", "جامع", "جوامع", "مصلي", "اصلي", "صلاه", "mosque"],
  sports: ["ملعب", "ملاعب", "stadium"],
  education: ["مدرسه", "مدارس", "كليه", "كليات", "معهد", "معاهد", "school", "college"],
  transport: ["مترو", "محطه", "محطات", "قطار", "metro", "train", "station", "subway"],
  government: ["وزاره", "وزارات", "ministry", "جهه حكوميه"],
};

// A cuisine/type word alone ("أبي برجر", "أبي بادل") implies its category only where that is unambiguous.
const IMPLYING: Category[] = ["restaurant", "dessert", "entertainment", "laundry", "mosque", "sports", "education", "transport", "government"];
// Words that must end where the word ends: "جامع" (mosque) is not the start of "جامعه" (university).
const WHOLE_WORDS = new Set(["جامع", "سوق", "اصلي", "eat", "walk", "fun"]);
const wordRe = (w: string, flags?: string) => new RegExp(PREFIX + normalize(w) + (WHOLE_WORDS.has(w) ? "(?![\\u0621-\\u064A])" : ""), flags);
const STEP_SEPARATOR = /(بعده|بعدها|بعدين|ثم|وبعد|then|after)/;
const REFERENCE = /(?:^|\s)(من|عند|جنب|حول|قرب|بعد|قبل)\s*$/;

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

const firstMatch = (text: string, w: string) => wordRe(w).exec(text)?.index ?? -1;

function findCategories(text: string): { category: Category; at: number }[] {
  const hits: { category: Category; at: number }[] = [];
  const add = (category: Category, words: string[]) => {
    for (const w of words) {
      // every occurrence, so "كوفي ... وبعده كوفي ثاني" yields two stops
      const re = wordRe(w, "g");
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
    // "نادي بادل" is a padel club, not a gym followed by a court
    if (last?.category === "gym" && h.category === "sports" && /^\s*\S+\s*$/.test(text.slice(last.at, h.at)) && !text.slice(h.at).trimStart().startsWith("و")) {
      out[out.length - 1] = h;
      continue;
    }
    out.push(h);
  }
  return out;
}

// Types people usually ask for by name: "جامعة الملك سعود", "أكاديمية طويق", "وزارة التعليم", "النخيل مول".
const NAMED_SUBS: Subcategory[] = ["university", "academy", "ministry"];
const TYPE_NOUNS = new Set(["جامعه", "جامعات", "اكاديميه", "اكاديميات", "اكادميه", "وزاره", "وزارات", "مول", "مولات", "مجمع", "تجاري"]);
const NAME_STOP = new Set(
  ("قريب قريبه اقرب الاقرب مني منه منها لي في فيه حي بحي عند جنب من الي علي وبعده وبعدها بعده بعدها بعدين ثم و او " +
    "تقييم تقييمه افضل احسن الحين اليوم بس فقط لو سمحت ابي ابغي ابغا ابا ودي ودني وديني عطني اعطني اروح نروح روح خذني دلني وين ممكن").split(" "),
);
const bare = (t: string) => t.replace(/^[وبلف](?=ال)/, "").replace(/^ال(?=\S{2})/, "");
const isDistrict = (t: string) => Object.keys(DISTRICTS).some((d) => bare(normalize(d)) === bare(t));
const nameWord = (t: string) => !NAME_STOP.has(t) && !NAME_STOP.has(bare(t)) && !isDistrict(t);
const words = (s: string) => s.split(/[\s،,.؟?!:\-←>]+/).filter(Boolean);

/** The name the user gave for a stop, e.g. "التعليم" in "أبي وزارة التعليم". Only for types usually asked for by name. */
function findPlaceName(segment: string, before: string, category: Category, sub?: Subcategory): string | undefined {
  if (category !== "mall" && !(sub && NAMED_SUBS.includes(sub))) return undefined;
  const after = words(segment);
  while (after.length && TYPE_NOUNS.has(bare(after[0]))) after.shift();
  const name: string[] = [];
  for (const t of after) {
    if (!nameWord(t) || name.length === 4) break;
    name.push(t);
  }
  // "النخيل مول": a mall's name usually comes first
  if (!name.length && category === "mall")
    for (const t of words(before).reverse()) {
      if (!nameWord(t) || findCategories(` ${t}`).length || name.length === 2) break;
      name.unshift(t);
    }
  return name.length ? name.join(" ") : undefined;
}

/** The subcategory mentioned within one step's segment of the sentence, limited to that category. */
function findSubcategory(segment: string, category: Category): Subcategory | undefined {
  let best: { s: Subcategory; at: number } | undefined;
  for (const s of subcategoriesOf(category))
    for (const w of SUBCATEGORY_META[s].words) {
      const at = firstMatch(segment, w);
      if (at >= 0 && (!best || at < best.at)) best = { s, at };
    }
  return best?.s;
}

/** "ما أحب الأماكن الهادية"، "بدون مكان هادي": a tag word right after a negation is something to avoid. */
const NEGATION = "(^|\\s)(ما|مو|مب|لا|بدون|اكره|مابي|ماابي|ماحب|مااحب|مابغي|ماني)\\s+(\\S+\\s+){0,2}\\S*";
function negatedTags(text: string): PlaceTag[] {
  return (Object.keys(TAG_WORDS) as PlaceTag[]).filter((t) => TAG_WORDS[t].some((w) => new RegExp(NEGATION + normalize(w)).test(text)));
}

function findTags(text: string): PlaceTag[] {
  const avoided = negatedTags(text);
  return (Object.keys(TAG_WORDS) as PlaceTag[]).filter((t) => !avoided.includes(t) && TAG_WORDS[t].some((w) => text.includes(normalize(w))));
}

/** "كل مكان من حي"، "من أحياء مختلفة"، "مو كلها من نفس الحي". */
const SPREAD =
  /(^|\s)(ال)?(حي|احياء)\s*(مختلف|مختلفه|ثاني|ثانيه|غير|متفرق|متفرقه)|(مختلف|مختلفه|متفرق|متفرقه|مختلفين)\s*(ال)?(حي|احياء)|كل\s*(واحد|وحده|مكان|محطه)\s*(من|في|ب)\s*حي|(مو|مب|ما|لا)\s*(تكون\s*)?(كلها\s*)?(من|في|ب)\s*نفس\s*(ال)?حي|different (neighbou?rhoods?|districts?|areas?)/;

function findDistrict(text: string): string | undefined {
  return Object.keys(DISTRICTS).find((d) => {
    const n = normalize(d);
    return text.includes(n) || text.includes(n.replace(/^ال/, " "));
  });
}

function findPriority(text: string): Priority | undefined {
  if (/(ما يفرق|مايفرق|اي شي|عادي|الاثنين|كلهم)/.test(text)) return "balanced";
  // "مول قريب" asks for the closest; "قريب منه" ties one stop to the one before it.
  if (/(الاقرب|اقرب|قريب مني|قريب لي|المسافه|مسافه)/.test(text) || /قريبه?(?!\s*من)/.test(text)) return "distance";
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
    const placeName = findPlaceName(segment, text.slice(hits[i - 1]?.at ?? 0, at), category, sub);
    if (placeName) step.placeName = placeName;
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

// --- whole-plan changes (normalized text: أ/إ/آ→ا، ى→ي، ة→ه)
const UNDO = /(^|\s)(تراجع|undo)(\s|$)|(رجع|ارجع|رجعلي|رجعها|رجعه)\S*\s.*(قبل|السابق|القديم|كانت)|(الخطه|خطتي)\s*(السابقه|القديمه|اللي قبل)/;
/** The itinerary itself: "غيرلي الخطة"، "ما عجبتني الخطة"، "سو لي خطة ثانية"، "نبدأ من جديد". */
const WHOLE_PLAN = /((غير|بدل)\S*\s*(لي\s*)?(ال)?خطه)|((ما|مو|ماني)\s*\S*(عجبتني|عاجبتني|عاجبني|عجبني|حاب|حابب)\S*\s*(ال)?خطه)|(خطه\s*(ثانيه|جديده|غير|مختلفه|اخري))|(من جديد|من الصفر|من اول وجديد)|((different|another|new|other) plan|start over|something( [a-z]+)? (else|different))/;
/** Vaguer "something else" — whole plan only when no stop is named: "ابي شي ثاني"، "ودي بشي مختلف"، "عطني اقتراح غير". */
const SOMETHING_ELSE = /(شي|شيء|اشياء|فكره|اقتراح|اقتراحات)\s*(ثاني|ثانيه|غير|غيره|مختلف|مختلفه|جديد|جديده)/;
/** Every place: "غيرلي الأماكن"، "مو عاجبني ولا مكان"، "طفشت من هالأماكن"، "بدلها كلها"، "ما عجبني شيء". */
const DISLIKE = /(غير|بدل|طفشت|مليت|زهقت|ما عجب|ماعجب|مو عاجب|ما حبيت|ماحبيت|ما ابي|مابي)/;
const ALL_PLACES = /(اماكن|ولا مكان|ولا وحده|كلها|كلهم|كل شي|ولا شي|عجبني شي|عاجبني شي)/;
const ALL_PLACES_EN = /(other|different|new) (places|spots)|change (all|every|them all)/;
const EVEN_LOCKED = /حتي\s+(\S+\s+)?(ال)?مثبت|حتي\s+(اللي|الي)\s+ثبت|مع المثبت/;
const NOT_THIS = /(مو|مب|ماهي|مهي)\s*(هذي|هذا|كذا|اللي ببالي|اللي ابيه)|مو هذي الفكره/;

const DIRECTIONS: [RegExp, (lat: number, lng: number) => boolean][] = [
  [/شمال/, (lat) => lat > RIYADH_CENTER.lat + 0.03],
  [/جنوب/, (lat) => lat < RIYADH_CENTER.lat - 0.03],
  [/شرق/, (_, lng) => lng > RIYADH_CENTER.lng + 0.03],
  [/غرب/, (_, lng) => lng < RIYADH_CENTER.lng - 0.03],
];

/** Plan-wide corrections stated without naming a stop. */
function constraintEdit(text: string, ctx: IntentContext): ConstraintEdit | undefined {
  const e: ConstraintEdit = {};
  const avoided = negatedTags(text);
  const add = (t: PlaceTag) => !avoided.includes(t) && (e.addTags = [...new Set([...(e.addTags ?? []), t])]);
  if (avoided.length) e.avoidTags = avoided;
  if (SPREAD.test(text)) e.spread = true;
  if (/(ارخص|رخيص|اقتصادي|غالي|غاليه|ميزانيه|اسعار مناسبه)/.test(text)) add("budget");
  if (/(اهدا|اهدي|هادي|هادئ|هدوء|زحمه|مزحوم)/.test(text)) add("quiet");
  if (/(عوائل|عائلي|اطفال|عيال)/.test(text)) add("family");
  if (/(بنات|نسائي|نساء|حريم|سيدات)/.test(text)) {
    if (ctx.planSteps.some((s) => s.category === "gym")) e.women = true;
    if (ctx.planSteps.some((s) => s.category !== "gym")) add("family");
  }
  if (/(اقرب|قريب اكثر|بعيد|بعيده)/.test(text)) e.nearer = true;
  else if (/(تقييم|الافضل|احسن)/.test(text)) e.priority = "rating";
  const district = findDistrict(text);
  if (district) e.district = district;
  return Object.keys(e).length ? e : undefined;
}

const describeConstraint = (e: ConstraintEdit) =>
  [...(e.avoidTags ?? []).map((t) => `بتجنب «${TAG_LABELS[t]}»`), ...(e.spread ? ["بخلي كل مكان من حي مختلف"] : [])].join(" و") || "بعدّل الخطة";

/** Asked when nothing in the message names a kind of place; the server may still find a place by name. */
export const WHAT_QUESTION = "وش تدور عليه؟ اختر أو اكتبه بطريقتك:";
const WHAT_OPTIONS = ["مطعم", "كوفي", "نادي", "حلويات", "حديقة", "مول", "مسجد", "مغسلة سيارات"].map((l) => ({ label: l, value: `أبي ${l}` }));
const GREETING = /^(هلا|اهلا|اهلين|مرحبا|السلام|سلام|هاي|صباح|مساء|hi|hello|hey)/;
const THANKS = /(شكرا|مشكور|يعطيك العافيه|تسلم|thank)/;

const PLAN_IDEAS = [
  { label: "نادي ← كوفي ← مطعم", value: "نادي وبعده كوفي قريب منه وبعده مطعم قريب من الكوفي" },
  { label: "كوفي ← عشا", value: "كوفي وبعده عشا قريب منه" },
  { label: "غدا ← حلا", value: "أتغدى وبعدها حلا قريب" },
  { label: "حديقة ← كوفي", value: "ممشى وبعده كوفي قريب" },
];

/** Every word the rules know; a known word is never "corrected" into another one. */
const VOCAB = [...Object.values(CATEGORY_WORDS).flat(), ...Object.values(SUBCATEGORY_META).flatMap((m) => m.words)].map(normalize);
const KNOWN = new Set([...VOCAB, ...Object.values(TAG_WORDS).flat().map(normalize), ...Object.keys(DISTRICTS).map(normalize), ...NAME_STOP, "عادي", "هادي", "ثاني", "ثانيه", "ثالث", "رابع", "غيره", "مختلف", "جديد"]);
const TYPO_TARGETS = VOCAB.filter((w) => !w.includes(" ") && w.length >= 4);

/** One insertion, deletion or substitution apart. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + (a.length >= b.length ? 1 : 0)) === b.slice(i + (b.length >= a.length ? 1 : 0));
}

/**
 * "مطعن" → "مطعم": an unknown word one typo away from a known one (same first letter, 4+ letters).
 * A 4-letter word only gets a swapped letter: "ثاني" must not grow into "ثانوي".
 */
function fixTypos(text: string): string {
  return text
    .split(/\s+/)
    .map((tok) => {
      const [, pre, core] = /^((?:[وبلف])?(?:ال)?)(.*)$/.exec(tok)!;
      if (core.length < 4 || KNOWN.has(core) || KNOWN.has(tok)) return tok;
      const fix = TYPO_TARGETS.find((w) => w[0] === core[0] && (core.length > 4 || w.length === 4) && oneEditApart(core, w));
      return fix ? pre + fix : tok;
    })
    .join(" ");
}

export function parseWithRules(raw: string, ctx: IntentContext): AssistantResponse {
  const typed = normalize(raw);
  const text = findCategories(typed).length ? typed : fixTypos(typed);
  const engine = "rules" as const;

  if (UNDO.test(text))
    return ctx.canUndo
      ? { engine, reply: "رجّعت لك الخطة اللي قبل.", action: { type: "undo" } }
      : { engine, reply: "ما فيه تغيير سابق أرجع له.", action: { type: "chat" } };

  // 1) Plan edits
  if (ctx.planSteps.length) {
    const named = findCategories(text).filter((c) => ctx.planSteps.some((s) => s.category === c.category));
    const includeLocked = EVEN_LOCKED.test(text);
    // "ما أحب الأماكن الهادية" / "كل مكان من حي": a plan-wide constraint, not "replace everything"
    if (negatedTags(text).length || SPREAD.test(text)) {
      const edit = constraintEdit(text, ctx)!;
      return { engine, reply: `أبشر، ${describeConstraint(edit)}.`, action: { type: "constraints", edit } };
    }
    // B) the itinerary itself
    if (WHOLE_PLAN.test(text) || (SOMETHING_ELSE.test(text) && !named.length))
      return { engine, reply: "أبشر، بسوي لك خطة مختلفة.", action: { type: "regenerate", ...(includeLocked ? { includeLocked } : {}) } };
    // A) every place, same activities
    if ((DISLIKE.test(text) && ALL_PLACES.test(text)) || ALL_PLACES_EN.test(text) || (includeLocked && /(غير|بدل)/.test(text)))
      return { engine, reply: "أبشر، بغيّر الأماكن كلها.", action: { type: "replace_all", ...(includeLocked ? { includeLocked } : {}) } };

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
      // "بدل الحديقة بمول": swap the activity itself
      const swapTo = findCategories(text).find((c) => c.category !== target)?.category;
      if (swapTo && /(بدل|غير|حول)/.test(text) && !/(ضيف|اضف|زيد|زود)/.test(text))
        return {
          engine,
          reply: `أبشر، بحط ${CATEGORY_META[swapTo].label} بدال ${CATEGORY_META[target].label}.`,
          action: { type: "modify", op: "replace", index: idx!, step: { category: swapTo, subcategory: findSubcategory(text, swapTo) } },
        };
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
    // D) plan-wide corrections ("أرخص"، "أهدأ"، "خليها بالملقا") when no activity is named
    if (!findCategories(text).length) {
      const edit = constraintEdit(text, ctx);
      if (edit) return { engine, reply: "أبشر، بعدّل الخطة.", action: { type: "constraints", edit } };
      const region = DIRECTIONS.find(([re]) => re.test(text));
      if (region) {
        const options = Object.entries(DISTRICTS)
          .filter(([, c]) => region[1](c.lat, c.lng))
          .slice(0, 5)
          .map(([d]) => ({ label: d, value: `خليها في حي ${d}` }));
        if (options.length) return { engine, reply: "أي حي يناسبك؟", action: { type: "clarify", question: "أي حي يناسبك؟", options, pending: {} } };
      }
      if (NOT_THIS.test(text) || /(غير|بدل)/.test(text))
        return {
          engine,
          reply: "وش اللي ودك يتغير؟",
          action: {
            type: "clarify",
            question: "وش اللي ودك يتغير؟",
            options: [
              { label: "أماكن غيرها", value: "غيرلي الأماكن" },
              { label: "خطة مختلفة", value: "سو لي خطة ثانية" },
              ...ctx.planSteps.slice(0, 3).map((s) => ({ label: `غيّر ال${CATEGORY_META[s.category].label}`, value: `غير ال${CATEGORY_META[s.category].label}` })),
            ],
            pending: {},
          },
        };
    }
    if (/(ضيف|اضف|زيد|زود|وبعدها|وبعده)/.test(text)) {
      const steps = stepsFrom(text);
      // "زيد حلويات بعد النادي": insert after the named stop instead of at the end
      const ref = /بعد\s+(?:ال)?(\S+)/.exec(text)?.[1];
      const afterCat = ref ? findCategories(` ${ref}`)[0]?.category : undefined;
      const after = afterCat ? ctx.planSteps.findIndex((s) => s.category === afterCat) : -1;
      if (steps.length === 1)
        return {
          engine,
          reply: after >= 0 ? `ضفت ${label(steps[0])} بعد ${CATEGORY_META[ctx.planSteps[after].category].label}.` : `ضفت ${label(steps[0])} آخر الخطة.`,
          action: { type: "add", step: { ...steps[0], tags: findTags(text) }, after: after >= 0 ? after : undefined },
        };
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
    if (THANKS.test(text)) return { engine, reply: "العفو، بالخدمة دايم! تبي شي ثاني؟", action: { type: "chat" } };
    // Never a dead end: offer the common kinds of place, keeping whatever was understood (district, priority).
    const question = GREETING.test(text) ? "هلا والله! وش تدور عليه اليوم؟" : WHAT_QUESTION;
    return { engine, reply: question, action: { type: "clarify", question, options: WHAT_OPTIONS, pending: { tags, district, priority } } };
  }

  const avoidTags = negatedTags(text);
  if (avoidTags.length) steps = steps.map((s) => (s.subcategory && (avoidTags as string[]).includes(s.subcategory) ? { ...s, subcategory: undefined } : s));
  const request: ParsedRequest = { steps, district, priority, tags, ...(avoidTags.length ? { avoidTags } : {}), ...(SPREAD.test(text) ? { spread: true } : {}) };
  // A plain "أبي مطعم" shows options right away; the cards carry distance and rating to choose by.
  const chain = steps.map(label).join(" ← ");
  return {
    engine,
    reply: steps.length > 1 ? `أبشر! بخطط لك: ${chain}، وكل وجهة قريبة من اللي قبلها.` : "تمام، لقيت لك هالخيارات",
    action: { type: "plan", request: { ...request, priority: priority ?? "balanced" } },
  };
}
