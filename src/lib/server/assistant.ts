import "server-only";
import { CATEGORY_META, DISTRICTS, RIYADH_AREAS, SUBCATEGORY_META, TAG_LABELS } from "../catalog";
import { parseWithRules, WHAT_QUESTION, type IntentContext } from "../intent";
import { MAX_STOPS } from "../planEdits";
import type { AssistantAction, AssistantResponse, Category, PlaceTag, Preferences, Subcategory } from "../types";
import { geminiEnabled, geminiJson, GeminiQuotaError } from "./gemini";
import { INTENTS, validateOutput } from "./intentSchema";
import { findPlacesByName } from "./places";

export type AssistantRequest = { message: string; context: IntentContext; preferences?: Preferences };

const CATS = Object.keys(CATEGORY_META) as Category[];
const TAGS = Object.keys(TAG_LABELS) as PlaceTag[];
const SUBS = Object.keys(SUBCATEGORY_META) as Subcategory[];
const SUB_DOC = CATS.map((c) => `${c}: ${SUBS.filter((s) => SUBCATEGORY_META[s].category === c).map((s) => `${s}=${SUBCATEGORY_META[s].label}`).join("، ") || "—"}`).join("\n");
const HISTORY_TURNS = 8;
const TURN_CHARS = 280;

/** Gemini usually answers in 1–2 s; past this the rules answer a request they already understood. */
const QUICK_BUDGET_MS = 2_000;

