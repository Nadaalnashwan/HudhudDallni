import { NextResponse } from "next/server";
import { CATEGORY_META } from "@/lib/catalog";
import { geminiEnabled, geminiText } from "@/lib/server/gemini";
import type { Category } from "@/lib/types";

type Body = {
  placeName: string;
  category: Category;
  rating: number;
  experience: "excellent" | "average" | "bad";
  reasons: string[];
  note?: string;
};

const OPENERS = {
  excellent: "تجربتي كانت ممتازة",
  average: "تجربتي كانت عادية",
  bad: "للأسف تجربتي ما كانت حلوة",
};

/** Drop the synthetic-data marker from a name so the draft reads naturally. */
const displayName = (n: string) => n.replace(" (تجريبي)", "").replace(/^تجريبي\s*-\s*/, "");

function templateDraft(b: Body) {
  const kind = CATEGORY_META[b.category].label;
  let text = `${OPENERS[b.experience]} في ${displayName(b.placeName)}.`;
  if (b.reasons.length) text += ` ${b.experience === "excellent" ? "أكثر شي عجبني" : "الملاحظات"}: ${b.reasons.join("، ")}.`;
  if (b.note) text += ` ${b.note}`;
  if (b.experience === "excellent") text += ` أنصح فيه لمن يدور ${kind} حلو.`;
  else if (b.experience === "bad") text += " أتمنى يتحسن مستقبلاً.";
  return text;
}

export async function POST(req: Request) {
  const body: Body = await req.json();
  if (!geminiEnabled()) return NextResponse.json({ text: templateDraft(body), engine: "template" });
  try {
    const text = await geminiText(
      "اكتب تقييم قصير (جملتين إلى أربع) بلهجة سعودية بصيغة المتكلم لمكان زاره المستخدم، مبني فقط على المعلومات المعطاة (التجربة، النجوم، الأسباب، الملاحظة). لا تخترع أطباق أو أسعار أو تفاصيل ما ذكرها المستخدم، ولا تبالغ. أعد نص التقييم فقط بدون مقدمات أو علامات تنصيص.",
      JSON.stringify({ ...body, placeName: displayName(body.placeName), kind: CATEGORY_META[body.category].label }),
    );
    return NextResponse.json({ text: text.replace(/^["«]|["»]$/g, ""), engine: "gemini" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ text: templateDraft(body), engine: "template" });
  }
}
