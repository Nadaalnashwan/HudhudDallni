import { NextResponse } from "next/server";
import { CATEGORY_META, SUBCATEGORY_META, TAG_LABELS } from "@/lib/catalog";
import { FEEDBACK_REASONS, type FeedbackAnalysis } from "@/lib/feedback";
import { geminiEnabled, geminiJson } from "@/lib/server/gemini";
import type { Category, PlaceTag, PreferenceUpdate, Subcategory } from "@/lib/types";

type Body = { note: string; reasons: string[]; experience: "excellent" | "average" | "bad"; category: Category; subcategory?: Subcategory };

const TAGS = Object.keys(TAG_LABELS) as PlaceTag[];

const SYSTEM = `تحلل ملاحظة مستخدم سعودي بعد زيارة مكان. أرجع JSON فقط:
{"reasons":[أسباب من القائمة فقط تنطبق على الملاحظة],"summary":"تلخيص محايد قصير للمشكلة أو الإعجاب","learned":{"likes":[T],"avoid":["نص قصير"],"budget":"low" أو null,"distance":"distance" أو null}}
القائمة: ${FEEDBACK_REASONS.join("، ")}
T: ${TAGS.map((t) => `${t}=${TAG_LABELS[t]}`).join("، ")}
استخرج فقط اللي قاله المستخدم صراحة. لا تفترض شي عن المكان. إذا ما فيه شي، رجّع قوائم فاضية.`;

/** Turns a free-text visit note into known reasons + preference hints (used only with the user's consent). */
export async function POST(req: Request) {
  const body: Body = await req.json();
  if (!body.note?.trim() || !geminiEnabled()) return NextResponse.json({ reasons: [], engine: "none" } satisfies FeedbackAnalysis);
  try {
    const out = await geminiJson<{ reasons?: unknown; summary?: unknown; learned?: Record<string, unknown> | null }>(
      SYSTEM,
      JSON.stringify({
        note: body.note,
        alreadySelected: body.reasons,
        experience: body.experience,
        placeType: body.subcategory ? `${CATEGORY_META[body.category].label} ${SUBCATEGORY_META[body.subcategory].label}` : CATEGORY_META[body.category].label,
      }),
    );
    const l = out.learned ?? {};
    const learned: PreferenceUpdate = {
      likes: Array.isArray(l.likes) ? (l.likes.filter((t) => TAGS.includes(t)) as PlaceTag[]) : [],
      avoid: Array.isArray(l.avoid) ? l.avoid.filter((a): a is string => typeof a === "string" && a.trim().length > 0).slice(0, 3) : [],
      budget: l.budget === "low" ? "low" : undefined,
      distance: l.distance === "distance" ? "distance" : undefined,
    };
    return NextResponse.json({
      reasons: Array.isArray(out.reasons) ? out.reasons.filter((r): r is string => FEEDBACK_REASONS.includes(r as string)) : [],
      summary: typeof out.summary === "string" ? out.summary.slice(0, 200) : undefined,
      learned,
      engine: "gemini",
    } satisfies FeedbackAnalysis);
  } catch (e) {
    console.error("feedback analysis failed:", (e as Error).message);
    return NextResponse.json({ reasons: [], engine: "none" } satisfies FeedbackAnalysis);
  }
}
