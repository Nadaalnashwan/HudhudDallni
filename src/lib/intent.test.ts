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

  it("shows options right away for a single request", () => {
    const res = parseWithRules("أبي أتغدى", empty);
    expect(res.action).toMatchObject({ type: "plan", request: { steps: [{ category: "restaurant" }], priority: "balanced" } });
  });

  it("does not stop to ask which kind of café", () => {
    const res = parseWithRules("أبي كوفي", empty);
    expect(res.action).toMatchObject({ type: "plan", request: { steps: [{ category: "cafe" }] } });
  });

  it("completes a pending request with the clarifying answer", () => {
    const res = parseWithRules("الأقرب", { planSteps: [], pending: { steps: [{ category: "restaurant" }], tags: [] } });
    expect(res.action).toEqual({
      type: "plan",
      request: { steps: [{ category: "restaurant", subcategory: undefined }], district: undefined, priority: "distance", tags: [] },
    });
  });

  it("greets back and offers kinds of place instead of a dead end", () => {
    const a = parseWithRules("السلام عليكم", empty).action;
    expect(a.type).toBe("clarify");
    expect(a.type === "clarify" && a.options?.length).toBeGreaterThan(3);
  });

  it("never answers «I didn't understand»", () => {
    for (const msg of ["ممم", "asdf", "وش رايك", "طيب"]) {
      const res = parseWithRules(msg, empty);
      expect(res.reply).not.toMatch(/ما فهمت/);
      expect(res.action.type === "clarify" || res.action.type === "chat").toBe(true);
    }
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

describe("parseWithRules: whole-plan vs all places vs one stop", () => {
  const regenerate = ["غيرلي الخطة", "ما عجبتني الخطة", "ابي شي ثاني", "عطني اقتراح غير", "لا مو كذا، سو لي خطة ثانية", "ودي بشي مختلف", "خلنا نبدأ من جديد", "I want something totally different"];
  const allPlaces = ["غيرلي الأماكن", "مو عاجبني ولا مكان", "طفشت من هالأماكن", "بدلها كلها", "ما عجبني شيء", "show me different places"];

  it.each(regenerate)("«%s» asks for a different itinerary", (msg) => {
    expect(parseWithRules(msg, outing).action).toEqual({ type: "regenerate" });
  });

  it.each(allPlaces)("«%s» replaces every place, keeping the activities", (msg) => {
    expect(parseWithRules(msg, outing).action).toEqual({ type: "replace_all" });
  });

  it.each([
    ["غير الكوفي", { op: "replace", index: 1 }],
    ["بدل المطعم", { op: "replace", index: 2 }],
    ["خل النادي أقرب", { op: "replace", index: 0, nearer: true }],
    ["ابي مطعم إيطالي بدل البرجر", { op: "replace", index: 2, step: { subcategory: "italian" } }],
  ])("«%s» changes one stop only", (msg, expected) => {
    expect(parseWithRules(msg, outing).action).toMatchObject({ type: "modify", ...expected });
  });

  it("changes even locked stops only when the user says so", () => {
    expect(parseWithRules("غير كل شيء حتى النادي المثبت", outing).action).toEqual({ type: "replace_all", includeLocked: true });
  });

  it("keeps a locked gym when another stop changes", () => {
    expect(parseWithRules("ثبت النادي", outing).action).toEqual({ type: "modify", op: "lock", index: 0 });
    const locked: IntentContext = { planSteps: outing.planSteps.map((s, i) => ({ ...s, locked: i === 0 })) };
    expect(parseWithRules("غير المطعم", locked).action).toEqual({ type: "modify", op: "replace", index: 2, onlyThis: false });
  });

  it("needs a plan before changing one", () => {
    for (const msg of [...regenerate, ...allPlaces]) expect(parseWithRules(msg, empty).action.type).not.toMatch(/regenerate|replace_all|modify|constraints/);
  });
});

describe("parseWithRules: corrections, undo and unclear requests", () => {
  it.each([
    ["لا أبيه أقرب", { nearer: true }],
    ["غالي عطني أرخص", { addTags: ["budget"] }],
    ["أبي مكان أهدأ", { addTags: ["quiet"] }],
    ["أبي أماكن تناسب البنات", { women: true, addTags: ["family"] }],
    ["خليها في حي الملقا", { district: "الملقا" }],
  ])("«%s» edits the plan's constraints", (msg, edit) => {
    expect(parseWithRules(msg, outing).action).toEqual({ type: "constraints", edit });
  });

  it("asks which district for a region it cannot map", () => {
    const res = parseWithRules("خليها شمال الرياض", outing);
    expect(res.action.type).toBe("clarify");
    if (res.action.type !== "clarify") return;
    expect(res.action.options.length).toBeGreaterThan(0);
    for (const o of res.action.options) expect(parseWithRules(o.value, outing).action).toMatchObject({ type: "constraints", edit: { district: o.label } });
  });

  it("asks instead of guessing when the change is unclear", () => {
    const res = parseWithRules("مو هذي الفكرة اللي ببالي", outing);
    expect(res.action.type).toBe("clarify");
    if (res.action.type !== "clarify") return;
    // every option is itself a request the rules understand
    expect(parseWithRules(res.action.options[0].value, outing).action.type).toBe("replace_all");
    expect(parseWithRules(res.action.options[1].value, outing).action.type).toBe("regenerate");
    expect(parseWithRules(res.action.options[2].value, outing).action).toMatchObject({ type: "modify", op: "replace", index: 0 });
  });

  it("undoes only when there is something to undo", () => {
    expect(parseWithRules("رجع الخطة اللي قبل", { ...outing, canUndo: true }).action).toEqual({ type: "undo" });
    expect(parseWithRules("تراجع", { ...outing, canUndo: true }).action).toEqual({ type: "undo" });
    expect(parseWithRules("رجع الخطة اللي قبل", outing).action.type).toBe("chat");
  });
});

describe("parseWithRules: negation and districts", () => {
  it("reads «ما أحب الأماكن الهادية» as something to avoid, not a wish", () => {
    const a = parseWithRules("ما احب الاماكن الهادية", outing).action;
    expect(a).toMatchObject({ type: "constraints", edit: { avoidTags: ["quiet"] } });
    expect(a.type === "constraints" && a.edit.addTags?.includes("quiet")).toBeFalsy();
  });

  it("drops a negated type from a new request", () => {
    const a = parseWithRules("ابي كوفي ما يكون هادي", empty).action;
    const req = a.type === "plan" ? a.request : a.type === "clarify" ? a.pending : undefined;
    expect(req?.steps?.[0]).toMatchObject({ category: "cafe" });
    expect(req?.steps?.[0].subcategory).not.toBe("quiet");
    expect(req?.tags ?? []).not.toContain("quiet");
  });

  it("still takes «كوفي هادي» as a wish", () => {
    const a = parseWithRules("ابي كوفي هادي", empty).action;
    const req = a.type === "plan" ? a.request : a.type === "clarify" ? a.pending : undefined;
    expect(req?.avoidTags).toBeUndefined();
    expect(req?.steps?.[0].subcategory).toBe("quiet");
  });

  it.each(["ابي كل مكان من حي", "خلها من احياء مختلفة", "مو كلها من نفس الحي", "ابي المكانين من حي مختلف"])("«%s» spreads the plan across districts", (msg) => {
    expect(parseWithRules(msg, outing).action).toMatchObject({ type: "constraints", edit: { spread: true } });
  });

  it("carries «different districts» into a new request", () => {
    const a = parseWithRules("ابي كوفي وبعده مطعم كل واحد من حي", empty).action;
    expect(a).toMatchObject({ type: "plan", request: { spread: true } });
  });
});
