"use client";
import { Check, ChevronLeft, MapPin, Pin, PinOff, RefreshCw, Rocket, Route, X } from "lucide-react";
import { CATEGORY_META } from "@/lib/catalog";
import { formatKm, formatMinutes } from "@/lib/geo";
import type { Plan } from "@/lib/types";
import { CategoryIcon } from "./icons";
import { PlacePhoto, Spinner, Stars, typeLabel } from "./ui";

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

/** Leg text: driving time only when Google Routes supplied it; otherwise straight-line distance. */
function legText(meters: number, seconds?: number) {
  return seconds ? `${formatMinutes(seconds)} قيادة • ${formatKm(meters / 1000)}` : `${formatKm(meters / 1000)} بخط مستقيم`;
}

export default function PlanPipeline({ plan, busyIndex, selectedId, onSelect, onReplace, onToggleLock, onRemove, onStart }: Props) {
  const route = plan.route;
  const btn = "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px]";
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">خطة الطلعة</h3>
        {route && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Route className="size-3.5" aria-hidden /> {legText(route.distanceMeters, route.durationSeconds)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-blue-700">
          <MapPin className="size-3" aria-hidden /> {plan.originLabel}
        </span>
        {plan.stops.map((s, i) => (
          <span key={s.place.id} className="flex shrink-0 items-center gap-1">
            <ChevronLeft className="size-3.5 text-muted" aria-hidden />
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white" style={{ background: CATEGORY_META[s.step.category].color }}>
              <CategoryIcon category={s.step.category} className="size-3" /> {i + 1}. {typeLabel({ category: s.step.category, subcategory: s.step.subcategory })}
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
                  {legText(leg.distanceMeters, leg.durationSeconds)} من {s.anchorLabel}
                </div>
              )}
              <div
                onClick={() => onSelect(i)}
                className={`flex cursor-pointer gap-3 rounded-xl border p-2 transition ${selectedId === s.place.id ? "border-brand-500 bg-brand-50" : "border-line hover:bg-background"}`}
              >
                <div className="relative shrink-0">
                  <PlacePhoto place={s.place} className="size-16 rounded-lg" caption={false} />
                  <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: CATEGORY_META[s.step.category].color }}>
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                      {s.locked && <Pin className="size-3.5 shrink-0 text-brand-600" aria-label="مثبّت" />}
                      <span className="truncate">{s.place.name}</span>
                    </p>
                    <Stars value={s.place.rating} size="text-xs" />
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-4 text-muted">{s.reason}</p>
                  <div className="mt-1 flex gap-1.5">
                    <button disabled={s.locked || busyIndex != null} onClick={(e) => (e.stopPropagation(), onReplace(i))} className={`${btn} border-line hover:bg-surface disabled:opacity-40`}>
                      {busyIndex === i ? <Spinner /> : <RefreshCw className="size-3" aria-hidden />} غيّر
                    </button>
                    <button onClick={(e) => (e.stopPropagation(), onToggleLock(i))} className={`${btn} ${s.locked ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line"}`}>
                      {s.locked ? <PinOff className="size-3" aria-hidden /> : <Pin className="size-3" aria-hidden />} {s.locked ? "فك التثبيت" : "ثبّت"}
                    </button>
                    {plan.stops.length > 1 && (
                      <button onClick={(e) => (e.stopPropagation(), onRemove(i))} className={`${btn} border-line text-red-600`}>
                        <X className="size-3" aria-hidden /> شيل
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {route?.source === "straight_line" && <p className="mt-2 text-[10px] text-muted">المسافات تقريبية بخط مستقيم (Haversine)، وليست مسافة قيادة.</p>}

      <button onClick={onStart} disabled={Boolean(plan.startedAt)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2 font-medium text-white hover:bg-brand-600 disabled:bg-brand-100 disabled:text-brand-700">
        {plan.startedAt ? <Check className="size-4" aria-hidden /> : <Rocket className="size-4" aria-hidden />}
        {plan.startedAt ? "الطلعة بدأت — بالتوفيق!" : "ابدأ الطلعة"}
      </button>
    </div>
  );
}
