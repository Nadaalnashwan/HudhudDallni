"use client";
import { CATEGORY_META, TAG_LABELS } from "@/lib/catalog";
import type { Place } from "@/lib/types";

export function PlacePhoto({ place, className = "" }: { place: Place; className?: string }) {
  const meta = CATEGORY_META[place.category];
  if (place.photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={place.photoUrl} alt={place.name} className={`object-cover ${className}`} loading="lazy" />;
  return (
    <div
      className={`flex items-center justify-center text-3xl ${className}`}
      style={{ background: `linear-gradient(135deg, ${meta.color}33, ${meta.color}88)` }}
      aria-label={place.name}
    >
      {meta.emoji}
    </div>
  );
}

export function Stars({ value, size = "text-sm" }: { value?: number; size?: string }) {
  if (!value) return <span className="text-xs text-muted">بدون تقييم</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${size}`}>
      <span className="text-amber-500">★</span>
      <span className="font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}

export function TagChips({ place }: { place: Place }) {
  if (!place.tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {place.tags.map((t) => (
        <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
          {TAG_LABELS[t]}
        </span>
      ))}
    </div>
  );
}

export function Price({ level }: { level?: number }) {
  if (!level) return null;
  return <span className="text-xs text-muted">{"$".repeat(level)}</span>;
}

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
