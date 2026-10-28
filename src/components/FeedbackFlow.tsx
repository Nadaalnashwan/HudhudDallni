"use client";
import { Frown, Meh, Smile, Sparkles, Star } from "lucide-react";
import { useState } from "react";
import { mergePreferences, NEGATIVE_REASONS, POSITIVE_REASONS, type FeedbackAnalysis } from "@/lib/feedback";
import { confirmVisit, publishReview, saveFeedback } from "@/lib/store";
import type { Preferences, Review, Visit } from "@/lib/types";
import { CategoryIcon } from "./icons";
import { Spinner } from "./ui";

type Experience = Review["experience"];


/** Turns what the user said into preferences — stated facts only, nothing assumed about specific places. */
const LEARN: Record<string, { like?: Preferences["likes"][number]; avoid?: string; minRating?: number; budget?: "low"; distance?: "distance" }> = {
  "المكان زحمة": { like: "quiet", avoid: "الأماكن الزحمة" },
  "المكان هادي": { like: "quiet" },
  "الأسعار مرتفعة": { like: "budget", avoid: "الأسعار المرتفعة", budget: "low" },
  "الأسعار مناسبة": { like: "budget" },
  "الخدمة سيئة": { minRating: 4.3 },
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

type Step = "visited" | "experience" | "reasons" | "draft" | "consent";

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
  const [exp, setExp] = useState<Experience | null>(null);
  const [stars, setStars] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [published, setPublished] = useState<Review["storage"] | null>(null);
  const [visitId, setVisitId] = useState<string>();
  const [analysis, setAnalysis] = useState<FeedbackAnalysis | null>(null);
  // chips the user picked + reasons Gemini found in their free-text note
  const allReasons = () => [...new Set([...reasons, ...(analysis?.reasons ?? [])])];
  const name = visit.placeName;

  const confirm = async () => {
    setStep("experience");
    setVisitId(await confirmVisit(visit));
  };

  const pickExp = (e: Experience) => {
    setExp(e);
    if (!stars) setStars(e === "excellent" ? 5 : e === "average" ? 3 : 2);
  };

  const makeDraft = async () => {
    setStep("draft");
    setLoading(true);
    const post = (url: string, body: unknown) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    try {
      // draft the review and analyse the free-text note in parallel
      const [d, a] = await Promise.all([
        post("/api/review-draft", { placeName: name, category: visit.category, rating: stars, experience: exp, reasons, note }),
        note.trim()
          ? post("/api/feedback-analyze", { note, reasons, experience: exp, category: visit.category, subcategory: visit.subcategory }).catch(() => null)
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
          { placeId: visit.placeId, placeName: name, rating: stars, experience: exp!, reasons, body: draft.trim() },
          visit,
          { visitId, negativeReason: exp !== "excellent" ? [...allReasons(), analysis?.summary ?? note.trim()].filter(Boolean).join("، ") || undefined : undefined },
        );
        setPublished(where);
      } catch (e) {
        alert("ما قدرنا ننشر التقييم: " + (e as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    if (reasons.length || note.trim() || exp === "excellent") setStep("consent");
    else onFinish("reviewed", publishedText(where));
  };

  const consent = async (yes: boolean) => {
    if (yes) {
      onPrefs(mergePreferences(learnFromFeedback({ ...prefs, consent: true }, visit, exp!, allReasons(), note), analysis?.learned));
      await saveFeedback(visit, {
        sentiment: exp === "excellent" ? "positive" : exp === "average" ? "neutral" : "negative",
        reason: allReasons().join("، ") || undefined,
        notes: note.trim() || undefined,
      });
    }
    onFinish("reviewed", [publishedText(published), yes ? "وحفظت ملاحظاتك بموافقتك عشان أحسّن اقتراحاتي الجاية." : ""].join(" "));
  };

  const chip = (r: string) => (
    <button
      key={r}
      onClick={() => setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))}
      className={`rounded-full border px-3 py-1 text-sm ${reasons.includes(r) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}
    >
      {r}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/40 md:items-center">
      <div className="w-full space-y-4 rounded-t-3xl bg-surface p-5 md:max-w-md md:rounded-3xl">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CategoryIcon category={visit.category} />
          </span>
          <div>
            <p className="text-xs text-muted">مساعد هدهد</p>
            <p className="font-semibold">{name}</p>
          </div>
        </div>

        {step === "visited" && (
          <>
            <p className="text-lg">هلا، زرت «{name}» فعلاً؟</p>
            <div className="flex gap-2">
              <button onClick={confirm} className="flex-1 rounded-xl bg-brand-500 py-2 text-white">إيه زرته</button>
              <button onClick={() => onFinish("skipped", `تمام، ما راح أسألك عن ${name}.`)} className="flex-1 rounded-xl border border-line py-2">لا، ما رحت</button>
            </div>
          </>
        )}

        {step === "experience" && (
          <>
            <p className="text-lg">كيف كانت تجربتك؟</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["excellent", Smile, "ممتازة"],
                  ["average", Meh, "عادية"],
                  ["bad", Frown, "سيئة"],
                ] as const
              ).map(([k, Icon, l]) => (
                <button key={k} onClick={() => pickExp(k)} className={`rounded-xl border py-3 ${exp === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}>
                  <Icon className="mx-auto size-7" aria-hidden />
                  <div className="text-sm">{l}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => (setStars(n), !exp && setExp(n >= 4 ? "excellent" : n === 3 ? "average" : "bad"))} aria-label={`${n} نجوم`}>
                  <Star className={`size-8 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            <button disabled={!exp || !stars} onClick={() => setStep("reasons")} className="w-full rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
              التالي
            </button>
          </>
        )}

        {step === "reasons" && (
          <>
            <p className="text-lg">{exp === "excellent" ? "وش أكثر شي عجبك؟" : "وش السبب؟ وش ما عجبك؟"}</p>
            <div className="flex flex-wrap gap-2">{(exp === "excellent" ? POSITIVE_REASONS : NEGATIVE_REASONS).map(chip)}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="أو اكتب السبب بنفسك..." className="h-20 w-full rounded-xl border border-line p-2 text-sm outline-none focus:border-brand-500" />
            <button onClick={makeDraft} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2 text-white">
              <Sparkles className="size-4" aria-hidden /> صِغ لي تقييم
            </button>
          </>
        )}

        {step === "draft" && (
          <>
            <p className="text-lg">هذي صياغة مقترحة لتقييمك، تقدر تعدلها:</p>
            {loading && !draft ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> جاري الصياغة...</div>
            ) : (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="h-32 w-full rounded-xl border border-line p-3 text-sm leading-6 outline-none focus:border-brand-500" />
            )}
            {analysis && analysis.reasons.some((r) => !reasons.includes(r)) && (
              <p className="text-xs text-brand-700">فهمت من ملاحظتك: {analysis.reasons.filter((r) => !reasons.includes(r)).join("، ")}</p>
            )}
            <p className="text-xs text-muted">
              {visit.source === "supabase" ? "ينشر داخل نسختنا من هدهد فقط بموافقتك، ومنفصل عن التقييم الأساسي للمكان." : "وضع تجريبي: يحفظ على جهازك فقط."} وما ينشر على Google Maps.
            </p>
            <div className="flex gap-2">
              <button disabled={!draft.trim() || loading} onClick={() => publish(true)} className="flex-1 rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
                {loading && draft ? <Spinner /> : "انشر التقييم"}
              </button>
              <button disabled={loading} onClick={() => publish(false)} className="flex-1 rounded-xl border border-line py-2">لا تنشر</button>
            </div>
          </>
        )}

        {step === "consent" && (
          <>
            <p className="text-lg">تبيني أحفظ ملاحظاتك عشان أحسّن اقتراحاتي لك مستقبلاً؟</p>
            <p className="text-sm text-muted">مثلاً لو قلت إن المكان كان زحمة، بركّز على الأماكن الموصوفة بأنها هادية. تقدر تمسحها أي وقت.</p>
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
