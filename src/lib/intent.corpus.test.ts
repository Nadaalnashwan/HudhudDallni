import { describe, expect, it } from "vitest";
import { parseWithRules, type IntentContext } from "./intent";
import type { Category } from "./types";

/**
 * Everyday ways people ask, including plurals, synonyms, dialect, typos and English.
 * Each must be understood without Gemini: the request's stops, in order.
 */
const CASES: [string, Category[]][] = [
  // restaurants
  ["مطعم", ["restaurant"]],
  ["مطاعم", ["restaurant"]],
  ["ابي مطاعم قريبه", ["restaurant"]],
  ["وش المطاعم اللي حولي", ["restaurant"]],
  ["عطني مطعم زين", ["restaurant"]],
  ["جوعان", ["restaurant"]],
  ["ابي اكل", ["restaurant"]],
  ["ابي افطر", ["restaurant"]],
  ["فطور", ["restaurant"]],
  ["ابي مكان افطر فيه", ["restaurant"]],
  ["ابي اتعشى", ["restaurant"]],
  ["عشاء", ["restaurant"]],
  ["غداء", ["restaurant"]],
  ["وين اتغدى", ["restaurant"]],
  ["ابي برقر", ["restaurant"]],
  ["برجرات", ["restaurant"]],
  ["بيتزا", ["restaurant"]],
  ["مطعم شاورما", ["restaurant"]],
  ["ابي سوشي", ["restaurant"]],
  ["مطعم مشويات", ["restaurant"]],
  ["مطعن", ["restaurant"]],
  ["مطعمم", ["restaurant"]],
  ["restaurant", ["restaurant"]],
  ["restaurants near me", ["restaurant"]],
  ["food", ["restaurant"]],
  ["dinner", ["restaurant"]],
  // cafes
  ["كوفي", ["cafe"]],
  ["كوفيهات", ["cafe"]],
  ["كافيهات", ["cafe"]],
  ["مقاهي", ["cafe"]],
  ["مقهى", ["cafe"]],
  ["قهوه", ["cafe"]],
  ["ابي قهوة", ["cafe"]],
  ["ابي اتقهوى", ["cafe"]],
  ["كوفي شوب", ["cafe"]],
  ["كوفيي", ["cafe"]],
  ["حديقا", ["park"]],
  ["مطعمك", ["restaurant"]],
  ["كوفى", ["cafe"]],
  ["كافي", ["cafe"]],
  ["coffee", ["cafe"]],
  ["cafes", ["cafe"]],
  ["coffee shop", ["cafe"]],
  // gyms
  ["نادي", ["gym"]],
  ["اندية", ["gym"]],
  ["نوادي", ["gym"]],
  ["جيم", ["gym"]],
  ["جيمات", ["gym"]],
  ["ابي اتمرن", ["gym"]],
  ["نادي رياضي", ["gym"]],
  ["gym", ["gym"]],
  // dessert
  ["حلا", ["dessert"]],
  ["حلى", ["dessert"]],
  ["حلويات", ["dessert"]],
  ["ابي شي حلو", ["dessert"]],
  ["كيك", ["dessert"]],
  ["ايسكريم", ["dessert"]],
  ["دونات", ["dessert"]],
  ["كنافه", ["dessert"]],
  ["مخابز", ["dessert"]],
  ["dessert", ["dessert"]],
  // parks
  ["حديقة", ["park"]],
  ["حدائق", ["park"]],
  ["حدايق", ["park"]],
  ["منتزهات", ["park"]],
  ["ممشى", ["park"]],
  ["ابي اتمشى", ["park"]],
  ["park", ["park"]],
  // malls
  ["مول", ["mall"]],
  ["مولات", ["mall"]],
  ["ابي اتسوق", ["mall"]],
  ["مجمع تجاري", ["mall"]],
  ["مجمعات تجارية", ["mall"]],
  ["mall", ["mall"]],
  // entertainment
  ["ملاهي", ["entertainment"]],
  ["العاب", ["entertainment"]],
  ["ابي مكان ترفيهي", ["entertainment"]],
  ["بولينج", ["entertainment"]],
  // everyday places
  ["مغسلة", ["laundry"]],
  ["مغاسل سيارات", ["laundry"]],
  ["ابي اغسل سيارتي", ["laundry"]],
  ["مغسلة ملابس", ["laundry"]],
  ["مسجد", ["mosque"]],
  ["مساجد", ["mosque"]],
  ["جوامع", ["mosque"]],
  ["ابي اصلي", ["mosque"]],
  ["ملاعب", ["sports"]],
  ["ملاعب بادل", ["sports"]],
  ["ملعب كورة", ["sports"]],
  ["مدارس", ["education"]],
  ["مدرسة ابتدائية", ["education"]],
  ["جامعات", ["education"]],
  ["جامعة الملك سعود", ["education"]],
  ["كلية", ["education"]],
  ["محطات المترو", ["transport"]],
  ["محطة", ["transport"]],
  ["قطار", ["transport"]],
  ["وزارات", ["government"]],
  ["وزارة الصحة", ["government"]],
  // chains
  ["نادي وبعده كوفي وبعده مطعم", ["gym", "cafe", "restaurant"]],
  ["ابي اروح الجيم بعدين قهوه بعدين عشا", ["gym", "cafe", "restaurant"]],
  ["كوفي ثم مطعم", ["cafe", "restaurant"]],
  ["مطعم وبعدين حلا", ["restaurant", "dessert"]],
  ["ابي اتغدى وبعدها اتمشى", ["restaurant", "park"]],
  ["gym then coffee then dinner", ["gym", "cafe", "restaurant"]],
];

const empty: IntentContext = { planSteps: [] };

describe("rules understand everyday requests (no Gemini)", () => {
  it.each(["ابي مكان هادي", "عادي", "ابي شي رايق"])("never turns «%s» into a gym", (msg) => {
    const a = parseWithRules(msg, empty).action;
    const steps = a.type === "plan" ? a.request.steps : a.type === "clarify" ? a.pending?.steps : undefined;
    expect(steps?.some((s) => s.category === "gym")).toBeFalsy();
  });

  it.each(CASES)("«%s»", (msg, cats) => {
    const a = parseWithRules(msg, empty).action;
    const steps = a.type === "plan" ? a.request.steps : a.type === "clarify" ? a.pending?.steps : undefined;
    expect(steps?.map((s) => s.category)).toEqual(cats);
  });
});