export const SYSTEM = `أنت "مشوارك" (Mishwarak)، المساعد الذكي داخل تطبيق هدهد السعودي للخرائط. تفهم اللهجة السعودية والفصحى والإنجليزية، وترد بلهجة سعودية ودودة ومختصرة (جملة وحدة غالباً).
دورك فهم قصد المستخدم بالمعنى، مو بالكلمات الحرفية. اختيار الأماكن والمسافات والتقييمات يسويه النظام من قاعدة البيانات — لا تذكر أسماء أماكن ولا تقييمات ولا مسافات، ولا تقول إنك غيّرت شيء: النظام يكتب للمستخدم وش تغيّر فعلاً.
اكتب اسمك بالعربي «مشوارك»، والأرقام بالأرقام اللاتينية (1، 2، 3) دائماً، وسمّ أماكن الخطة «وجهات» مو «محطات».

المدخل JSON فيه: message (آخر رسالة)، history (آخر الرسائل)، currentPlan (الوجهات الحالية بالترتيب: index من 0، الفئة، النوع، اسم المكان، id، مثبّت أو لا، المسافة عن اللي قبله، وحي الخطة وأولويتها ووسومها)، originalRequest (كلام المستخدم اللي سوى الخطة)، rejectedPlaceIds، pending (سؤال توضيحي سألته)، canUndo، savedPreferences.

أرجع JSON فقط:
{"intent": INTENT, "reply": "رد قصير", ...الحقول اللي يحتاجها الـintent..., "learned": LEARNED أو null}

INTENT واحد من: ${INTENTS.join("، ")}
- create_plan: طلب طلعة/خطة جديدة. الحقل "request": REQUEST.
- search_places: يدور نوع مكان واحد ("أبي كوفي هادي"). "request" بخطوة وحدة.
- replace_all_places: الأماكن نفسها ما عجبته بس نوع الطلعة نفسه (نفس الأنشطة ونفس العدد، كل وجهة غير مثبّتة تاخذ مكان جديد). أمثلة: "غيرلي الأماكن"، "مو عاجبني ولا مكان"، "طفشت من هالأماكن"، "بدلها كلها"، "ما عجبني شيء"، "show me other places". "includeLocked": true فقط إذا قال صراحة يبي حتى المثبّت يتغير ("غير كل شيء حتى النادي المثبت").
- replace_entire_plan: الخطة نفسها (التسلسل أو الفكرة) ما عجبته: "غيرلي الخطة"، "ما عجبتني الخطة"، "لا مو كذا، سو لي خطة ثانية"، "خلنا نبدأ من جديد"، "ابي شي ثاني"، "ودي بشي مختلف"، "عطني اقتراح غير"، "different plan". حط "request" جديد مبني على originalRequest وآخر كلامه، ولازم يختلف عن currentPlan: غيّر نشاط واحد على الأقل أو نوعه الفرعي أو الترتيب (مثلاً كوفي مختص بدل الكوفي العادي، مطعم سعودي بدل البرجر، حديقة بدل المول) بشرط يخدم نفس فكرته. حافظ على القيود الصريحة اللي للحين لها معنى (الميزانية، الحي، هادي، عوائل...). المثبّت يبقى إلا إذا قال يتغير كل شيء ← "includeLocked": true.
- replace_single_stop: وجهة وحدة: "غير الكوفي"، "بدل المطعم"، "ما أحب ذا"، "ما يعجبني هذا"، "مو حلو"، "ما أبي ذا" (يقصد المكان اللي اختاره focusedStopIndex، أو الوحيد إذا الخطة وجهة وحدة؛ وإذا ما تقدر تحدد وفيه أكثر من وجهة ← clarify_request)، "خل النادي أقرب"، "أبي مطعم إيطالي بدل البرجر"، "بدل الحديقة بمول". الحقول: "index"، و"step" إذا تغيّر النوع أو الفئة ({"category":C,"subcategory":S أو null,"tags":[T]})، "nearer": true إذا يبيه أقرب، "onlyThis": true فقط إذا قال "بس/فقط/لحاله" (يبقى اللي بعده مثل ما هو)، وإلا false.
- edit_plan_constraints: تصحيح على الخطة كلها بدون تسمية وجهة: "لا أبيه أقرب"، "غالي عطني أرخص"، "أبي مكان أهدأ"، "أبي أماكن تناسب البنات"، "خليها شمال الرياض". الحقل "constraints": {"district": حي من القائمة أو null، "priority": "distance|rating|balanced" أو null، "addTags":[T]، "removeTags":[T]، "women": true إذا يبي أندية نسائية، "nearer": true إذا يبي الكل أقرب، "avoidTags":[T] لنوع أماكن ما يبيه، "spread": true إذا يبي كل مكان من حي مختلف}. النفي مهم: "ما أحب الأماكن الهادية" ← avoidTags:["quiet"] (مو addTags). "أبي كل مكان من حي مختلف"/"مو كلها من نفس الحي" ← spread:true. وفي create_plan نفس الحقلين داخل request: "avoidTags" و "spread". "شمال/جنوب/شرق/غرب الرياض" ← اختر حي مناسب من القائمة. "تناسب البنات" ← women للنادي و family للباقي.
- add_stop: "أضف/زيد X" ← "step": STEP، و"after": index الوجهة اللي قبلها أو null للنهاية.
- remove_stop / lock_stop / unlock_stop: "شيل/احذف X"، "ثبت X"، "فك تثبيت X" ← "index".
- undo_plan_change: يبي يرجع للخطة اللي قبل ("رجع الخطة اللي قبل"، "تراجع") — فقط إذا canUndo true.
- clarify_request: سؤال توضيحي واحد قصير فقط إذا القصد غامض فعلاً ("مو هذي الفكرة" بدون شي تقدر تستنتجه من المحادثة، أو "أبي أطلع" بدون نشاط). طلب فيه نوع مكان ("أبي مطعم"، "مطاعم"، "كوفي") ← create_plan مباشرة بدون سؤال. افهم الجمع والعامية والأخطاء الإملائية: "مطاعم/مطعن" = مطعم، "مقاهي/كوفيهات" = كوفي، "نوادي/اندية/جيمات" = نادي، "حدايق" = حديقة. الحقول: "question"، "options":[{"label":"..","value":"نص يرسله المستخدم"}]، "pending": REQUEST الجزئي اللي فهمته.
- chat: سلام أو شكر أو سؤال عام.

REQUEST = {"steps":[STEP,...],"district":"حي من القائمة أو null","priority":"distance|rating|balanced","tags":[T]}
STEP = {"category":C,"subcategory":S أو null,"placeName":"فقط إذا سمّى مكان معين" أو null,"tags":[T],"district":"حي هذي الوجهة إذا حدده لها" أو null}
كل وجهة لها حيها إذا ذكره: "مقهى بالملقا ومقهى بالنسيم" ← وجهتين cafe، الأولى district "الملقا" والثانية "النسيم". لا تحط كل الوجهات بنفس الحي إلا إذا قال كذا.
أماكن بالاسم وخدمات يومية: "ودني أكاديمية طويق" ← education/academy مع placeName "طويق". "أبي وزارة التعليم" ← government/ministry مع placeName "التعليم". "جامعة الملك سعود" ← education/university مع placeName "الملك سعود". "النخيل مول" ← mall مع placeName "النخيل". "مغسلة سيارات" ← laundry/car_wash، "مصبغة" ← laundry/clothes_laundry، "جامع/مسجد" ← mosque، "ملعب كورة" ← sports/football، "بادل" ← sports/padel، "محطة مترو" ← transport/metro_station.

C (الفئة): ${CATS.map((c) => `${c}=${CATEGORY_META[c].label}`).join("، ")}
S (النوع الفرعي — لازم يتبع نفس الفئة):
${SUB_DOC}
T: ${TAGS.map((t) => `${t}=${TAG_LABELS[t]}`).join("، ")}
الأحياء: ${Object.keys(DISTRICTS).join("، ")}
أحياء ثانية (فقط في district داخل STEP؛ ما فيها أماكن بالبيانات فنعطي الأقرب لها): ${Object.keys(RIYADH_AREAS).join("، ")}

LEARNED = تفضيلات ثابتة صرّح فيها المستخدم عن نفسه فقط (مثل "دايم أحب الأماكن الهادية"، "ما أحب الزحمة"، "ميزانيتي محدودة"، "أحب الأكل الهندي")، وإلا null:
{"likes":[T],"avoid":["نص قصير"],"cuisines":[S للمطاعم],"cafeTypes":[S للكوفي],"neighborhoods":["حي"],"budget":"low" أو null,"distance":"distance|rating" أو null}
طلب لمرة وحدة ("أبي مطعم هندي الحين") مو تفضيل ثابت.

قواعد:
1. أي تسلسل مسموح بأي ترتيب لين ${MAX_STOPS} وجهات، والفئة ممكن تتكرر ("كوفي وبعده ممشى وبعده كوفي ثاني" = 3 خطوات). رتّب steps بنفس ترتيب كلامه. "قريب من الكوفي" إشارة لوجهة سابقة، مو وجهة جديدة.
2. "أبي مطعم" = restaurant بدون subcategory. حط subcategory فقط إذا ذكر النوع، ولازم يكون من نفس الفئة.
3. "تقييمه عالي/الأفضل" ← priority=rating. "الأقرب/قريب مني" ← priority=distance. غير كذا balanced.
4. إذا فيه pending فالرسالة جواب على سؤالك: ادمجها وارجع create_plan أو search_places بدون سؤال ثاني.
5. لا تسأل إذا تقدر تفهم القصد من currentPlan و history و originalRequest. index لازم يكون من الوجهات الموجودة.
6. فرّق: الأماكن مو عاجبته ← replace_all_places. الفكرة/التسلسل مو عاجبه ← replace_entire_plan. وجهة وحدة مسمّاة ← replace_single_stop. تصحيح عام (أقرب/أرخص/أهدأ/حي) ← edit_plan_constraints.
7. طلب جديد كامل بأنشطة محددة حتى لو فيه خطة حالية ← create_plan.`;

