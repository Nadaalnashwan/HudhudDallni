"use client";
import { BarChart3, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { loadDallniStats, saveAssistantFeedback, type AssistantFeedback, type DallniStats } from "@/lib/store";
import { Spinner } from "./ui";

export const IMPROVEMENTS: { value: AssistantFeedback["improvements"][number]; label: string }[] = [
  { value: "accuracy", label: "دقة الاقتراحات" },
  { value: "proximity", label: "قرب الأماكن" },
  { value: "variety", label: "تنوع الخيارات" },
  { value: "understanding", label: "فهم الطلب" },
  { value: "editing", label: "سهولة تعديل الخطة" },
];

function Choice<T extends string>({ value, options, onChange }: { value?: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-4 py-1.5 text-sm ${value === o.value ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-line"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Feedback about دلّني itself — stored in hudhud_demo.assistant_feedback, never as a place review. */
export default function DallniFeedback({ planId, onDone }: { planId?: string; onDone: (message?: string) => void }) {
  const [helpful, setHelpful] = useState<AssistantFeedback["helpful"]>();
  const [usedPlace, setUsedPlace] = useState<AssistantFeedback["usedPlace"]>();
  const [improvements, setImprovements] = useState<AssistantFeedback["improvements"]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const where = await saveAssistantFeedback({ helpful: helpful!, usedPlace: usedPlace!, improvements }, planId);
    onDone(where === "supabase" ? "شكراً على رأيك في دلّني! 🙏" : "شكراً على رأيك! (انحفظ على جهازك — وضع تجريبي)");
  };

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-center">
      <div className="w-full space-y-4 rounded-t-3xl border border-line bg-surface p-5 md:max-w-md md:rounded-3xl">
        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1.5 font-bold">
            <Sparkles className="size-4 text-brand-600" aria-hidden /> رأيك في دلّني
          </p>
          <button onClick={() => onDone()} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-background" aria-label="تخطي">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2">
          <p>هل ساعدك دلّني في اختيار المكان أو تخطيط طلعتك؟</p>
          <Choice value={helpful} onChange={setHelpful} options={[{ value: "yes", label: "نعم" }, { value: "partly", label: "جزئيًا" }, { value: "no", label: "لا" }]} />
        </div>
        <div className="space-y-2">
          <p>هل استخدمت أحد الأماكن اللي اقترحها لك دلّني؟</p>
          <Choice value={usedPlace} onChange={setUsedPlace} options={[{ value: "yes", label: "نعم" }, { value: "no", label: "لا" }, { value: "not_yet", label: "لسه ما رحت" }]} />
        </div>
        <div className="space-y-2">
          <p>
            وش ممكن نحسن في دلّني؟ <span className="text-xs text-muted">(اختياري)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {IMPROVEMENTS.map((o) => {
              const on = improvements.includes(o.value);
              return (
                <button
                  key={o.value}
                  aria-pressed={on}
                  onClick={() => setImprovements((x) => (on ? x.filter((y) => y !== o.value) : [...x, o.value]))}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-muted">رأيك هنا عن دلّني نفسه، ما ينشر كتقييم لأي مكان، ويبقى خاص فيك.</p>
        <div className="flex gap-2">
          <button disabled={!helpful || !usedPlace || saving} onClick={submit} className="flex-1 rounded-xl bg-brand-500 py-2 text-white disabled:opacity-40">
            {saving ? <Spinner /> : "إرسال"}
          </button>
          <button onClick={() => onDone()} className="flex-1 rounded-xl border border-line py-2">
            مو الحين
          </button>
        </div>
      </div>
    </div>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/** Lightweight evaluation view from real stored data — aggregates only. */
export function DallniStatsSheet({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<DallniStats | null | undefined>(undefined);
  useEffect(() => {
    loadDallniStats().then(setStats);
  }, []);
  const top = stats ? Object.entries(stats.improvements).sort((a, b) => b[1] - a[1]) : [];
  const card = "rounded-xl bg-background p-3 text-center";
  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full space-y-3 rounded-t-3xl border border-line bg-surface p-5 md:max-w-md md:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <BarChart3 className="size-5 text-brand-600" aria-hidden /> مؤشرات دلّني
          </h2>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-background" aria-label="إغلاق">
            <X className="size-4" />
          </button>
        </div>
        {stats === undefined ? (
          <Spinner />
        ) : stats === null ? (
          <p className="text-sm text-muted">ما قدرنا نجيب المؤشرات من قاعدة البيانات.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className={card}>
                <p className="text-2xl font-bold">{stats.plans_started}</p>
                <p className="text-xs text-muted">طلعات بدأت بمساعدة دلّني</p>
              </div>
              <div className={card}>
                <p className="text-2xl font-bold">{stats.responses}</p>
                <p className="text-xs text-muted">ردود على تقييم دلّني</p>
              </div>
              <div className={card}>
                <p className="text-2xl font-bold">{pct(stats.helpful_yes, stats.responses)}</p>
                <p className="text-xs text-muted">قالوا إنه ساعدهم{stats.helpful_partly ? ` (+${pct(stats.helpful_partly, stats.responses)} جزئياً)` : ""}</p>
              </div>
              <div className={card}>
                <p className="text-2xl font-bold">{pct(stats.used_yes, stats.responses)}</p>
                <p className="text-xs text-muted">استخدموا مكان اقترحه</p>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">أكثر اقتراحات التحسين</p>
              {top.length ? (
                <ul className="space-y-1 text-sm">
                  {top.map(([k, n]) => (
                    <li key={k} className="flex justify-between">
                      <span>{IMPROVEMENTS.find((i) => i.value === k)?.label ?? k}</span>
                      <span className="text-muted">{n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">لا توجد اقتراحات بعد.</p>
              )}
            </div>
            <p className="text-[11px] text-muted">
              أرقام حقيقية من قاعدة بيانات النموذج الأولي (مجمّعة فقط، بدون أي رد فردي). عدد الردود صغير — ليست نتائج تقييم نهائية.
              {stats.responses < 5 && " البيانات ما زالت قليلة جداً للاستنتاج."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
