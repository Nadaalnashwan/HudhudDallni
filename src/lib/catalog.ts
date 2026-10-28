import type { Category, LatLng, PlaceTag, Subcategory } from "./types";

/**
 * Central Arabic/English taxonomy. Keys match `hudhud_demo.places.category` /
 * `subcategory` exactly, so a parsed subcategory can be used as a real DB filter.
 */
export const CATEGORY_META: Record<Category, { label: string; plural: string; color: string; googleType: string; query: string }> = {
  cafe: { label: "كوفي", plural: "كوفيهات", color: "#8B5E3C", googleType: "cafe", query: "كوفي" },
  restaurant: { label: "مطعم", plural: "مطاعم", color: "#E4572E", googleType: "restaurant", query: "مطعم" },
  gym: { label: "نادي", plural: "أندية", color: "#2E86AB", googleType: "gym", query: "نادي رياضي" },
  dessert: { label: "حلويات", plural: "حلويات", color: "#C2185B", googleType: "dessert_shop", query: "حلويات" },
  park: { label: "حديقة", plural: "حدائق", color: "#2E7D32", googleType: "park", query: "حديقة" },
  mall: { label: "مول", plural: "مولات", color: "#6A4C93", googleType: "shopping_mall", query: "مول" },
  entertainment: { label: "ترفيه", plural: "ترفيه", color: "#F2994A", googleType: "amusement_center", query: "ألعاب ترفيه" },
};

export const SUBCATEGORY_META: Record<Subcategory, { category: Category; label: string; words: string[] }> = {
  italian: { category: "restaurant", label: "إيطالي", words: ["ايطالي", "باستا", "مكرونه", "italian"] },
  fast_food: { category: "restaurant", label: "وجبات سريعة", words: ["وجبات سريعه", "فاست فود", "fast food", "سريعه"] },
  burger: { category: "restaurant", label: "برجر", words: ["برجر", "برقر", "بيرجر", "burger"] },
  pizza: { category: "restaurant", label: "بيتزا", words: ["بيتزا", "pizza"] },
  saudi: { category: "restaurant", label: "سعودي", words: ["سعودي", "شعبي", "كبسه", "مندي", "نجدي"] },
  shawarma: { category: "restaurant", label: "شاورما", words: ["شاورما", "شاورمه", "shawarma"] },
  indian: { category: "restaurant", label: "هندي", words: ["هندي", "برياني", "indian"] },
  asian: { category: "restaurant", label: "آسيوي", words: ["اسيوي", "صيني", "ياباني", "سوشي", "تايلندي", "كوري", "asian"] },
  seafood: { category: "restaurant", label: "بحري", words: ["بحري", "بحريات", "سمك", "روبيان", "seafood"] },
  grill: { category: "restaurant", label: "مشاوي", words: ["مشاوي", "مشويات", "شوايه", "grill"] },
  specialty_coffee: { category: "cafe", label: "قهوة مختصة", words: ["مختصه", "مختص", "specialty"] },
  quiet: { category: "cafe", label: "هادي", words: ["هادي", "هادئ", "هدوء", "رايق"] },
  study: { category: "cafe", label: "للمذاكرة", words: ["مذاكره", "للمذاكره", "اذاكر", "ادرس", "دراسه", "لابتوب", "اشتغل"] },
  drive_thru: { category: "cafe", label: "درايف ثرو", words: ["درايف", "drive", "من السياره", "سياره"] },
  fitness: { category: "gym", label: "لياقة", words: ["لياقه", "فتنس", "fitness"] },
  women: { category: "gym", label: "نسائي", words: ["نسائي", "للبنات", "بنات", "نساء", "women"] },
  bakery: { category: "dessert", label: "مخبز", words: ["مخبز", "مخبوزات", "معجنات", "كرواسون", "bakery"] },
  ice_cream: { category: "dessert", label: "آيس كريم", words: ["ايس كريم", "ايسكريم", "بوظه", "جيلاتو", "ice cream"] },
  public_park: { category: "park", label: "حديقة عامة", words: [] },
  shopping: { category: "mall", label: "تسوق", words: [] },
  games: { category: "entertainment", label: "ألعاب", words: ["العاب", "قيمز", "games"] },
};

export const subcategoriesOf = (c: Category) =>
  (Object.keys(SUBCATEGORY_META) as Subcategory[]).filter((s) => SUBCATEGORY_META[s].category === c);

/** Local, licensed illustrative photos — generic per type, never presented as the real venue. */
export const subcategoryImage = (s?: Subcategory, c?: Category) => `/images/places/${s ?? `cat-${c}`}.jpg`;

export const TAG_LABELS: Record<PlaceTag, string> = {
  quiet: "هادي",
  outdoor: "جلسات خارجية",
  family: "مناسب للعوائل",
  budget: "أسعار مناسبة",
  work: "مناسب للمذاكرة",
  late: "يفتح لوقت متأخر",
};

/** Riyadh neighborhoods in the hudhud_demo dataset; centers are the mean of its seeded coordinates. */
export const DISTRICTS: Record<string, LatLng> = {
  العليا: { lat: 24.688, lng: 46.6848 },
  السليمانية: { lat: 24.7038, lng: 46.7115 },
  الملقا: { lat: 24.8026, lng: 46.6068 },
  الصحافة: { lat: 24.8044, lng: 46.6441 },
  حطين: { lat: 24.7748, lng: 46.6091 },
  الياسمين: { lat: 24.831, lng: 46.6448 },
  النرجس: { lat: 24.8526, lng: 46.6784 },
  الربيع: { lat: 24.7961, lng: 46.6673 },
  قرطبة: { lat: 24.815, lng: 46.7418 },
  العارض: { lat: 24.8893, lng: 46.6372 },
};
