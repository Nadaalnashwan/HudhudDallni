import type { Category, LatLng, LocationStatus, Place, PlaceTag, Subcategory } from "./types";

/**
 * Central Arabic/English taxonomy. Keys match `hudhud_demo.places.category` /
 * `subcategory` exactly, so a parsed subcategory can be used as a real DB filter.
 */
export const CATEGORY_META: Record<Category, { label: string; plural: string; color: string; googleType: string; query: string }> = {
  cafe: { label: "مقهى", plural: "مقاهي", color: "#8B5E3C", googleType: "cafe", query: "كوفي" },
  restaurant: { label: "مطعم", plural: "مطاعم", color: "#E4572E", googleType: "restaurant", query: "مطعم" },
  gym: { label: "نادي", plural: "أندية رياضية", color: "#2E86AB", googleType: "gym", query: "نادي رياضي" },
  dessert: { label: "حلويات", plural: "حلويات", color: "#C2185B", googleType: "dessert_shop", query: "حلويات" },
  park: { label: "حديقة", plural: "حدائق", color: "#2E7D32", googleType: "park", query: "حديقة" },
  mall: { label: "مول", plural: "مولات", color: "#6A4C93", googleType: "shopping_mall", query: "مول" },
  entertainment: { label: "ترفيه", plural: "ترفيه", color: "#F2994A", googleType: "amusement_center", query: "ألعاب ترفيه" },
  // Everyday places. Colors keep at least 3:1 contrast with the white pin icon.
  laundry: { label: "مغسلة", plural: "مغاسل", color: "#A21CAF", googleType: "laundry", query: "مغسلة" },
  mosque: { label: "مسجد", plural: "مساجد", color: "#0F766E", googleType: "mosque", query: "مسجد" },
  sports: { label: "ملعب", plural: "ملاعب", color: "#4D7C0F", googleType: "sports_complex", query: "ملعب" },
  education: { label: "تعليم", plural: "تعليم", color: "#A16207", googleType: "school", query: "مدرسة جامعة" },
  transport: { label: "مترو", plural: "محطات المترو", color: "#1D4ED8", googleType: "subway_station", query: "محطة مترو" },
  government: { label: "وزارة", plural: "وزارات", color: "#475569", googleType: "government_office", query: "وزارة" },
};

export const SUBCATEGORY_META: Record<Subcategory, { category: Category; label: string; words: string[] }> = {
  italian: { category: "restaurant", label: "إيطالي", words: ["ايطالي", "باستا", "مكرونه", "italian"] },
  fast_food: { category: "restaurant", label: "وجبات سريعة", words: ["وجبات سريعه", "فاست فود", "fast food", "سريعه"] },
  burger: { category: "restaurant", label: "برجر", words: ["برجر", "برقر", "بيرجر", "برغر", "burger"] },
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
  bakery: { category: "dessert", label: "مخبز", words: ["مخبز", "مخابز", "مخبوزات", "معجنات", "كرواسون", "bakery"] },
  ice_cream: { category: "dessert", label: "آيس كريم", words: ["ايس كريم", "ايسكريم", "بوظه", "جيلاتو", "ice cream"] },
  public_park: { category: "park", label: "حديقة عامة", words: [] },
  shopping: { category: "mall", label: "تسوق", words: [] },
  games: { category: "entertainment", label: "ألعاب", words: ["العاب", "قيمز", "games"] },
  // Words are matched after normalization (no hamza, ة→ه, ى→ي). These categories are implied by their
  // words alone, so keep each word specific: no bare "سيارات" or "ملابس".
  car_wash: { category: "laundry", label: "مغسلة سيارات", words: ["مغسله سيارات", "مغسله سياره", "مغاسل سيارات", "غسيل سيارات", "غسيل سياره", "تغسيل سياره", "اغسل سياره", "اغسل سيارتي", "اغسل السياره", "car wash", "carwash"] },
  clothes_laundry: { category: "laundry", label: "مغسلة ملابس", words: ["مغسله ملابس", "مصبغه", "مصابغ", "غسيل ملابس", "كوي ملابس", "دراي كلين", "laundry"] },
  mosque: { category: "mosque", label: "مسجد", words: ["مسجد", "مساجد", "جامع", "مصلي", "mosque"] },
  football: { category: "sports", label: "ملعب كرة قدم", words: ["كره قدم", "كره القدم", "ملعب كوره", "كوره", "فوتبول", "football", "soccer"] },
  padel: { category: "sports", label: "ملعب بادل", words: ["بادل", "باديل", "padel"] },
  primary_school: { category: "education", label: "مدرسة ابتدائية", words: ["ابتدائي", "ابتدايي", "primary school"] },
  secondary_school: { category: "education", label: "مدرسة ثانوية", words: ["ثانوي", "high school", "secondary school"] },
  university: { category: "education", label: "جامعة", words: ["جامعه", "جامعات", "university"] },
  academy: { category: "education", label: "أكاديمية", words: ["اكاديمي", "اكادمي", "طويق", "academy"] },
  metro_station: { category: "transport", label: "محطة مترو", words: ["محطه مترو", "محطات مترو", "مترو", "metro"] },
  ministry: { category: "government", label: "وزارة", words: ["وزاره", "وزارات", "ministry"] },
};