const trim = (t: unknown, max = TURN_CHARS) => (typeof t === "string" ? t.trim().slice(0, max) : "");

/** The client sends this; keep it bounded and well-formed before it reaches the rules or the model. */
export function sanitizeContext(c: Partial<IntentContext> | undefined): IntentContext {
  const ctx: IntentContext = {
    planSteps: Array.isArray(c?.planSteps) ? c.planSteps.slice(0, MAX_STOPS) : [],
    pending: c?.pending,
    plan: c?.plan,
    goal: trim(c?.goal, 400) || undefined,
    history: Array.isArray(c?.history)
      ? c.history
          .filter((t) => t && (t.role === "user" || t.role === "assistant"))
          .slice(-HISTORY_TURNS)
          .map((t) => ({ role: t.role, text: trim(t.text) }))
      : [],
    rejectedIds: Array.isArray(c?.rejectedIds) ? c.rejectedIds.filter((x) => typeof x === "string").slice(-50) : [],
    canUndo: c?.canUndo === true,
  };
  const f = c?.focusIndex;
  if (typeof f === "number" && Number.isInteger(f) && f >= 0 && f < ctx.planSteps.length) ctx.focusIndex = f;
  return ctx;
}

export function userPayload(message: string, ctx: IntentContext, preferences?: Preferences) {
  return JSON.stringify({
    message,
    history: ctx.history ?? [],
    currentPlan: ctx.planSteps.length
      ? {
          stops: ctx.planSteps.map((s, i) => ({
            index: i,
            category: s.category,
            subcategory: s.subcategory ?? null,
            placeName: s.name ?? null,
            placeId: s.placeId ?? null,
            locked: s.locked,
            distanceFromPreviousKm: s.distanceKm === undefined ? null : Math.round(s.distanceKm * 10) / 10,
          })),
          district: ctx.plan?.district ?? null,
          priority: ctx.plan?.priority ?? null,
          tags: ctx.plan?.tags ?? [],
        }
      : null,
    originalRequest: ctx.goal ?? null,
    rejectedPlaceIds: ctx.rejectedIds ?? [],
    pending: ctx.pending ?? null,
    canUndo: Boolean(ctx.canUndo),
    focusedStopIndex: ctx.focusIndex ?? null,
    savedPreferences: preferences?.consent ? preferences : null,
  });
}

