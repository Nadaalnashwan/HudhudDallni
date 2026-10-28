"use client";
import { BadgeCheck, Clock, MapPin, Plus, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listReviews } from "@/lib/store";
import type { Place, Review } from "@/lib/types";
import { CategoryIcon } from "./icons";
import { DemoBadge, PlacePhoto, Price, Spinner, Stars, TagChips, typeLabel } from "./ui";

const EXP_LABEL = { excellent: "ممتازة", average: "عادية", bad: "سيئة" };

/** Place details: info, the dataset's seeded rating, and our users' published reviews — kept separate. */
export default function PlaceSheet({ place, onClose, onAddToPlan }: { place: Place; onClose: () => void; onAddToPlan?: () => void }) {
  const [fresh, setFresh] = useState<Place | null>(null);
  const [ours, setOurs] = useState<Review[] | null>(null);

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
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface md:max-w-lg md:rounded-3xl">
        <div className="relative">
          <PlacePhoto place={p} className="h-48 w-full" />
          <button onClick={onClose} className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 shadow" aria-label="إغلاق">
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-xl font-bold">{p.name}</h2>
              <DemoBadge place={p} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <CategoryIcon category={p.category} /> {typeLabel(p)}
              </span>
              <Price level={p.priceLevel} />
              {p.openNow !== undefined && <span className={p.openNow ? "text-brand-600" : "text-red-600"}>{p.openNow ? "مفتوح الحين" : "مغلق الحين"}</span>}
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin className="size-3.5" aria-hidden /> {p.address}
            </p>
            {p.hours && (
              <p className="flex items-center gap-1 text-sm text-muted">
                <Clock className="size-3.5" aria-hidden /> {p.hours} <span className="text-[11px]">(غير مؤكد)</span>
              </p>
            )}
          </div>
          {p.summary && <p className="text-sm">{p.summary}</p>}
          <TagChips place={p} />
          {p.isDemo && (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-5 text-amber-900">
              هذا مكان تجريبي من بيانات مولّدة لأغراض العرض. الاسم والموقع والتقييم الأساسي ليست لمنشأة حقيقية، والصورة توضيحية لنوع المكان.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-background p-2">
              <p className="text-xs text-muted">تقييم مستخدمي هدهد</p>
              <Stars value={ourAvg} size="text-lg" />
              <p className="text-[11px] text-muted">{ours?.length ?? 0} تقييم</p>
            </div>
            <div className="rounded-xl bg-background p-2">
              <p className="text-xs text-muted">{p.source === "google" ? "تقييم Google" : "التقييم الأساسي (تجريبي)"}</p>
              <Stars value={p.rating} size="text-lg" />
              <p className="text-[11px] text-muted">{p.ratingCount?.toLocaleString("ar-SA") ?? 0} تقييم</p>
            </div>
          </div>

          {onAddToPlan && (
            <button onClick={onAddToPlan} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2 font-medium text-white hover:bg-brand-600">
              <Plus className="size-4" aria-hidden /> أضفه للخطة
            </button>
          )}

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
                    {new Date(r.createdAt).toLocaleDateString("ar-SA")} • <BadgeCheck className="size-3" aria-hidden /> زيارة مؤكدة
                    {r.storage === "local" && " • محفوظ على جهازك (تجريبي)"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted">لا توجد تقييمات من مستخدمي هدهد بعد.</p>
          )}
        </div>
      </div>
    </div>
  );
}
