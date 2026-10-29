import { DISTRICTS } from "./catalog";
import type { Category, Place, PlaceTag, Subcategory } from "./types";

/**
 * Offline fallback dataset, used ONLY when Supabase is not configured.
 * Names are invented and every record is marked source "demo" / isDemo so it
 * is never mistaken for database or Google data, and never mixed with them.
 */
const NAMES: Record<Category, [string, Subcategory, PlaceTag[]][]> = {
  cafe: [
    ["كوفي سكون", "quiet", ["quiet", "work"]],
    ["محمصة الفنجال", "specialty_coffee", []],
    ["بن وسحاب", "specialty_coffee", ["late"]],
    ["كوفي ركن الهدوء", "quiet", ["quiet"]],
    ["قهوة على الطريق", "drive_thru", ["budget"]],
    ["مكتبة وفنجان", "study", ["work", "quiet"]],
  ],
  restaurant: [
    ["السفرة النجدية", "saudi", ["family"]],
    ["مشاوي الديرة", "grill", ["family", "late"]],
    ["برقر الحارة", "burger", ["budget", "late"]],
    ["مطبخ الزيتون", "italian", ["quiet"]],
    ["سوشي الواحة", "asian", ["quiet"]],
    ["بيتزا الفرن الحجري", "pizza", []],
    ["سمك الخليج", "seafood", ["family"]],
    ["شاورما الركن", "shawarma", ["budget", "late"]],
    ["بهارات الهند", "indian", []],
    ["سريع وطازج", "fast_food", ["budget"]],
  ],
  gym: [
    ["نادي القمة الرياضي", "fitness", []],
    ["فتنس برو", "fitness", ["late"]],
    ["نادي رشاقة للسيدات", "women", []],
  ],
  dessert: [
    ["مخبز الصباح", "bakery", []],
    ["آيس كريم البحر", "ice_cream", ["family"]],
  ],
  park: [["حديقة الواحة", "public_park", ["outdoor", "family"]]],
  mall: [["مول الشمال", "shopping", ["family"]]],
  entertainment: [["عالم الألعاب", "games", ["family"]]],
  // Everyday places: like the database rows of these types, they carry no rating, price or hours.
  laundry: [
    ["مغسلة اللمعة للسيارات", "car_wash", []],
    ["مصبغة النقاء", "clothes_laundry", []],
  ],
  mosque: [["جامع الحي", "mosque", []]],
  sports: [
    ["ملعب الأبطال", "football", []],
    ["بادل الشمال", "padel", []],
  ],
  education: [
    ["مدرسة الرواد الابتدائية", "primary_school", []],
    ["ثانوية الأفق", "secondary_school", []],
    ["جامعة المعرفة", "university", []],
    ["أكاديمية المهارات", "academy", []],
  ],
  transport: [["محطة مترو الشمال", "metro_station", []]],
  government: [["وزارة الخدمات", "ministry", []]],
};

const UNRATED = new Set<Category>(["laundry", "mosque", "sports", "education", "transport", "government"]);

// Deterministic PRNG so demo data is stable between reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build(): Place[] {
  const rand = mulberry32(42);
  const districts = Object.entries(DISTRICTS);
  const out: Place[] = [];
  (Object.keys(NAMES) as Category[]).forEach((category) => {
    // Each brand gets three branches in different districts so every area has options.
    NAMES[category].forEach(([name, subcategory, tags], i) => {
      for (let branch = 0; branch < 3; branch++) {
        const [district, c] = districts[(i * 5 + branch * 4 + category.length) % districts.length];
        const base = {
          id: `demo-${category}-${i}-${branch}`,
          name,
          category,
          subcategory,
          location: { lat: c.lat + (rand() - 0.5) * 0.03, lng: c.lng + (rand() - 0.5) * 0.03 },
          address: `حي ${district}، الرياض`,
          district,
          tags,
          source: "demo" as const,
          isDemo: true,
          locationStatus: "synthetic" as const,
          locationSource: "synthetic",
        };
        if (UNRATED.has(category)) {
          out.push(base);
          continue;
        }
        out.push({
          ...base,
          rating: Math.round((3.6 + rand() * 1.3) * 10) / 10,
          ratingCount: 40 + Math.floor(rand() * 2400),
          priceLevel: tags.includes("budget") ? 1 : 2 + Math.floor(rand() * 2),
          openNow: rand() > 0.15,
        });
      }
    });
  });
  return out;
}

export const DEMO_PLACES: Place[] = build();