/**
 * Guards the two readings that would make a misleading change. The rules only return a new plan,
 * "a different plan" or "other places" for unambiguous wording, so when they are that sure and
 * Gemini disagrees on exactly these, the rules win.
 */
export function reconcile(gemini: AssistantAction, rules: AssistantAction): AssistantAction {
  // "مقهى بالملقا ومقهى بالنسيم": the rules read each stop's district straight from the words
  if (rules.type === "plan" && new Set(rules.request.steps.map((s) => s.district).filter(Boolean)).size > 1) {
    const g = gemini.type === "plan" ? gemini.request.steps : [];
    if (g.length !== rules.request.steps.length || g.some((s, i) => s.district !== rules.request.steps[i].district)) return rules;
  }
  // "ما أحب الأماكن الهادية": a model that read the word as a wish is overruled by the negation
  if (rules.type === "constraints" && (rules.edit.avoidTags?.length || rules.edit.spread)) {
    const avoid = rules.edit.avoidTags ?? [];
    if (gemini.type !== "constraints" || gemini.edit.addTags?.some((t) => avoid.includes(t)) || (rules.edit.spread && !gemini.edit.spread)) return rules;
  }
  if (rules.type === "plan" && gemini.type === "plan" && (rules.request.avoidTags?.length || rules.request.spread)) {
    const avoidTags = [...new Set([...(gemini.request.avoidTags ?? []), ...(rules.request.avoidTags ?? [])])];
    return {
      ...gemini,
      request: {
        ...gemini.request,
        tags: gemini.request.tags.filter((t) => !avoidTags.includes(t)),
        steps: gemini.request.steps.map((st) => (st.subcategory && (avoidTags as string[]).includes(st.subcategory) ? { ...st, subcategory: undefined } : st)),
        ...(avoidTags.length ? { avoidTags } : {}),
        ...(rules.request.spread || gemini.request.spread ? { spread: true } : {}),
      },
    };
  }
  // "undo" would bring back an old plan while the user just asked for a new one
  if (gemini.type === "undo" && rules.type === "plan") return rules;
  // "غيرلي الخطة" is about the itinerary, "غيرلي الأماكن" about the venues
  if (gemini.type === "replace_all" && rules.type === "regenerate") return { ...rules, includeLocked: rules.includeLocked || gemini.includeLocked };
  if (gemini.type === "regenerate" && !gemini.request && rules.type === "replace_all") return { ...rules, includeLocked: rules.includeLocked || gemini.includeLocked };
  return gemini;
}

/**
 * Gemini decides by meaning; its JSON is validated (Zod + plan checks) before anything runs.
 * Without a usable answer the rule-based parser responds — and it only changes a plan when the
 * phrasing is unambiguous, otherwise it asks.
 */
export async function answer(req: AssistantRequest): Promise<AssistantResponse> {
  const ctx = sanitizeContext(req.context);
  const rules = parseWithRules(req.message, ctx);
  const res = geminiEnabled() ? await decide(req, ctx, rules) : rules;
  // Nothing named a kind of place: the message may be a place's own name ("ودني بانوراما").
  if (rules.action.type === "clarify" && rules.action.question === WHAT_QUESTION && (res.action.type === "clarify" || res.action.type === "chat")) {
    const place = (await findPlacesByName(req.message).catch(() => []))[0];
    if (place)
      return {
        ...res,
        reply: `أبشر، هذا ${place.name}.`,
        action: { type: "plan", request: { steps: [{ category: place.category, subcategory: place.subcategory, placeName: place.name }], priority: "balanced", tags: [] } },
      };
  }
  return res;
}

async function decide(req: AssistantRequest, ctx: IntentContext, rules: AssistantResponse): Promise<AssistantResponse> {
  try {
    // When the rules already have a clear answer, don't keep the user waiting on a slow model.
    const clear = rules.action.type !== "clarify" && rules.action.type !== "chat";
    const out = await geminiJson<unknown>(SYSTEM, userPayload(req.message, ctx, req.preferences), 0.1, clear ? QUICK_BUDGET_MS : undefined);
    const v = validateOutput(out, ctx);
    if (!v.ok) {
      console.error("Gemini output rejected, using rules:", v.reason);
      return { ...rules, fallback: "invalid" };
    }
    const action = reconcile(v.value.action, rules.action);
    return { reply: action === v.value.action ? v.value.reply ?? rules.reply : rules.reply, action, engine: "gemini", learned: v.value.learned };
  } catch (e) {
    console.error("Gemini failed, using rules:", (e as Error).message);
    return { ...rules, fallback: e instanceof GeminiQuotaError ? "quota" : e instanceof SyntaxError ? "invalid" : "unavailable" };
  }
}
