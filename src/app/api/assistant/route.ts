import { NextResponse } from "next/server";
import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, TAG_LABELS } from "@/lib/catalog";
import { parseWithRules, type IntentContext } from "@/lib/intent";
import { geminiEnabled, geminiJson, GeminiQuotaError } from "@/lib/server/gemini";
import type { AssistantAction, AssistantResponse, Category, PlaceTag, PreferenceUpdate, Preferences, Priority, StepSpec, Subcategory } from "@/lib/types";

type Body = { message: string; context: IntentContext; preferences?: Preferences };

const CATS = Object.keys(CATEGORY_META) as Category[];
const TAGS = Object.keys(TAG_LABELS) as PlaceTag[];
const SUBS = Object.keys(SUBCATEGORY_META) as Subcategory[];
const MAX_STOPS = 6;
const SUB_DOC = CATS.map((c) => `${c}: ${SUBS.filter((s) => SUBCATEGORY_META[s].category === c).map((s) => `${s}=${SUBCATEGORY_META[s].label}`).join("، ")}`).join("\n");

const SYSTEM = `أنت "Mishwarak" (يُنطق مشوارك)، المساعد الذكي داخل تطبيق هدهد السعودي للخرائط. تفهم اللهجة السعودية وترد بلهجة سعودية ودودة ومختصرة (جملة أو جملتين).
دورك فهم الطلب فقط. اختيار الأماكن والمسافات والتقييمات يسويه النظام من قاعدة البيانات — لا تذكر أسماء أماكن ولا تقييمات ولا مسافات أبداً.
اكتب اسمك بالحروف اللاتينية «Mishwarak»، والأرقام بالأرقام اللاتينية (1، 2، 3) دائماً، وسمّ أماكن الخطة «وجهات» مو «محطات».

أرجع JSON فقط بالشكل:
{"reply": "رد قصير", "action": ACTION, "learned": LEARNED أو null}

ACTION واحد من:
- {"type":"plan","request":{"steps":[STEP,...],"district":"حي من القائمة أو null","priority":"distance|rating|balanced","tags":[T]}}
- {"type":"clarify","question":"سؤال واحد قصير","options":[{"label":"..","value":"نص يرسله المستخدم"}],"pending":{"steps":[STEP],"district":..,"priority":..,"tags":[T]}}
- {"type":"modify","op":"replace|lock|unlock|remove","index":رقم المحطة من 0,"step":{"category":C اختياري,"subcategory":S اختياري} أو null,"nearer":true|false,"onlyThis":true|false}
- {"type":"add","step":STEP,"after":رقم المحطة اللي تجي بعدها أو null للنهاية}
- {"type":"chat"}

STEP = {"category":C,"subcategory":S أو null,"placeName":"فقط إذا سمّى المستخدم مكان معين" أو null,"tags":[T]}

C (الفئة): ${CATS.map((c) => `${c}=${CATEGORY_META[c].label}`).join("، ")}
S (النوع الفرعي — لازم يتبع نفس الفئة):
${SUB_DOC}
T: ${TAGS.map((t) => `${t}=${TAG_LABELS[t]}`).join("، ")}
الأحياء: ${Object.keys(DISTRICTS).join("، ")}

LEARNED = تفضيلات ثابتة صرّح فيها المستخدم عن نفسه فقط (مثل "دايم أحب الأماكن الهادية"، "ما أحب الزحمة"، "ميزانيتي محدودة"، "أحب الأكل الهندي")، وإلا null:
{"likes":[T],"avoid":["نص قصير"],"cuisines":[S للمطاعم],"cafeTypes":[S للكوفي],"neighborhoods":["حي"],"budget":"low" أو null,"distance":"distance|rating" أو null}
طلب لمرة وحدة ("أبي مطعم هندي الحين") مو تفضيل ثابت.

قواعد:
1. أي تسلسل يطلبه المستخدم مسموح، بأي ترتيب وأي عدد لين ${MAX_STOPS} محطات، ويمكن تتكرر الفئة ("كوفي وبعده ممشى وبعده كوفي ثاني" = 3 خطوات).
2. رتّب steps بنفس ترتيب كلام المستخدم. "قريب من الكوفي" أو "جنبه" إشارة لمحطة سابقة، مو محطة جديدة.
3. "أبي مطعم" = restaurant بدون subcategory. حط subcategory فقط إذا ذكر النوع ("إيطالي"=italian، "وجبات سريعة/فاست فود"=fast_food، "كوفي هادي"=quiet، "أذاكر"=study، "آيس كريم"=ice_cream، "ألعاب"=games).
4. "تقييمه عالي/الأفضل" ← priority=rating. "الأقرب/قريب مني" ← priority=distance. غير كذا balanced.
5. اسأل سؤال توضيحي واحد فقط إذا الطلب محطة وحدة وغامض فعلاً (مثلاً "أبي أطلع" بدون نشاط، أو "أبي مطعم" بدون أي تفضيل). لا تسأل إذا فيه أكثر من محطة أو إذا النوع محدد.
6. إذا فيه pending فالرسالة جواب على سؤالك: ادمجها وارجع plan بدون سؤال ثاني.
7. إذا فيه currentPlan: "غير/بدّل X" ← modify replace. "خل X إيطالي" ← replace مع step.subcategory. "بدل الحديقة بمول" ← replace مع step.category. "أقرب" ← nearer=true. "بس/فقط" ← onlyThis=true. "ثبت" ← lock. "فك التثبيت" ← unlock. "شيل/احذف" ← remove. "أضف/زيد X" ← add (مع after إذا حدد مكانه مثل "بعد النادي").
8. طلب جديد كامل حتى لو فيه خطة حالية ← plan جديد.`;

