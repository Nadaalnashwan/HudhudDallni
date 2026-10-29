"use client";
import { BadgeCheck, Clock, MapPin, Plus, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listReviews } from "@/lib/store";
import type { Place, Review } from "@/lib/types";
import { DirectionsIcon } from "./icons";
import { DemoBadge, PlacePhoto, Price, SheetHandle, Spinner, Stars, TagChips, typeLabel } from "./ui";

const EXP_LABEL = { excellent: "ممتازة", average: "عادية", bad: "سيئة" };
const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "photos", label: "الصور" },
  { id: "about", label: "حول المكان" },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Place details in Hudhud's layout: photo, title, status, tabs, and the action bar. */
export default function PlaceSheet({ place, onClose, onAddToPlan, onStartTrip }: { place: Place; onClose: () => void; onAddToPlan?: () => void; onStartTrip?: () => void }) {
  const [fresh, setFresh] = useState<Place | null>(null);
  const [ours, setOurs] = useState<Review[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    fetch(`/api/place/${encodeURIComponent(place.id)}?category=${place.category}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFresh(d?.place ?? null))
      .catch(() => setFresh(null));
    listReviews(place).then(setOurs);
  }, [place]);

  const p = fresh ?? place;
  const ourAvg = ours?.length ? ours.reduce((s, r) => s + r.rating, 0) / ours.length : undefined;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface md:max-w-lg md:rounded-3xl">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="relative">
            <PlacePhoto place={p} className="h-48 w-full" caption={false} />
            <div className="absolute inset-x-0 top-0">
              <SheetHandle onClose={onClose} />
            </div>
            <button onClick={onClose} className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-surface/90 shadow" aria-label="إغلاق">
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-1 px-4 pt-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-bold">{p.name}</h2>
              <DemoBadge place={p} />
            </div>
            <p className="text-sm text-muted">{typeLabel(p)}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {p.rating ? (
                <span className="inline-flex items-center gap-1">
                  <Stars value={p.rating} />
                  {p.ratingCount ? <span className="text-xs text-muted">({p.ratingCount.toLocaleString("en-US")})</span> : null}
                </span>
              ) : null}
              {p.openNow !== undefined && <span className={p.openNow ? "text-brand-600" : "text-red-600"}>{p.openNow ? "مفتوح الآن" : "مغلق الآن"}</span>}
              <Price level={p.priceLevel} />
            </div>
          </div>

          <div role="tablist" className="mt-3 flex gap-5 border-b border-line px-4 text-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 pb-2 ${tab === t.id ? "border-brand-500 font-semibold text-brand-600" : "border-transparent text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 p-4">
            {tab === "overview" && (
              <>
                <div className="space-y-1 text-sm text-muted">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-4 shrink-0" aria-hidden /> {p.address}
                  </p>
                  {p.hours && (
                    <p className="flex items-center gap-1.5">
                      <Clock className="size-4 shrink-0" aria-hidden /> {p.hours}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-background p-2">
                    <p className="text-xs text-muted">تقييم مستخدمي هدهد</p>
                    <Stars value={ourAvg} size="text-lg" />
                    <p className="text-[11px] text-muted">{ours?.length ?? 0} تقييم</p>
                  </div>
                  <div className="rounded-xl bg-background p-2">
                    <p className="text-xs text-muted">{p.source === "google" ? "تقييم Google" : "التقييم الأساسي"}</p>
                    <Stars value={p.rating} size="text-lg" />
                    <p className="text-[11px] text-muted">{(p.ratingCount ?? 0).toLocaleString("en-US")} تقييم</p>
                  </div>
                </div>

                <h3 className="pt-1 font-semibold">تقييمات مستخدمي هدهد</h3>
                {ours === null ? (
                  <Spinner />
                ) : ours.length ? (
                  <ul className="space-y-2">
                    {ours.map((r) => (
                      <li key={r.id} className="rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span>تجربة {EXP_LABEL[r.experience]}</span>
                          <span className="inline-flex gap-0.5" dir="ltr">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={`size-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
                            ))}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6">{r.body}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                          {new Date(r.createdAt).toLocaleDateString("ar-u-nu-latn")} • <BadgeCheck className="size-3" aria-hidden /> زيارة مؤكدة
                          {r.storage === "local" && " • على جهازك"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-muted">لا توجد تقييمات من مستخدمي هدهد بعد.</p>
                )}
              </>
            )}

            {tab === "photos" && <PlacePhoto place={p} className="aspect-[4/3] w-full rounded-xl" />}

            {tab === "about" && (
              <div className="space-y-3 text-sm">
                {p.summary && <p className="leading-6">{p.summary}</p>}
                <TagChips place={p} />
                <p className="flex items-center gap-1.5 text-muted">
                  <MapPin className="size-4 shrink-0" aria-hidden /> {p.address}
                </p>
                {p.hours && (
                  <p className="flex items-center gap-1.5 text-muted">
                    <Clock className="size-4 shrink-0" aria-hidden /> {p.hours}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {(onStartTrip || onAddToPlan) && (
          <div className="flex gap-2 border-t border-line p-3">
            {onStartTrip && (
              <button onClick={onStartTrip} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 py-2.5 font-bold text-white hover:bg-brand-600">
                <DirectionsIcon className="size-5" /> ابدأ رحلتك
              </button>
            )}
            {onAddToPlan && (
              <button onClick={onAddToPlan} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-background px-4 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <Plus className="size-4" aria-hidden /> أضف وجهة
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
