import { DISTRICTS } from "./catalog";
import type { Category, Place, PlaceTag } from "./types";

/**
 * Demo Mode dataset: fictional places spread over real Riyadh districts.
 * Names are invented and every record is marked source "demo" so it is never
 * mistaken for real Google data.
 */
const NAMES: Record<Category, [string, PlaceTag[]][]> = {
  cafe: [
    ["كوفي سكون", ["quiet", "work"]],
    ["محمصة الفنجال", ["quiet"]],
    ["بن وسحاب", ["outdoor", "late"]],
    ["كوفي ركن الهدوء", ["quiet", "work"]],
    ["قهوة الحي", ["budget"]],
    ["دلة وفنجان", ["outdoor", "family"]],
    ["مختص الصباح", ["work"]],
    ["كوفي النخلة", ["outdoor", "quiet"]],
    ["رواق القهوة", ["late"]],
    ["حبة بن", ["budget", "work"]],
  ],
  restaurant: [
    ["مطعم السفرة النجدية", ["family"]],
    ["مشاوي الديرة", ["family", "late"]],
    ["برقر الحارة", ["budget", "late"]],
    ["مطبخ الزيتون", ["quiet"]],
    ["مندي البيت", ["family", "budget"]],
    ["سوشي الواحة", ["quiet"]],
    ["بيتزا الفرن الحجري", ["outdoor"]],
    ["مطعم الجلسة", ["outdoor", "family"]],
    ["كبسة أم سعد", ["budget", "family"]],
    ["ستيك هاوس الرياض", ["late"]],
  ],
  gym: [
    ["نادي القمة الرياضي", []],
    ["فتنس برو", ["late"]],
    ["نادي الطاقة", ["budget"]],
    ["أكاديمية اللياقة", ["quiet"]],
    ["نادي النخبة", ["late"]],
    ["كروس فت الشمال", []],
    ["نادي الحيوية", ["budget", "late"]],
  ],
  dessert: [
    ["حلا الشمال", ["late"]],
    ["كيك وقهوة", ["quiet"]],
    ["بيت الكنافة", ["family"]],
    ["آيس كريم البحر", ["outdoor", "family"]],
    ["حلويات السكر", ["budget"]],
  ],
  park: [
    ["ممشى الحي", ["outdoor", "family"]],
    ["حديقة الواحة", ["outdoor", "family", "quiet"]],
    ["منتزه النخيل", ["outdoor", "family"]],
    ["ممشى الأمير", ["outdoor"]],
  ],
  mall: [
    ["مول الشمال", ["family", "late"]],
    ["رياض بوليفارد مول", ["family"]],
    ["مركز الواحة التجاري", ["family"]],
  ],
};

const SUMMARIES: Partial<Record<PlaceTag, string>> = {
  quiet: "جو هادي وجلسات مريحة",
  outdoor: "فيه جلسات خارجية",
  family: "مناسب للعوائل",
  budget: "أسعاره معقولة",
  work: "مناسب للشغل والمذاكرة",
  late: "يفتح لين وقت متأخر",
};

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
    NAMES[category].forEach(([name, tags], i) => {
      for (let branch = 0; branch < 3; branch++) {
        const [district, c] = districts[(i * 5 + branch * 4 + category.length) % districts.length];
        const lat = c.lat + (rand() - 0.5) * 0.03;
        const lng = c.lng + (rand() - 0.5) * 0.03;
        out.push({
          id: `demo-${category}-${i}-${branch}`,
          name: `${name} (تجريبي)`,
          category,
          location: { lat, lng },
          address: `حي ${district}، الرياض`,
          district,
          rating: Math.round((3.6 + rand() * 1.3) * 10) / 10,
          ratingCount: 40 + Math.floor(rand() * 2400),
          priceLevel: tags.includes("budget") ? 1 : 2 + Math.floor(rand() * 2),
          tags,
          summary: tags.map((t) => SUMMARIES[t]).filter(Boolean).join(" • ") || undefined,
          openNow: rand() > 0.15,
          source: "demo",
        });
      }
    });
  });
  return out;
}

export const DEMO_PLACES: Place[] = build();

export const DEMO_GOOGLE_REVIEWS = [
  { author: "مستخدم تجريبي", rating: 5, text: "المكان مرتب والخدمة سريعة." },
  { author: "مستخدم تجريبي", rating: 4, text: "حلو بس وقت الذروة يزحم." },
  { author: "مستخدم تجريبي", rating: 3, text: "عادي، الأسعار شوي مرتفعة." },
];