export const subcategoriesOf = (c: Category) =>
  (Object.keys(SUBCATEGORY_META) as Subcategory[]).filter((s) => SUBCATEGORY_META[s].category === c);

/** Types that have a local photo in /public/images/places. Others render a colored icon tile instead. */
const LOCAL_IMAGES = new Set<string>([
  ...["italian", "fast_food", "burger", "pizza", "saudi", "shawarma", "indian", "asian", "seafood", "grill"],
  ...["specialty_coffee", "quiet", "study", "drive_thru", "fitness", "women", "bakery", "ice_cream", "public_park", "shopping", "games"],
  ...["cafe", "restaurant", "gym", "dessert", "park", "mall", "entertainment"].map((c) => `cat-${c}`),
]);

/** Local, licensed illustrative photos — generic per type, never presented as the real venue. */
export const subcategoryImage = (s?: Subcategory, c?: Category) => {
  const key = s ?? `cat-${c}`;
  return LOCAL_IMAGES.has(key) ? `/images/places/${key}.jpg` : undefined;
};

/** "النادي", "الجامعة": how a stop is referred to as the anchor of the next one. */
export function anchorLabel(category: Category, subcategory?: Subcategory) {
  // Education types have no shared noun, so name the type itself ("المدرسة", "الجامعة").
  const word = category === "education" && subcategory ? SUBCATEGORY_META[subcategory].label.split(" ")[0] : CATEGORY_META[category].label;
  return "ال" + word.replace(/^ال/, "");
}

/** Plans saved before location_status existed have no value: demo rows were synthetic, Google results are real. */
export const locationStatusOf = (p: Pick<Place, "locationStatus" | "isDemo">): LocationStatus => p.locationStatus ?? (p.isDemo ? "synthetic" : "verified");

export const TAG_LABELS: Record<PlaceTag, string> = {
  quiet: "هادي",
  outdoor: "جلسات خارجية",
  family: "مناسب للعوائل",
  budget: "أسعار مناسبة",
  work: "مناسب للمذاكرة",
  late: "يفتح لوقت متأخر",
};

/**
 * Other Riyadh neighborhoods people name ("مقهى بالنسيم"). The dataset has no places inside them, so a
 * stop there gets the places closest to the neighborhood's center (OpenStreetMap neighborhood features).
 */
