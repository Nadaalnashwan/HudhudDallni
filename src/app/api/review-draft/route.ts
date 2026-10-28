import { NextResponse } from "next/server";
import { CATEGORY_META } from "@/lib/catalog";
import { groqEnabled, groqText } from "@/lib/server/groq";
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

function templateDraft(b: Body) {
  const kind = CATEGORY_META[b.category].label;
  let text = `${OPENERS[b.experience]} في ${b.placeName.replace(" (تجريبي)", "")}.`;
  if (b.reasons.length) text += ` ${b.experience === "excellent" ? "أكثر شي عجبني" : "الملاحظات"}: ${b.reasons.join("، ")}.`;
  if (b.note) text += ` ${b.note}`;
  if (b.experience === "excellent") text += ` أنصح فيه لمن يدور ${kind} حلو.`;
  else if (b.experience === "bad") text += " أتمنى يتحسن مستقبلاً.";
  return text;
}

export async function POST(req: Request) {
  const body: Body = await req.json();
  if (!groqEnabled()) return NextResponse.json({ text: templateDraft(body), engine: "template" });
  try {
    const text = await groqText(
      "اكتب تقييم قصير (جملتين إلى أربع) بلهجة سعودية بصيغة المتكلم لمكان زاره المستخدم، مبني فقط على المعلومات المعطاة بدون مبالغة أو اختراع تفاصيل. أعد نص التقييم فقط بدون مقدمات.",
      JSON.stringify(body),
    );
    return NextResponse.json({ text: text.replace(/^["«]|["»]$/g, ""), engine: "groq" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ text: templateDraft(body), engine: "template" });
  }
}
