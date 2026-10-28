"use client";
import { useEffect, useState } from "react";
import { CATEGORY_META } from "@/lib/catalog";
import { listReviews } from "@/lib/store";
import type { Place, Review } from "@/lib/types";
import { PlacePhoto, Price, Spinner, Stars, TagChips } from "./ui";

type GoogleReview = { author: string; rating: number; text: string };

const EXP_LABEL = { excellent: "ممتازة", average: "عادية", bad: "سيئة" };

/** Place details page: info + our Hudhud reviews, kept separate from Google's. */
export default function PlaceSheet({ place, onClose, onAddToPlan }: { place: Place; onClose: () => void; onAddToPlan?: () => void }) {
  const [details, setDetails] = useState<{ place: Place; googleReviews: GoogleReview[] } | null>(null);
  const [ours, setOurs] = useState<Review[] | null>(null);
  const [tab, setTab] = useState<"hudhud" | "google">("hudhud");

  useEffect(() => {
    fetch(`/api/place/${encodeURIComponent(place.id)}?category=${place.category}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDetails(d ?? { place, googleReviews: [] }))
      .catch(() => setDetails({ place, googleReviews: [] }));
    listReviews(place.id).then(setOurs);
  }, [place]);

  const p = details?.place ?? place;
  const ourAvg = ours?.length ? ours.reduce((s, r) => s + r.rating, 0) / ours.length : undefined;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface md:max-w-lg md:rounded-3xl">
        <div className="relative">
          <PlacePhoto place={p} className="h-48 w-full" />
          <button onClick={onClose} className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-lg shadow" aria-label="إغلاق">
            ✕
          </button>
          {p.source === "demo" && <span className="absolute bottom-3 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-medium">بيانات تجريبية</span>}
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h2 className="text-xl font-bold">{p.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{CATEGORY_META[p.category].emoji} {CATEGORY_META[p.category].label}</span>
              <Price level={p.priceLevel} />
              {p.openNow !== undefined && <span className={p.openNow ? "text-brand-600" : "text-red-600"}>{p.openNow ? "مفتوح الحين" : "مغلق الحين"}</span>}
            </div>
            <p className="mt-1 text-sm text-muted">📍 {p.address}</p>
          </div>
          {p.summary && <p className="text-sm">{p.summary}</p>}
          <TagChips place={p} />

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-background p-2">
              <p className="text-xs text-muted">تقييم مستخدمي هدهد</p>
              <Stars value={ourAvg} size="text-lg" />
              <p className="text-[11px] text-muted">{ours?.length ?? 0} تقييم</p>
            </div>
            <div className="rounded-xl bg-background p-2">
              <p className="text-xs text-muted">{p.source === "demo" ? "تقييم المصدر (تجريبي)" : "تقييم Google"}</p>
              <Stars value={p.rating} size="text-lg" />
              <p className="text-[11px] text-muted">{p.ratingCount?.toLocaleString("ar-SA") ?? 0} تقييم</p>
            </div>
          </div>

          {onAddToPlan && (
            <button onClick={onAddToPlan} className="w-full rounded-xl bg-brand-500 py-2 font-medium text-white hover:bg-brand-600">
              ➕ أضفه للخطة
            </button>
          )}

          <div className="flex rounded-xl bg-background p-1 text-sm">
            {(["hudhud", "google"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-1.5 ${tab === t ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>
                {t === "hudhud" ? "تقييمات هدهد" : p.source === "demo" ? "تقييمات المصدر" : "تقييمات Google"}
              </button>
            ))}
          </div>

          {tab === "hudhud" ? (
            ours === null ? (
              <Spinner />
            ) : ours.length ? (
              <ul className="space-y-2">
                {ours.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>تجربة {EXP_LABEL[r.experience]}</span>
                      <span className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6">{r.body}</p>
                    <p className="mt-1 text-[11px] text-muted">{new Date(r.createdAt).toLocaleDateString("ar-SA")} • زيارة مؤكدة ✓</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted">لا توجد تقييمات من مستخدمي هدهد بعد.</p>
            )
          ) : details === null ? (
            <Spinner />
          ) : (
            <ul className="space-y-2">
              <p className="text-[11px] text-muted">تُعرض للاطلاع فقط ومنفصلة عن تقييمات هدهد. ما ننشر أي شيء على Google.</p>
              {details.googleReviews.map((r, i) => (
                <li key={i} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{r.author}</span>
                    <span className="text-amber-500">{"★".repeat(Math.round(r.rating))}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6">{r.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