export const RIYADH_AREAS: Record<string, LatLng> = {
  النسيم: { lat: 24.7189, lng: 46.8256 },
  الروضة: { lat: 24.7341, lng: 46.7672 },
  الملز: { lat: 24.6561, lng: 46.7275 },
  النخيل: { lat: 24.7422, lng: 46.6375 },
  الورود: { lat: 24.7244, lng: 46.6785 },
  المروج: { lat: 24.7578, lng: 46.6637 },
  المرسلات: { lat: 24.749, lng: 46.6898 },
  الغدير: { lat: 24.7742, lng: 46.6556 },
  النفل: { lat: 24.7819, lng: 46.6731 },
  التعاون: { lat: 24.7743, lng: 46.6989 },
  الازدهار: { lat: 24.7794, lng: 46.7181 },
  الفلاح: { lat: 24.7963, lng: 46.7088 },
  المصيف: { lat: 24.7655, lng: 46.6802 },
  الوادي: { lat: 24.7894, lng: 46.6914 },
  الرحمانية: { lat: 24.717, lng: 46.659 },
  المحمدية: { lat: 24.7326, lng: 46.6503 },
  الرائد: { lat: 24.7075, lng: 46.6396 },
  الخزامى: { lat: 24.7179, lng: 46.5906 },
  السفارات: { lat: 24.6816, lng: 46.6236 },
  عرقة: { lat: 24.6841, lng: 46.5826 },
  السويدي: { lat: 24.5912, lng: 46.673 },
  العريجاء: { lat: 24.6257, lng: 46.6566 },
  الشفا: { lat: 24.5631, lng: 46.6967 },
  العزيزية: { lat: 24.5877, lng: 46.7701 },
  الديرة: { lat: 24.6323, lng: 46.7108 },
  المربع: { lat: 24.6599, lng: 46.7098 },
  الفيحاء: { lat: 24.6833, lng: 46.8044 },
  الجزيرة: { lat: 24.6655, lng: 46.7949 },
  السلي: { lat: 24.6599, lng: 46.8349 },
  الريان: { lat: 24.7124, lng: 46.7788 },
  اليرموك: { lat: 24.8085, lng: 46.7835 },
  غرناطة: { lat: 24.7912, lng: 46.7437 },
  القدس: { lat: 24.755, lng: 46.754 },
  الخليج: { lat: 24.7768, lng: 46.8035 },
  النهضة: { lat: 24.7608, lng: 46.8061 },
  الروابي: { lat: 24.697, lng: 46.7901 },
  الربوة: { lat: 24.6934, lng: 46.7589 },
  المعذر: { lat: 24.6922, lng: 46.6661 },
  الندى: { lat: 24.8059, lng: 46.6826 },
  الواحة: { lat: 24.7411, lng: 46.7167 },
  المونسية: { lat: 24.8312, lng: 46.7683 },
  الرمال: { lat: 24.9676, lng: 46.764 },
  القيروان: { lat: 24.8794, lng: 46.5626 },
  العقيق: { lat: 24.774, lng: 46.6309 },
  نمار: { lat: 24.5689, lng: 46.676 },
  الحزم: { lat: 24.5473, lng: 46.6536 },
  الشميسي: { lat: 24.6238, lng: 46.7 },
  المغرزات: { lat: 24.764, lng: 46.7258 },
  اشبيلية: { lat: 24.7947, lng: 46.7947 },
  الصفا: { lat: 24.6725, lng: 46.7728 },
  النظيم: { lat: 24.8001, lng: 46.896 },
  الجنادرية: { lat: 24.8192, lng: 46.8528 },
  "ظهرة لبن": { lat: 24.6329, lng: 46.5531 },
  "الدار البيضاء": { lat: 24.5647, lng: 46.7883 },
  "صلاح الدين": { lat: 24.7322, lng: 46.6986 },
  "الملك فهد": { lat: 24.7414, lng: 46.6725 },
  "الملك فيصل": { lat: 24.7622, lng: 46.775 },
};

/** Center of a dataset district or another known Riyadh neighborhood. */
export const areaCenter = (name?: string): LatLng | undefined => (name ? DISTRICTS[name] ?? RIYADH_AREAS[name] : undefined);

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