const isPriority = (p: unknown): p is Priority => p === "distance" || p === "rating" || p === "balanced";
const cleanTags = (t?: unknown) => (Array.isArray(t) ? (t.filter((x) => TAGS.includes(x)) as PlaceTag[]) : []);
/** Drop any subcategory the model made up or attached to the wrong category. */
const cleanSub = (category: Category, sub?: unknown) =>
  typeof sub === "string" && SUBS.includes(sub as Subcategory) && SUBCATEGORY_META[sub as Subcategory].category === category ? (sub as Subcategory) : undefined;
const nonEmpty = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const okCat = (c: unknown): c is Category => CATS.includes(c as Category);

function cleanStep(s: Partial<StepSpec> & { category: Category }): StepSpec {
  return {
    category: s.category,
    subcategory: cleanSub(s.category, s.subcategory),
    placeName: nonEmpty(s.placeName),
    tags: cleanTags(s.tags),
  };
}

function cleanRequest(r: { steps?: unknown; district?: unknown; priority?: unknown; tags?: unknown } | undefined) {
  const steps = Array.isArray(r?.steps) ? (r.steps.filter((s) => okCat(s?.category)) as StepSpec[]).slice(0, MAX_STOPS).map(cleanStep) : [];
  const district = typeof r?.district === "string" && DISTRICTS[r.district] ? r.district : undefined;
  return { steps, district, priority: isPriority(r?.priority) ? r.priority : undefined, tags: cleanTags(r?.tags) };
}

