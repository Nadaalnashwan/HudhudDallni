import { describe, expect, it } from "vitest";
import type { IntentContext } from "../intent";
import { validateOutput } from "./intentSchema";

const plan: IntentContext = {
  planSteps: [
    { category: "gym", locked: true, name: "نادي القمة", placeId: "g1" },
    { category: "cafe", locked: false, name: "كوفي سكون", placeId: "c1" },
    { category: "restaurant", subcategory: "burger", locked: false, name: "برقر الحارة", placeId: "r1" },
  ],
};
const none: IntentContext = { planSteps: [] };

const action = (raw: unknown, ctx = plan) => {
  const v = validateOutput(raw, ctx);
  return v.ok ? v.value.action : null;
};

describe("validateOutput: valid outputs become actions", () => {
  it("maps a new itinerary built from the original goal", () => {
    expect(
      action({
        intent: "replace_entire_plan",
        reply: "أبشر",
        request: { steps: [{ category: "park" }, { category: "dessert", subcategory: "ice_cream" }], district: "الملقا", priority: "rating", tags: ["family", "nonsense"] },
      }),
    ).toEqual({
      type: "regenerate",
      includeLocked: false,
      request: {
        steps: [
          { category: "park", subcategory: undefined, placeName: undefined, tags: [] },
          { category: "dessert", subcategory: "ice_cream", placeName: undefined, tags: [] },
        ],
        district: "الملقا",
        priority: "rating",
        tags: ["family"],
      },
    });
  });

  it("maps replace-all-places, with includeLocked only when given", () => {
    expect(action({ intent: "replace_all_places" })).toEqual({ type: "replace_all", includeLocked: false });
    expect(action({ intent: "replace_all_places", includeLocked: true, index: null, step: null })).toEqual({ type: "replace_all", includeLocked: true });
  });

  it("maps a single-stop change with a matching subcategory", () => {
    expect(action({ intent: "replace_single_stop", index: 2, step: { category: "restaurant", subcategory: "italian" }, onlyThis: true })).toEqual({
      type: "modify",
      op: "replace",
      index: 2,
      step: { subcategory: "italian" },
      nearer: false,
      onlyThis: true,
    });
    expect(action({ intent: "replace_single_stop", index: 0, nearer: true })).toMatchObject({ op: "replace", index: 0, nearer: true, step: undefined });
  });

  it("maps a swap to another activity", () => {
    expect(action({ intent: "replace_single_stop", index: 1, step: { category: "mall" } })).toMatchObject({ step: { category: "mall", subcategory: undefined } });
  });

  it("maps plan-wide constraint edits and drops unknown tags", () => {
    expect(action({ intent: "edit_plan_constraints", constraints: { district: "الملقا", addTags: ["budget", "cheap"], women: true } })).toEqual({
      type: "constraints",
      edit: { district: "الملقا", addTags: ["budget"], women: true },
    });
  });

  it("maps lock, remove, add, clarify, undo and chat", () => {
    expect(action({ intent: "lock_stop", index: 1 })).toEqual({ type: "modify", op: "lock", index: 1 });
    expect(action({ intent: "remove_stop", index: 2 })).toEqual({ type: "modify", op: "remove", index: 2 });
    expect(action({ intent: "add_stop", step: { category: "dessert" }, after: 0 })).toMatchObject({ type: "add", step: { category: "dessert" }, after: 0 });
    expect(action({ intent: "clarify_request", question: "وش تبي يتغير؟", options: [{ label: "الأماكن", value: "غيرلي الأماكن" }] })).toMatchObject({ type: "clarify", options: [{ label: "الأماكن" }] });
    expect(action({ intent: "undo_plan_change" }, { ...plan, canUndo: true })).toEqual({ type: "undo" });
    expect(action({ intent: "undo_plan_change" })).toEqual({ type: "chat" }); // nothing to undo
    expect(action({ intent: "chat", reply: "هلا" }, none)).toEqual({ type: "chat" });
  });

  it("keeps the learned preferences", () => {
    const v = validateOutput({ intent: "chat", learned: { likes: ["quiet"], cuisines: ["indian", "quiet"], budget: "low" } }, none);
    expect(v.ok && v.value.learned).toMatchObject({ likes: ["quiet"], cuisines: ["indian"], budget: "low" });
  });
});

describe("validateOutput: invalid outputs are rejected", () => {
  it.each([
    ["an unknown intent", { intent: "replace_everything" }],
    ["a missing intent", { reply: "تم" }],
    ["an out-of-range index", { intent: "replace_single_stop", index: 3 }],
    ["a negative index", { intent: "remove_stop", index: -1 }],
    ["a missing index", { intent: "lock_stop" }],
    ["a subcategory of another category", { intent: "replace_single_stop", index: 1, step: { subcategory: "italian" } }],
    ["a made-up subcategory", { intent: "create_plan", request: { steps: [{ category: "cafe", subcategory: "rooftop" }] } }],
    ["an unknown category", { intent: "create_plan", request: { steps: [{ category: "spa" }] } }],
    ["more than 6 stops", { intent: "create_plan", request: { steps: Array.from({ length: 7 }, () => ({ category: "cafe" })) } }],
    ["a plan without steps", { intent: "create_plan", request: { steps: [] } }],
    ["an empty constraint edit", { intent: "edit_plan_constraints", constraints: { addTags: ["cheap"] } }],
    ["an unknown district", { intent: "edit_plan_constraints", constraints: { district: "Downtown" } }],
    ["an insert position outside the plan", { intent: "add_stop", step: { category: "cafe" }, after: 9 }],
    ["a clarification without a question", { intent: "clarify_request", options: [] }],
    ["a wrong field type", { intent: "replace_single_stop", index: "1" }],
  ])("rejects %s", (_, raw) => {
    expect(validateOutput(raw, plan).ok).toBe(false);
  });

  it("rejects plan changes when there is no plan", () => {
    for (const intent of ["replace_all_places", "replace_entire_plan", "edit_plan_constraints", "replace_single_stop", "lock_stop"])
      expect(validateOutput({ intent, index: 0, constraints: { nearer: true } }, none).ok).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(validateOutput("replace_all_places", plan).ok).toBe(false);
    expect(validateOutput(null, plan).ok).toBe(false);
  });
});
