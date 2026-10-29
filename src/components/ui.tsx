"use client";
import { FlaskConical, Star } from "lucide-react";
import { useRef, useState } from "react";
import { CATEGORY_META, SUBCATEGORY_META, subcategoryImage, TAG_LABELS } from "@/lib/catalog";
import type { Place } from "@/lib/types";
import { CategoryIcon } from "./icons";

/**
 * A real photo of the venue when the data has one; otherwise a licensed generic
 * photo of the place type, captioned as illustrative. Falls back to an icon tile.
 */
export function PlacePhoto({ place, className = "", caption = true }: { place: Place; className?: string; caption?: boolean }) {
  const generic = !place.photoUrl;
  const sources = [place.photoUrl, subcategoryImage(place.subcategory), subcategoryImage(undefined, place.category)].filter(Boolean) as string[];
  // failed-source index, reset whenever a different place is shown
  const [failed, setFailed] = useState({ id: place.id, i: 0 });
  const i = failed.id === place.id ? failed.i : 0;
  const color = CATEGORY_META[place.category].color;
  if (i >= sources.length)
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ background: `linear-gradient(135deg, ${color}22, ${color}66)`, color }}>
        <CategoryIcon category={place.category} className="size-8" />
      </div>
    );
  const genericNow = generic || i > 0;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sources[i]} alt={genericNow ? `صورة توضيحية: ${typeLabel(place)}` : place.name} className="size-full object-cover" loading="lazy" onError={() => setFailed({ id: place.id, i: i + 1 })} />
      {genericNow && caption && <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">صورة توضيحية</span>}
    </div>
  );
}

/** Subcategories that already name the place type on their own ("قهوة مختصة", not "مقهى قهوة مختصة"). */
const STANDALONE = new Set(["specialty_coffee", "bakery", "ice_cream", "public_park", "games"]);

export const typeLabel = (p: Pick<Place, "category" | "subcategory">) =>
  !p.subcategory || SUBCATEGORY_META[p.subcategory].label.includes(CATEGORY_META[p.category].label)
    ? CATEGORY_META[p.category].label
    : STANDALONE.has(p.subcategory)
      ? SUBCATEGORY_META[p.subcategory].label
      : `${CATEGORY_META[p.category].label} ${SUBCATEGORY_META[p.subcategory].label}`;

export function Stars({ value, size = "text-sm" }: { value?: number; size?: string }) {
  if (!value) return <span className="text-xs text-muted">بدون تقييم</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${size}`}>
      <Star className="size-[1em] fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}

export function TagChips({ place }: { place: Place }) {
  const labels = [...new Set([...place.tags.map((t) => TAG_LABELS[t]), ...(place.labels ?? [])])];
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((t) => (
        <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
          {t}
        </span>
      ))}
    </div>
  );
}

export function DemoBadge({ place }: { place: Place }) {
  if (!place.isDemo) return null;
  return (
    <span
      title="مكان من بيانات مولّدة للعرض: الاسم والموقع والتقييم ليست لمنشأة حقيقية، والصورة توضيحية."
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900"
    >
      <FlaskConical className="size-3" aria-hidden /> مكان تجريبي
    </span>
  );
}

export function Price({ level }: { level?: number }) {
  if (!level) return null;
  return <span className="text-xs text-muted">{"$".repeat(level)}</span>;
}

/** Grab handle on mobile bottom sheets, like Hudhud's. A downward swipe or a tap closes the sheet. */
export function SheetHandle({ onClose, label = "إغلاق" }: { onClose: () => void; label?: string }) {
  const startY = useRef<number | null>(null);
  return (
    <button
      type="button"
      onClick={onClose}
      onPointerDown={(e) => (startY.current = e.clientY)}
      onPointerUp={(e) => {
        if (startY.current !== null && e.clientY - startY.current > 40) onClose();
        startY.current = null;
      }}
      aria-label={label}
      className="flex w-full touch-none justify-center pb-1 pt-2 md:hidden"
    >
      <span className="h-1 w-10 rounded-full bg-line" />
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />;
}