/** Validates and normalises the model's action against our enums and the current plan. Returns null if unusable. */
function toAction(a: Record<string, unknown> | undefined, ctx: IntentContext): AssistantAction | null {
  if (!a || typeof a !== "object") return null;
  const n = ctx.planSteps.length;
  switch (a.type) {
    case "plan": {
      const request = cleanRequest(a.request as never);
      return request.steps.length ? { type: "plan", request: { ...request, priority: request.priority ?? "balanced" } } : null;
    }
    case "clarify": {
      const options = Array.isArray(a.options)
        ? (a.options as { label?: unknown; value?: unknown }[])
            .map((o) => ({ label: nonEmpty(o?.label), value: nonEmpty(o?.value) ?? nonEmpty(o?.label) }))
            .filter((o): o is { label: string; value: string } => Boolean(o.label && o.value))
            .slice(0, 5)
        : [];
      const question = nonEmpty(a.question);
      return question ? { type: "clarify", question, options, pending: cleanRequest(a.pending as never) } : null;
    }
    case "modify": {
      const index = a.index as number;
      const op = a.op as string;
      if (!Number.isInteger(index) || index < 0 || index >= n || !["replace", "lock", "unlock", "remove"].includes(op)) return null;
      const raw = (a.step ?? {}) as { category?: unknown; subcategory?: unknown };
      const category = okCat(raw.category) ? raw.category : undefined;
      const sub = cleanSub(category ?? ctx.planSteps[index].category, raw.subcategory);
      // changing the activity resets its type unless a matching one was given
      const step = category && category !== ctx.planSteps[index].category ? { category, subcategory: sub } : sub ? { subcategory: sub } : undefined;
      return { type: "modify", op: op as "replace", index, step, nearer: a.nearer === true, onlyThis: a.onlyThis === true };
    }
    case "add": {
      const s = a.step as Partial<StepSpec> | undefined;
      if (!okCat(s?.category) || n >= MAX_STOPS) return null;
      const after = Number.isInteger(a.after) && (a.after as number) >= 0 && (a.after as number) < n ? (a.after as number) : undefined;
      return { type: "add", step: cleanStep(s as StepSpec), after };
    }
    case "chat":
      return { type: "chat" };
    default:
      return null;
  }
}

function toLearned(l: Record<string, unknown> | null | undefined): PreferenceUpdate | undefined {
  if (!l || typeof l !== "object") return undefined;
  const subs = (v: unknown, c: Category) => (Array.isArray(v) ? v.map((x) => cleanSub(c, x)).filter((x): x is Subcategory => Boolean(x)) : []);
  const out: PreferenceUpdate = {
    likes: cleanTags(l.likes),
    avoid: Array.isArray(l.avoid) ? l.avoid.map(nonEmpty).filter((x): x is string => Boolean(x)).slice(0, 5) : [],
    cuisines: subs(l.cuisines, "restaurant"),
    cafeTypes: subs(l.cafeTypes, "cafe"),
    neighborhoods: Array.isArray(l.neighborhoods) ? l.neighborhoods.filter((d): d is string => typeof d === "string" && Boolean(DISTRICTS[d])) : [],
    budget: l.budget === "low" ? "low" : undefined,
    distance: l.distance === "distance" || l.distance === "rating" ? l.distance : undefined,
  };
  const any = Object.values(out).some((v) => (Array.isArray(v) ? v.length : v));
  return any ? out : undefined;
}

export async function POST(req: Request) {
  const { message, context, preferences }: Body = await req.json();
  const rules = parseWithRules(message, context);
  if (!geminiEnabled()) return NextResponse.json(rules);

  try {
    const out = await geminiJson<{ reply?: string; action?: Record<string, unknown>; learned?: Record<string, unknown> | null }>(
      SYSTEM,
      JSON.stringify({
        message,
        currentPlan: context.planSteps.map((s, i) => ({ index: i, category: s.category, subcategory: s.subcategory ?? null, locked: s.locked })),
        pending: context.pending ?? null,
        savedPreferences: preferences?.consent ? preferences : null,
      }),
    );
    const action = toAction(out.action, context);
    if (!action) return NextResponse.json({ ...rules, fallback: "invalid" } satisfies AssistantResponse);
    const res: AssistantResponse = { reply: nonEmpty(out.reply) ?? rules.reply, action, engine: "gemini", learned: toLearned(out.learned) };
    return NextResponse.json(res);
  } catch (e) {
    console.error("Gemini failed, using rules:", (e as Error).message);
    return NextResponse.json({ ...rules, fallback: e instanceof GeminiQuotaError ? "quota" : "unavailable" } satisfies AssistantResponse);
  }
}
