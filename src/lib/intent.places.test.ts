import { describe, expect, it } from "vitest";
import { parseWithRules, type IntentContext } from "./intent";

const empty: IntentContext = { planSteps: [] };
const steps = (msg: string) => {
  const a = parseWithRules(msg, empty).action;
  if (a.type === "plan") return a.request.steps;
  if (a.type === "clarify") return a.pending?.steps;
  return undefined;
};

describe("parseWithRules: everyday places and landmarks", () => {
  it.each([
    ["أبي مغسلة سيارات", { category: "laundry", subcategory: "car_wash" }],
    ["أبي مغسله سياره", { category: "laundry", subcategory: "car_wash" }],
    ["أبي مصبغه", { category: "laundry", subcategory: "clothes_laundry" }],
    ["أقرب مسجد", { category: "mosque", subcategory: "mosque" }],
    ["وين أقرب جامع", { category: "mosque", subcategory: "mosque" }],
    ["أبي ملعب بادل", { category: "sports", subcategory: "padel" }],
    ["أبي نادي بادل", { category: "sports", subcategory: "padel" }],
    ["أبي ملعب كوره", { category: "sports", subcategory: "football" }],
    ["أبي مدرسة ابتدائية", { category: "education", subcategory: "primary_school" }],
    ["أبي ثانويه", { category: "education", subcategory: "secondary_school" }],
    ["أقرب محطة مترو", { category: "transport", subcategory: "metro_station" }],
  ])("%s", (msg, step) => {
    expect(steps(msg)).toEqual([step]);
  });

  it("plans the nearest mosque and metro station straight away", () => {
    for (const msg of ["أقرب مسجد", "أقرب محطة مترو"]) {
      const a = parseWithRules(msg, empty).action;
      expect(a.type).toBe("plan");
      if (a.type === "plan") expect(a.request.priority).toBe("distance");
    }
  });

  it("keeps the name of a landmark the user asked for", () => {
    expect(parseWithRules("ودني أكاديمية طويق", empty).action).toMatchObject({
      type: "plan",
      request: { steps: [{ category: "education", subcategory: "academy", placeName: "طويق" }] },
    });
    expect(parseWithRules("أبي وزارة التعليم", empty).action).toMatchObject({
      type: "plan",
      request: { steps: [{ category: "government", subcategory: "ministry", placeName: "التعليم" }] },
    });
    expect(steps("أبي جامعة الملك سعود")).toEqual([{ category: "education", subcategory: "university", placeName: "الملك سعود" }]);
    expect(steps("ودني النخيل مول")).toEqual([{ category: "mall", placeName: "النخيل" }]);
  });

  it("does not invent a name from filler words", () => {
    expect(steps("عطني مول قريب")).toEqual([{ category: "mall" }]);
    expect(steps("أبي أروح الجامعة")).toEqual([{ category: "education", subcategory: "university" }]);
  });

  it("does not read the university as a mosque", () => {
    expect(steps("أبي الجامعة")?.map((s) => s.category)).toEqual(["education"]);
  });

  it("orders a multi-stop request across old and new types", () => {
    expect(parseWithRules("أبي أروح الجامعة وبعدها نادي وبعده مغسلة سيارات", empty).action).toEqual({
      type: "plan",
      request: {
        steps: [{ category: "education", subcategory: "university" }, { category: "gym" }, { category: "laundry", subcategory: "car_wash" }],
        district: undefined,
        priority: "balanced",
        tags: [],
      },
    });
  });

  it("still understands a car in a café request as drive-thru, not a car wash", () => {
    expect(steps("أبي كوفي درايف ثرو من السيارة")).toEqual([{ category: "cafe", subcategory: "drive_thru" }]);
  });
});
