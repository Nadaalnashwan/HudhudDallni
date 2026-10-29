"use client";
import {
  mdiBank,
  mdiCoffee,
  mdiCupcake,
  mdiDirections,
  mdiDumbbell,
  mdiGamepadVariant,
  mdiMosque,
  mdiSchool,
  mdiShopping,
  mdiSilverwareForkKnife,
  mdiSoccer,
  mdiSubwayVariant,
  mdiTree,
  mdiWashingMachine,
} from "@mdi/js";
import type { Category } from "@/lib/types";

/** Filled icons, like Hudhud's category chips and pins (Material Design Icons, Apache-2.0). */
export const CATEGORY_ICON_PATH: Record<Category, string> = {
  cafe: mdiCoffee,
  restaurant: mdiSilverwareForkKnife,
  gym: mdiDumbbell,
  dessert: mdiCupcake,
  park: mdiTree,
  mall: mdiShopping,
  entertainment: mdiGamepadVariant,
  laundry: mdiWashingMachine,
  mosque: mdiMosque,
  sports: mdiSoccer,
  education: mdiSchool,
  transport: mdiSubwayVariant,
  government: mdiBank,
};

function FilledIcon({ path, className }: { path: string; className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function CategoryIcon({ category, className = "size-4" }: { category: Category; className?: string }) {
  return <FilledIcon path={CATEGORY_ICON_PATH[category]} className={className} />;
}

/** Hudhud's "start trip" sign: a turn arrow inside a diamond. */
export function DirectionsIcon({ className = "size-5" }: { className?: string }) {
  return <FilledIcon path={mdiDirections} className={className} />;
}
