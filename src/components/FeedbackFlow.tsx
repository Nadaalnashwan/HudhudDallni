"use client";
import { Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { mergePreferences, NEGATIVE_REASONS, type FeedbackAnalysis } from "@/lib/feedback";
import { confirmVisit, publishReview, saveFeedback } from "@/lib/store";
import type { Preferences, Review, Visit } from "@/lib/types";
import { CategoryIcon } from "./icons";
import { Spinner } from "./ui";

type Experience = Review["experience"];

/** Turns what the user said into preferences — stated facts only, nothing assumed about specific places. */
const LEARN: Record<string, { like?: Preferences["likes"][number]; avoid?: string; minRating?: number; budget?: "low"; distance?: "distance" }> = {
  الزحمة: { like: "quiet", avoid: "الأماكن الزحمة" },
  النظافة: { avoid: "مشاكل النظافة", minRating: 4.2 },
  الأسعار: { like: "budget", avoid: "الأسعار المرتفعة", budget: "low" },
  الخدمة: { minRating: 4.3 },
  الموقع: { distance: "distance" },
  "المكان هادي": { like: "quiet" },
  "الأسعار مناسبة": { like: "budget" },
  "مناسب للمذاكرة": { like: "work" },
  "قريب ومناسب": { distance: "distance" },
};

const add = <T,>(list: T[], v?: T) => (v === undefined || list.includes(v) ? list : [...list, v]);

export function learnFromFeedback(prefs: Preferences, visit: Visit, exp: Experience, reasons: string[], note: string): Preferences {
  let next: Preferences = { ...prefs };
  for (const r of reasons) {
    const rule = LEARN[r];
    if (!rule) continue;
    next = { ...next, likes: add(next.likes, rule.like), avoid: add(next.avoid, rule.avoid) };
    if (rule.minRating) next.minRating = Math.max(next.minRating ?? 0, rule.minRating);
    if (rule.budget) next.budget = rule.budget;
    if (rule.distance) next.distance = rule.distance;
  }
  // A great experience teaches the type and area the user enjoys.
  if (exp === "excellent") {
    if (visit.category === "restaurant") next.cuisines = add(next.cuisines, visit.subcategory);
    if (visit.category === "cafe") next.cafeTypes = add(next.cafeTypes, visit.subcategory);
    next.neighborhoods = add(next.neighborhoods, visit.district);
  }
  if (note.trim()) next.notes = [...next.notes, note.trim()].slice(-10);
  return next;
}

const experienceOf = (stars: number): Experience => (stars >= 4 ? "excellent" : stars === 3 ? "average" : "bad");

type Step = "visited" | "experience" | "reasons" | "draft" | "consent";

/**
 * After "إنهاء الرحلة": visit confirmation → stars + written feedback → (1–2 stars) reasons →
 * Gemini draft → explicit publish consent → separate consent for long-term preferences.
 */
export default function FeedbackFlow({
  visit,
  prefs,
  onFinish,
  onPrefs,
}: {
  visit: Visit;
  prefs: Preferences;
  onFinish: (status: Visit["status"], message?: string) => void;
  onPrefs: (p: Preferences) => void;
}) {
  const [step, setStep] = useState<Step>("visited");
  const [stars, setStars] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [otherReason, setOtherReason] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState<Review["storage"] | null>(null);
  const [visitId, setVisitId] = useState<string>();
  const [analysis, setAnalysis] = useState<FeedbackAnalysis | null>(null);
  const exp = experienceOf(stars);
  const name = visit.placeName;
  // what the user actually said: chips (with their own "other" text) + reasons Gemini found in the note
  const pickedReasons = () => reasons.map((r) => (r === "سبب آخر" ? otherReason.trim() : r)).filter(Boolean);
  const allReasons = () => [...new Set([...pickedReasons(), ...(analysis?.reasons ?? [])])];
  const fullNote = () => [note.trim(), reasons.includes("سبب آخر") ? otherReason.trim() : ""].filter(Boolean).join(". ");

  const confirm = async () => {
    setStep("experience");
    setVisitId(await confirmVisit(visit));
  };

  const makeDraft = async () => {
    setStep("draft");
    setLoading(true);
    const post = (url: string, body: unknown) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    try {
      // draft the review and analyse the free-text note in parallel
      const [d, a] = await Promise.all([
        post("/api/review-draft", { placeName: name, category: visit.category, rating: stars, experience: exp, reasons: pickedReasons(), note: fullNote() }),
        fullNote()
          ? post("/api/feedback-analyze", { note: fullNote(), reasons: pickedReasons(), experience: exp, category: visit.category, subcategory: visit.subcategory }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setDraft(d.text);
      setAnalysis(a);
    } finally {
      setLoading(false);
    }
  };

  const publishedText = (where: Review["storage"] | null) =>
    where === "supabase" ? `نشرت تقييمك عن ${name} داخل هدهد ✅` : where === "local" ? `حفظت تقييمك عن ${name} محلياً على جهازك (وضع تجريبي) ✅` : "تمام، ما نشرت أي شي.";

  /** Nothing is written to the reviews table unless the user explicitly approves. */
  const publish = async (yes: boolean) => {
    let where: Review["storage"] | null = null;
    if (yes) {
      setLoading(true);
      try {
        where = await publishReview(
          { placeId: visit.placeId, placeName: name, rating: stars, experience: exp, reasons: pickedReasons(), body: draft.trim() },
          visit,
          { visitId, negativeReason: stars <= 2 ? [...allReasons(), analysis?.summary].filter(Boolean).join("، ") || undefined : undefined },
        );
        setPublished(where);
      } catch (e) {
        alert("ما قدرنا ننشر التقييم: " + (e as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    if (allReasons().length || fullNote() || exp === "excellent") setStep("consent");
    else onFinish("reviewed", publishedText(where));
  };

  const consent = async (yes: boolean) => {
    if (yes) {
      onPrefs(mergePreferences(learnFromFeedback({ ...prefs, consent: true }, visit, exp, allReasons(), fullNote()), analysis?.learned));
      await saveFeedback(visit, {
        sentiment: exp === "excellent" ? "positive" : exp === "average" ? "neutral" : "negative",
        reason: allReasons().join("، ") || undefined,
        notes: fullNote() || undefined,
      });
    }
    onFinish("reviewed", [publishedText(published), yes ? "وحفظت تفضيلاتك بموافقتك عشان أحسّن اقتراحاتي الجاية." : ""].join(" "));
  };

  const chip = (r: string) => (
    <button
      key={r}
      onClick={() => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
      aria-pressed={reasons.includes(r)}
      className={`rounded-full border px-3 py-1 text-sm ${reasons.includes(r) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}
    >
      {r}
    </button>
  );

  const field = "w-full rounded-xl border border-line bg-background p-2 text-sm outline-none focus:border-brand-500";

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-center">
      <div className="w-full space-y-4 rounded-t-3xl border border-line bg-surface p-5 md:max-w-md md:rounded-3xl">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CategoryIcon category={visit.category} />
          </span>
          <div>
            <p className="text-xs text-muted">دلّني</p>
            <p className="font-semibold">{name}</p>
          </div>
        </div>

        {step === "visited" && (
          <>
            <p className="text-lg">وصلت للمكان وزرته؟</p>
            <div className="flex gap-2">
              <button onClick={confirm} className="flex-1 rounded-xl bg-brand-500 py-2 text-white">إيه زرته</button>
              <button onClick={() => onFinish("skipped", `تمام، ما راح أسألك عن ${name}.`)} className="flex-1 rounded-xl border border-line py-2">لا، ما زرته</button>
            </div>
          </>
        )}

        {step === "experience" && (
          <>
            <p className="text-lg">كيف كانت تجربتك في المكان؟</p>
            <div className="flex items-center justify-center gap-1" dir="ltr" role="radiogroup" aria-label="التقييم بالنجوم">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setStars(n)} role="radio" aria-checked={stars === n} aria-label={`${n} من 5`}>
                  <Star className={`size-9 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="اكتب ملاحظتك عن المكان (اختياري)…" className={`h-20 ${field}`} />
            <button disabled={!stars} onClick={() => (stars <= 2 ? setStep("reasons") : makeDraft())} className="w-full rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
              التالي
            </button>
          </>
        )}

        {step === "reasons" && (
          <>
            <p className="text-lg">وش اللي ما عجبك؟</p>
            <div className="flex flex-wrap gap-2">{NEGATIVE_REASONS.map(chip)}</div>
            {reasons.includes("سبب آخر") && (
              <input value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="اكتب السبب…" className={field} autoFocus />
            )}
            <button onClick={makeDraft} disabled={!reasons.length || (reasons.length === 1 && reasons[0] === "سبب آخر" && !otherReason.trim())} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
              <Sparkles className="size-4" aria-hidden /> صِغ لي تقييم
            </button>
          </>
        )}

        {step === "draft" && (
          <>
            <p className="text-sm text-muted">صاغ دلّني تقييمك من كلامك، تقدر تعدّله:</p>
            {loading && !draft ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> جاري الصياغة...</div>
            ) : (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className={`h-32 leading-6 ${field}`} aria-label="نص التقييم" />
            )}
            {analysis && analysis.reasons.some((r) => !pickedReasons().includes(r)) && (
              <p className="text-xs text-brand-700">فهمت من ملاحظتك: {analysis.reasons.filter((r) => !pickedReasons().includes(r)).join("، ")}</p>
            )}
            <p className="text-lg font-semibold">تبغى ننشر تقييمك في هدهد؟</p>
            <p className="text-xs text-muted">
              {visit.source === "supabase" ? "ينشر داخل نسختنا من هدهد فقط، ومنفصل عن التقييم الأساسي للمكان." : "وضع تجريبي: يحفظ على جهازك فقط."} وما ينشر على Google Maps.
            </p>
            <div className="flex gap-2">
              <button disabled={!draft.trim() || loading} onClick={() => publish(true)} className="flex-1 rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
                {loading && draft ? <Spinner /> : "إيه، انشره"}
              </button>
              <button disabled={loading} onClick={() => publish(false)} className="flex-1 rounded-xl border border-line py-2">لا، لا تنشر</button>
            </div>
          </>
        )}

        {step === "consent" && (
          <>
            <p className="text-lg">تسمح لدلّني يحفظ تفضيلاتك من هالتجربة؟</p>
            <p className="text-sm text-muted">هذا منفصل عن نشر التقييم. مثلاً لو قلت إن المكان زحمة، بركّز على الأماكن الموصوفة بأنها هادية. تقدر تمسحها أي وقت من الإعدادات.</p>
            <div className="flex gap-2">
              <button onClick={() => consent(true)} className="flex-1 rounded-xl bg-brand-500 py-2 text-white">إيه احفظها</button>
              <button onClick={() => consent(false)} className="flex-1 rounded-xl border border-line py-2">لا</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
