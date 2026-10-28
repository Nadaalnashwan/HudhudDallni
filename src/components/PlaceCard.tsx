"use client";
import { CATEGORY_META } from "@/lib/catalog";
import { formatKm, haversineKm } from "@/lib/geo";
import type { LatLng, Place } from "@/lib/types";
import { PlacePhoto, Price, Stars, TagChips } from "./ui";

type Props = {
  place: Place;
  from?: LatLng;
  fromLabel?: string;
  reason?: string;
  badge?: string;
  selected?: boolean;
  onDetails?: () => void;
  onChoose?: () => void;
  chooseLabel?: string;
  onSelect?: () => void;
  compact?: boolean;
};

export default function PlaceCard({ place, from, fromLabel, reason, badge, selected, onDetails, onChoose, chooseLabel = "اختره", onSelect, compact }: Props) {
  const dist = from ? haversineKm(from, place.location) : undefined;
  return (
    <div
      onClick={onSelect}
      className={`overflow-hidden rounded-2xl border bg-surface shadow-sm transition ${selected ? "border-brand-500 ring-2 ring-brand-100" : "border-line"} ${onSelect ? "cursor-pointer" : ""} ${compact ? "w-60 shrink-0" : ""}`}
    >
      <div className="relative">
        <PlacePhoto place={place} className={compact ? "h-24 w-full" : "h-32 w-full"} />
        {badge && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{badge}</span>}
        {place.openNow === false && <span className="absolute left-2 top-2 rounded-full bg-red-600/90 px-2 py-0.5 text-[11px] text-white">مغلق الحين</span>}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-1 font-semibold">{place.name}</h4>
          <Stars value={place.rating} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>{CATEGORY_META[place.category].emoji} {CATEGORY_META[place.category].label}</span>
          <Price level={place.priceLevel} />
          {dist !== undefined && <span>• {formatKm(dist)}{fromLabel ? ` من ${fromLabel}` : ""}</span>}
        </div>
        <p className="line-clamp-1 text-xs text-muted">{place.address}</p>
        {!compact && <TagChips place={place} />}
        {reason && <p className="rounded-lg bg-brand-50 p-2 text-xs leading-5 text-brand-700">💡 {reason}</p>}
        {(onDetails || onChoose) && (
          <div className="flex gap-2 pt-1">
            {onChoose && (
              <button onClick={(e) => (e.stopPropagation(), onChoose())} className="flex-1 rounded-xl bg-brand-500 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
                {chooseLabel}
              </button>
            )}
            {onDetails && (
              <button onClick={(e) => (e.stopPropagation(), onDetails())} className="flex-1 rounded-xl border border-line py-1.5 text-sm hover:bg-background">
                التفاصيل
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
