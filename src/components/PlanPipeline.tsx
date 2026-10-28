"use client";
import { CATEGORY_META } from "@/lib/catalog";
import { formatKm, formatMinutes } from "@/lib/geo";
import type { Plan } from "@/lib/types";
import { PlacePhoto, Spinner, Stars } from "./ui";

type Props = {
  plan: Plan;
  busyIndex?: number | null;
  selectedId?: string;
  onSelect: (i: number) => void;
  onReplace: (i: number) => void;
  onToggleLock: (i: number) => void;
  onRemove: (i: number) => void;
  onStart: () => void;
};

export default function PlanPipeline({ plan, busyIndex, selectedId, onSelect, onReplace, onToggleLock, onRemove, onStart }: Props) {
  const route = plan.route;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">خطة الطلعة</h3>
        {route && (
          <span className="text-xs text-muted">
            🚗 {formatMinutes(route.durationSeconds)} • {formatKm(route.distanceMeters / 1000)}
            {route.source === "demo" && " (تقديري)"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-blue-700">📍 {plan.originLabel}</span>
        {plan.stops.map((s, i) => (
          <span key={s.place.id} className="flex shrink-0 items-center gap-1">
            <span className="text-muted">←</span>
            <span className="rounded-full px-2 py-1 text-white" style={{ background: CATEGORY_META[s.step.category].color }}>
              {i + 1}. {CATEGORY_META[s.step.category].label}
            </span>
          </span>
        ))}
      </div>

      <ol className="mt-2 space-y-2">
        {plan.stops.map((s, i) => {
          const leg = route?.legs[i];
          return (
            <li key={s.place.id}>
              {leg && (
                <div className="mr-5 border-r-2 border-dashed border-brand-100 py-1 pr-3 text-[11px] text-muted">
                  {formatMinutes(leg.durationSeconds)} • {formatKm(leg.distanceMeters / 1000)} من {s.anchorLabel}
                </div>
              )}
              <div
                onClick={() => onSelect(i)}
                className={`flex cursor-pointer gap-3 rounded-xl border p-2 transition ${selectedId === s.place.id ? "border-brand-500 bg-brand-50" : "border-line hover:bg-background"}`}
              >
                <div className="relative">
                  <PlacePhoto place={s.place} className="size-16 rounded-lg" />
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: CATEGORY_META[s.step.category].color }}>
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {s.locked && "📌 "}
                      {s.place.name}
                    </p>
                    <Stars value={s.place.rating} size="text-xs" />
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-4 text-muted">{s.reason}</p>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      disabled={s.locked || busyIndex != null}
                      onClick={(e) => (e.stopPropagation(), onReplace(i))}
                      className="rounded-lg border border-line px-2 py-0.5 text-[11px] hover:bg-surface disabled:opacity-40"
                    >
                      {busyIndex === i ? <Spinner /> : "🔄 غيّر"}
                    </button>
                    <button onClick={(e) => (e.stopPropagation(), onToggleLock(i))} className={`rounded-lg border px-2 py-0.5 text-[11px] ${s.locked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}>
                      {s.locked ? "📌 مثبّت" : "📌 ثبّت"}
                    </button>
                    {plan.stops.length > 1 && (
                      <button onClick={(e) => (e.stopPropagation(), onRemove(i))} className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-red-600">
                        ✕ شيل
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <button onClick={onStart} disabled={Boolean(plan.startedAt)} className="mt-3 w-full rounded-xl bg-brand-500 py-2 font-medium text-white hover:bg-brand-600 disabled:bg-brand-100 disabled:text-brand-700">
        {plan.startedAt ? "✅ الطلعة بدأت — بالتوفيق!" : "🚀 ابدأ الطلعة"}
      </button>
    </div>
  );
}
