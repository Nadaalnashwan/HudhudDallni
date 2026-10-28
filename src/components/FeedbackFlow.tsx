"use client";
import { useState } from "react";
import { CATEGORY_META } from "@/lib/catalog";
import { getUserId, publishReview } from "@/lib/store";
import type { Preferences, Review, Visit } from "@/lib/types";
import { Spinner } from "./ui";

type Experience = Review["experience"];

const NEGATIVE = ["المكان زحمة", "الأسعار مرتفعة", "الخدمة سيئة", "المكان ما يناسبني", "النظافة", "الانتظار طويل"];
const POSITIVE = ["المكان هادي", "جلسات خارجية حلوة", "الخدمة ممتازة", "الأسعار مناسبة", "مناسب للشغل", "الأكل/القهوة لذيذة"];

/** Turns what the user said into preferences — stated facts only, nothing assumed about specific places. */
const LEARN: Record<string, { like?: Preferences["likes"][number]; avoid?: string; minRating?: number }> = {
  "المكان زحمة": { like: "quiet", avoid: "الأماكن الزحمة" },
  "المكان هادي": { like: "quiet" },
  "الأسعار مرتفعة": { like: "budget", avoid: "الأسعار المرتفعة" },
  "الأسعار مناسبة": { like: "budget" },
  "الخدمة سيئة": { minRating: 4.3 },
  "جلسات خارجية حلوة": { like: "outdoor" },
  "مناسب للشغل": { like: "work" },
};

export function learnFromFeedback(prefs: Preferences, reasons: string[], note: string): Preferences {
  const next: Preferences = { ...prefs, likes: [...prefs.likes], avoid: [...prefs.avoid], notes: [...prefs.notes] };
  for (const r of reasons) {
    const rule = LEARN[r];
    if (!rule) continue;
    if (rule.like && !next.likes.includes(rule.like)) next.likes.push(rule.like);
    if (rule.avoid && !next.avoid.includes(rule.avoid)) next.avoid.push(rule.avoid);
    if (rule.minRating) next.minRating = Math.max(next.minRating ?? 0, rule.minRating);
  }
  if (note.trim()) next.notes = [...next.notes, note.trim()].slice(-10);
  return next;
}

type Step = "visited" | "experience" | "reasons" | "draft" | "consent" | "done";

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
  const [published, setPublished] = useState(false);
  const name = visit.placeName;

  const pickExp = (e: Experience) => {
    setExp(e);
    if (!stars) setStars(e === "excellent" ? 5 : e === "average" ? 3 : 2);
  };

  const makeDraft = async () => {
    setStep("draft");
    setLoading(true);
    try {
      const r = await fetch("/api/review-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeName: name, category: visit.category, rating: stars, experience: exp, reasons, note }),
      });
      setDraft((await r.json()).text);
    } finally {
      setLoading(false);
    }
  };

  const publish = async (yes: boolean) => {
    if (yes) {
      setLoading(true);
      try {
        await publishReview({
          id: crypto.randomUUID(),
          placeId: visit.placeId,
          placeName: name,
          rating: stars,
          experience: exp!,
          reasons,
          body: draft.trim(),
          createdAt: new Date().toISOString(),
          userId: getUserId(),
        });
        setPublished(true);
      } catch (e) {
        alert("ما قدرنا ننشر التقييم: " + (e as Error).message);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setStep(reasons.length || note ? "consent" : "done");
    if (!reasons.length && !note) onFinish("reviewed", yes ? `نشرت تقييمك عن ${name} داخل هدهد ✅` : "تمام، ما نشرت شي.");
  };

  const consent = (yes: boolean) => {
    if (yes) onPrefs(learnFromFeedback({ ...prefs, consent: true }, reasons, note));
    onFinish(
      "reviewed",
      [published ? `نشرت تقييمك عن ${name} داخل هدهد ✅` : "ما نشرت التقييم.", yes ? "وحفظت ملاحظاتك عشان أحسّن اقتراحاتي الجاية." : ""].join(" "),
    );
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
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-lg">{CATEGORY_META[visit.category].emoji}</span>
          <div>
            <p className="text-xs text-muted">مساعد هدهد</p>
            <p className="font-semibold">{name}</p>
          </div>
        </div>

        {step === "visited" && (
          <>
            <p className="text-lg">هلا 👋 زرت «{name}» فعلاً؟</p>
            <div className="flex gap-2">
              <button onClick={() => setStep("experience")} className="flex-1 rounded-xl bg-brand-500 py-2 text-white">إيه زرته</button>
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
                  ["excellent", "😍", "ممتازة"],
                  ["average", "😐", "عادية"],
                  ["bad", "😞", "سيئة"],
                ] as const
              ).map(([k, e, l]) => (
                <button key={k} onClick={() => pickExp(k)} className={`rounded-xl border py-3 ${exp === k ? "border-brand-500 bg-brand-50" : "border-line"}`}>
                  <div className="text-2xl">{e}</div>
                  <div className="text-sm">{l}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-1 text-3xl" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => (setStars(n), !exp && setExp(n >= 4 ? "excellent" : n === 3 ? "average" : "bad"))} className={n <= stars ? "text-amber-400" : "text-gray-300"} aria-label={`${n} نجوم`}>
                  ★
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
            <div className="flex flex-wrap gap-2">{(exp === "excellent" ? POSITIVE : NEGATIVE).map(chip)}</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="أو اكتب السبب بنفسك..." className="h-20 w-full rounded-xl border border-line p-2 text-sm outline-none focus:border-brand-500" />
            <button onClick={makeDraft} className="w-full rounded-xl bg-brand-500 py-2 text-white">✨ صِغ لي تقييم</button>
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
            <p className="text-xs text-muted">ينشر داخل هدهد فقط، وما ينشر على Google Maps.</p>
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
