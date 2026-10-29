import { describe, expect, it } from "vitest";
import { parseWithRules, type IntentContext } from "./intent";

const empty: IntentContext = { planSteps: [] };
const outing: IntentContext = {
  planSteps: [
    { category: "gym", locked: false },
    { category: "cafe", locked: false },
    { category: "restaurant", subcategory: "burger", locked: false },
  ],
};

describe("parseWithRules: new requests", () => {
  it("turns a multi-stop request into ordered steps with a district", () => {
    const res = parseWithRules("أبي نادي في الصحافة، وبعده كوفي قريب منه، وبعده مطعم برجر قريب من الكوفي", empty);
    expect(res.engine).toBe("rules");
    expect(res.action).toEqual({
      type: "plan",
      request: {
        steps: [{ category: "gym" }, { category: "cafe" }, { category: "restaurant", subcategory: "burger" }],
        district: "الصحافة",
        priority: "balanced",
        tags: [],
      },
    });
  });

  it("asks distance or rating for a single vague request", () => {
    const res = parseWithRules("أبي أتغدى", empty);
    expect(res.action.type).toBe("clarify");
    if (res.action.type !== "clarify") return;
    expect(res.action.pending?.steps).toEqual([{ category: "restaurant" }]);
    expect(res.action.options?.length).toBeGreaterThan(0);
  });

  it("asks which kind of café when none is given", () => {
    const res = parseWithRules("أبي كوفي", empty);
    expect(res.action.type).toBe("clarify");
    if (res.action.type !== "clarify") return;
    expect(res.action.question).toContain("الكوفي");
  });

  it("completes a pending request with the clarifying answer", () => {
    const res = parseWithRules("الأقرب", { planSteps: [], pending: { steps: [{ category: "restaurant" }], tags: [] } });
    expect(res.action).toEqual({
      type: "plan",
      request: { steps: [{ category: "restaurant", subcategory: undefined }], district: undefined, priority: "distance", tags: [] },
    });
  });

  it("falls back to chat when nothing is recognised", () => {
    expect(parseWithRules("السلام عليكم", empty).action.type).toBe("chat");
  });
});

describe("parseWithRules: editing a plan", () => {
  it("replaces a named stop and refreshes the ones after it", () => {
    expect(parseWithRules("غير الكوفي", outing).action).toEqual({ type: "modify", op: "replace", index: 1, onlyThis: false });
  });

  it("replaces only that stop when the user says بس", () => {
    expect(parseWithRules("غير الكوفي بس", outing).action).toMatchObject({ op: "replace", index: 1, onlyThis: true });
  });

  it("locks, unlocks and removes stops", () => {
    expect(parseWithRules("ثبت النادي", outing).action).toEqual({ type: "modify", op: "lock", index: 0 });
    expect(parseWithRules("فك التثبيت عن النادي", outing).action).toEqual({ type: "modify", op: "unlock", index: 0 });
    expect(parseWithRules("شيل المطعم", outing).action).toEqual({ type: "modify", op: "remove", index: 2 });
  });

  it("changes a stop's type", () => {
    expect(parseWithRules("خل المطعم إيطالي", outing).action).toMatchObject({
      op: "replace",
      index: 2,
      step: { subcategory: "italian" },
    });
  });

  it("swaps one activity for another", () => {
    const ctx: IntentContext = { planSteps: [{ category: "park", locked: false }, { category: "cafe", locked: false }] };
    expect(parseWithRules("بدل الحديقة بمول", ctx).action).toMatchObject({ op: "replace", index: 0, step: { category: "mall" } });
  });

  it("asks for a nearer option", () => {
    expect(parseWithRules("أبي كوفي أقرب", outing).action).toMatchObject({ op: "replace", index: 1, nearer: true });
  });

  it("inserts a new stop after the one the user names", () => {
    expect(parseWithRules("زيد حلويات بعد النادي", outing).action).toMatchObject({
      type: "add",
      step: { category: "dessert" },
      after: 0,
    });
  });
});
