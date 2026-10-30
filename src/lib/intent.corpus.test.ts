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

describe("each stop keeps its own district", () => {
  it("«مقهى بالملقا ومقهى بالنسيم» is two cafes, one in each", () => {
    const a = parseWithRules("ابي مقهى بالملقا ومقهى بالنسيم", empty).action;
    expect(a).toMatchObject({ type: "plan", request: { steps: [{ category: "cafe", district: "الملقا" }, { category: "cafe", district: "النسيم" }] } });
  });

  it("«كوفي بالياسمين وبعده مطعم بالعليا»", () => {
    const a = parseWithRules("كوفي بالياسمين وبعده مطعم بالعليا", empty).action;
    expect(a).toMatchObject({ type: "plan", request: { steps: [{ category: "cafe", district: "الياسمين" }, { category: "restaurant", district: "العليا" }] } });
  });

  it("governorates: «كوفي بالدرعية ومطعم بالخرج»", () => {
    const a = parseWithRules("ابي كوفي بالدرعية ومطعم بالخرج", empty).action;
    expect(a).toMatchObject({ type: "plan", request: { steps: [{ category: "cafe", district: "الدرعية" }, { category: "restaurant", district: "الخرج" }] } });
  });

  it("Saudi cities: «كوفي بجدة ومطعم بأبها»; «الخبر» only as a place", () => {
    expect(parseWithRules("ابي كوفي بجدة ومطعم بأبها", empty).action).toMatchObject({
      request: { steps: [{ category: "cafe", district: "جدة" }, { category: "restaurant", district: "أبها" }] },
    });
    expect(parseWithRules("ابي مطعم بالخبر", empty).action).toMatchObject({ request: { steps: [{ category: "restaurant", district: "الخبر" }] } });
    const a = parseWithRules("وش الخبر ابي مطعم", empty).action;
    expect(a.type === "plan" && a.request.steps.every((s) => !s.district)).toBe(true);
  });

  it("«مرات» is a governorate only as «محافظة مرات»", () => {
    expect(parseWithRules("ابي مطعم في محافظة مرات", empty).action).toMatchObject({ request: { steps: [{ category: "restaurant", district: "مرات" }] } });
    const a = parseWithRules("ابي مطعم مرات احس ابي برجر", empty).action;
    expect(a.type === "plan" && a.request.steps.every((s) => !s.district)).toBe(true);
  });
});

describe("«I don't like this» replaces the place it points at", () => {
  const one: IntentContext = { planSteps: [{ category: "cafe", locked: false }] };
  const three: IntentContext = { planSteps: [{ category: "gym", locked: false }, { category: "cafe", locked: false }, { category: "restaurant", locked: false }] };

  it.each(["ما احب ذا", "ما يعجبني", "مو حلو", "ما ابي ذا", "خايس", "ما ابغى هذا", "ماعجبني هذا", "مو زين", "i don't like it"])("«%s» on a one-place result", (msg) => {
    expect(parseWithRules(msg, one).action).toMatchObject({ type: "modify", op: "replace", index: 0 });
  });

  it("uses the place the user tapped", () => {
    expect(parseWithRules("ما يعجبني ذا", { ...three, focusIndex: 2 }).action).toMatchObject({ type: "modify", op: "replace", index: 2 });
  });

  it("names a stop: «ما احب الكوفي»", () => {
    expect(parseWithRules("ما احب الكوفي", three).action).toMatchObject({ type: "modify", op: "replace", index: 1 });
  });

  it("asks which one when it cannot tell, instead of guessing", () => {
    expect(parseWithRules("ما يعجبني ذا", three).action.type).toBe("clarify");
  });
});
