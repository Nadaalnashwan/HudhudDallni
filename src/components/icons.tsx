"use client";
import { CakeSlice, Coffee, Dumbbell, Gamepad2, ShoppingBag, Trees, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { Category } from "@/lib/types";

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  gym: Dumbbell,
  dessert: CakeSlice,
  park: Trees,
  mall: ShoppingBag,
  entertainment: Gamepad2,
};

export function CategoryIcon({ category, className = "size-4" }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICON[category];
  return <Icon className={className} aria-hidden />;
}
