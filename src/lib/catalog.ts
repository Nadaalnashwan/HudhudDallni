import type { Category, LatLng, PlaceTag } from "./types";

export const CATEGORY_META: Record<Category, { label: string; emoji: string; color: string; googleType: string; query: string }> = {
  cafe: { label: "كوفي", emoji: "☕", color: "#8B5E3C", googleType: "cafe", query: "كوفي" },
  restaurant: { label: "مطعم", emoji: "🍽️", color: "#E4572E", googleType: "restaurant", query: "مطعم" },
  gym: { label: "نادي", emoji: "🏋️", color: "#2E86AB", googleType: "gym", query: "نادي رياضي" },
  dessert: { label: "حلا", emoji: "🍰", color: "#C2185B", googleType: "dessert_shop", query: "حلويات" },
  park: { label: "حديقة", emoji: "🌳", color: "#2E7D32", googleType: "park", query: "حديقة" },
  mall: { label: "مول", emoji: "🛍️", color: "#6A4C93", googleType: "shopping_mall", query: "مول" },
};

export const TAG_LABELS: Record<PlaceTag, string> = {
  quiet: "هادي",
  outdoor: "جلسات خارجية",
  family: "مناسب للعوائل",
  budget: "أسعار مناسبة",
  work: "مناسب للشغل",
  late: "يفتح لوقت متأخر",
};

export const DISTRICTS: Record<string, LatLng> = {
  العليا: { lat: 24.695, lng: 46.685 },
  الملقا: { lat: 24.805, lng: 46.61 },
  النرجس: { lat: 24.835, lng: 46.67 },
  حطين: { lat: 24.765, lng: 46.6 },
  الياسمين: { lat: 24.825, lng: 46.645 },
  السليمانية: { lat: 24.7, lng: 46.7 },
  الورود: { lat: 24.72, lng: 46.675 },
  الصحافة: { lat: 24.8, lng: 46.64 },
  قرطبة: { lat: 24.81, lng: 46.745 },
  الملز: { lat: 24.665, lng: 46.73 },
  الربوة: { lat: 24.69, lng: 46.76 },
  الدرعية: { lat: 24.735, lng: 46.575 },
};
