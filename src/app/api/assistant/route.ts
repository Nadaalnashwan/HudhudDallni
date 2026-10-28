import { NextResponse } from "next/server";
import { CATEGORY_META, DISTRICTS, SUBCATEGORY_META, TAG_LABELS } from "@/lib/catalog";
import { parseWithRules, type IntentContext } from "@/lib/intent";
import { groqEnabled, groqJson } from "@/lib/server/groq";
import type { AssistantAction, AssistantResponse, Category, PlaceTag, Preferences, StepSpec, Subcategory } from "@/lib/types";

type Body = { message: string; context: IntentContext; preferences?: Preferences };

const CATS = Object.keys(CATEGORY_META) as Category[];
const TAGS = Object.keys(TAG_LABELS) as PlaceTag[];
const SUBS = Object.keys(SUBCATEGORY_META) as Subcategory[];
const SUB_DOC = CATS.map((c) => `${c}: ${SUBS.filter((s) => SUBCATEGORY_META[s].category === c).map((s) => `${s}=${SUBCATEGORY_META[s].label}`).join("، ")}`).join("\n");

const SYSTEM = `أنت "مساعد هدهد الذكي" داخل تطبيق خرائط سعودي. تفهم اللهجة السعودية وترد بلهجة سعودية ودودة ومختصرة.
مهمتك تحويل رسالة المستخدم إلى JSON فقط بالشكل:
{"reply": "رد قصير للمستخدم", "action": ACTION}

ACTION واحد من:
- {"type":"plan","request":{"steps":[{"category":C,"subcategory":"S اختياري","placeName":"اختياري: اسم مكان حدده المستخدم","tags":[T],"mealTime":"lunch|dinner اختياري"}],"district":"اختياري","priority":"distance|rating|balanced","tags":[T]}}
- {"type":"clarify","question":"سؤال واحد قصير","options":[{"label":"..","value":".."}],"pending":{نفس شكل request بما فهمته}}
- {"type":"modify","op":"replace|lock|unlock|remove","index":رقم المحطة يبدأ من 0,"step":{"subcategory":S} اختياري لتغيير النوع,"nearer":true اختياري إذا طلب أقرب,"onlyThis":true اختياري إذا قال "بس"}
- {"type":"add","step":{"category":C,"subcategory":S اختياري,"tags":[T]}}
- {"type":"chat"}

C من: ${CATS.join(", ")} (gym=نادي، cafe=كوفي/قهوة، restaurant=مطعم/غدا/عشا، dessert=حلا، park=حديقة/ممشى، mall=مول)
S (النوع الفرعي، لازم يكون من نفس الفئة):
${SUB_DOC}
T من: ${TAGS.map((t) => `${t}=${TAG_LABELS[t]}`).join("، ")}
الأحياء المعروفة: ${Object.keys(DISTRICTS).join("، ")}

قواعد:
- "أبي مطعم" = restaurant بدون subcategory. لا تحط subcategory إلا إذا ذكر المستخدم النوع ("مطعم إيطالي" = italian، "وجبات سريعة" = fast_food، "كوفي هادي" = quiet).
- عبارات مثل "قريب من الكوفي" تشير لمحطة سابقة وما هي محطة جديدة.
- رتّب steps بنفس ترتيب كلام المستخدم ("نادي وبعده كوفي وبعده مطعم" = 3 خطوات بالترتيب).
- اسأل سؤال توضيحي واحد فقط إذا كان ضروري فعلاً لطلب من مكان واحد (مثل المسافة أو التقييم، أو هادي/جلسات خارجية للكوفي). لا تسأل أبداً إذا الطلب فيه أكثر من محطة.
- إذا فيه pending في السياق فالرسالة جواب على سؤالك: ادمجه وارجع plan ولا تسأل مرة ثانية.
- إذا فيه خطة حالية وطلب المستخدم تغيير/تثبيت/حذف محطة استخدم modify مع index الصحيح، أو add لإضافة محطة.
- لا تخترع أسماء أماكن ولا تدّعي إن مكان هادي؛ اختيار الأماكن يسويه النظام.`;

function isValid(a: AssistantAction | undefined, ctx: IntentContext): a is AssistantAction {
  if (!a || typeof a !== "object") return false;
  const okStep = (s: { category?: string }) => CATS.includes(s?.category as Category);
  switch (a.type) {
    case "plan":
      return Array.isArray(a.request?.steps) && a.request.steps.length > 0 && a.request.steps.every(okStep);
    case "clarify":
      return typeof a.question === "string" && Array.isArray(a.options);
    case "modify":
      return Number.isInteger(a.index) && a.index >= 0 && a.index < ctx.planSteps.length;
    case "add":
      return okStep(a.step);
    case "chat":
      return true;
    default:
      return false;
  }
}

const cleanTags = (t?: unknown) => (Array.isArray(t) ? (t.filter((x) => TAGS.includes(x)) as PlaceTag[]) : []);
/** Drop any subcategory the model made up or attached to the wrong category. */
const cleanSub = (category: Category, sub?: string) =>
  sub && SUBS.includes(sub as Subcategory) && SUBCATEGORY_META[sub as Subcategory].category === category ? (sub as Subcategory) : undefined;
const cleanStep = (s: StepSpec): StepSpec => ({ ...s, subcategory: cleanSub(s.category, s.subcategory), tags: cleanTags(s.tags) });

function sanitize(a: AssistantAction, ctx: IntentContext): AssistantAction {
  if (a.type === "add") a.step = cleanStep(a.step);
  if (a.type === "modify" && a.step) {
    const sub = cleanSub(ctx.planSteps[a.index].category, a.step.subcategory);
    a.step = sub ? { subcategory: sub } : undefined;
  }
  if (a.type === "plan") {
    a.request.tags = cleanTags(a.request.tags);
    a.request.steps = a.request.steps.map(cleanStep);
    if (a.request.district && !DISTRICTS[a.request.district]) a.request.district = undefined;
    if (!["distance", "rating", "balanced"].includes(a.request.priority ?? "")) a.request.priority = "balanced";
  }
  return a;
}

export async function POST(req: Request) {
  const { message, context, preferences }: Body = await req.json();
  const rules = parseWithRules(message, context);
  if (!groqEnabled()) return NextResponse.json(rules);

  try {
    const out = await groqJson<{ reply: string; action: AssistantAction }>(
      SYSTEM,
      JSON.stringify({
        message,
        currentPlan: context.planSteps.map((s, i) => ({ index: i, category: s.category, locked: s.locked })),
        pending: context.pending ?? null,
        learnedPreferences: preferences?.consent ? preferences : null,
      }),
    );
    if (!isValid(out.action, context)) return NextResponse.json(rules);
    const res: AssistantResponse = { reply: out.reply || rules.reply, action: sanitize(out.action, context), engine: "groq" };
    return NextResponse.json(res);
  } catch (e) {
    console.error("Groq failed, using rules", e);
    return NextResponse.json(rules);
  }
}
