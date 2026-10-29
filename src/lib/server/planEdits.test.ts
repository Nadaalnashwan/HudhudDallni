import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../catalog";
import { DEMO_PLACES } from "../demoPlaces";
import { haversineKm } from "../geo";
import { constraintsInput, describeConstraintChange, describeNewItinerary, describeSameShapeChange, regenerateInput, replaceAllInput, replaceStopInput, settingsOf, type StepInput } from "../planEdits";
import type { Plan, StepSpec } from "../types";
import { buildStops, type BuildInput } from "./planner";

const steps: StepSpec[] = [{ category: "gym" }, { category: "cafe" }, { category: "restaurant", subcategory: "burger" }];
const base: BuildInput = { steps, origin: DISTRICTS["الصحافة"], originLabel: "موقعك", priority: "balanced", tags: [] };

async function makePlan(input: BuildInput = base): Promise<Plan> {
  const stops = await buildStops(input);
  return { id: "p1", origin: input.origin, originLabel: input.originLabel, district: input.district, priority: input.priority, tags: input.tags, stops };
}

/** Runs an edit the way the client does: plan settings + the edit's step input → planner → new plan. */
async function apply(plan: Plan, edit: StepInput & { settings?: ReturnType<typeof settingsOf> }): Promise<Plan> {
  const { settings = settingsOf(plan), ...stepInput } = edit;
  const stops = await buildStops({ ...stepInput, origin: settings.origin, originLabel: settings.originLabel, district: settings.district, priority: settings.priority, tags: settings.tags });
  return { ...plan, origin: settings.origin, originLabel: settings.originLabel, district: settings.district, priority: settings.priority, tags: settings.tags, stops };
}

const ids = (p: Plan) => p.stops.map((s) => s.place.id);
const lock = (p: Plan, i: number): Plan => ({ ...p, stops: p.stops.map((s, j) => (j === i ? { ...s, locked: true } : s)) });

describe("buildStops: plan-wide avoid", () => {
  it("never picks an avoided place while other candidates exist", async () => {
    const first = await makePlan();
    const again = await buildStops({ ...base, avoid: ids(first) });
    expect(again).toHaveLength(3);
    for (const id of ids(first)) expect(again.map((s) => s.place.id)).not.toContain(id);
  });

  it("still fills a step when every candidate is avoided", async () => {
    const [park] = await buildStops({ ...base, steps: [{ category: "park" }] });
    const parks = [park.place.id, ...park.alternatives.map((a) => a.id)];
    const [again] = await buildStops({ ...base, steps: [{ category: "park" }], avoid: parks });
    expect(again).toBeDefined();
  });

  it("ranks unseen places first", async () => {
    const [cafe] = await buildStops({ ...base, steps: [{ category: "cafe" }] });
    const [next] = await buildStops({ ...base, steps: [{ category: "cafe" }], seen: [cafe.place.id] });
    expect(next.place.id).not.toBe(cafe.place.id);
  });
});

describe("replace all places", () => {
  it("gives every stop a new place, none of the old ones, same activities", async () => {
    const plan = await makePlan();
    const next = await apply(plan, replaceAllInput(plan));
    expect(next.stops.map((s) => s.step)).toEqual(plan.stops.map((s) => s.step));
    expect(new Set(ids(next)).size).toBe(3);
    for (const id of ids(next)) expect(ids(plan)).not.toContain(id);
    // another branch of the same venue is not a new place while other venues exist (gyms, cafés);
    // the demo data has one burger brand, so there it can only be another branch — and the reply says so
    expect(next.stops[0].place.name).not.toBe(plan.stops[0].place.name);
    expect(next.stops[1].place.name).not.toBe(plan.stops[1].place.name);
    expect(next.stops[2].place.name).toBe(plan.stops[2].place.name);
    expect(describeSameShapeChange(plan, next, { headline: "-", unchanged: "-" }).text).toContain("(فرع ثاني)");
    expect(describeSameShapeChange(plan, next, { headline: "غيّرت لك الأماكن:", unchanged: "-" })).toMatchObject({ changed: true });
  });

  it("re-anchors each stop on the new one before it", async () => {
    const plan = await makePlan();
    const next = await apply(plan, replaceAllInput(plan));
    for (let i = 1; i < next.stops.length; i++)
      expect(next.stops[i].distanceFromPrevKm).toBeCloseTo(haversineKm(next.stops[i - 1].place.location, next.stops[i].place.location), 6);
  });

  it("keeps a locked stop unless includeLocked", async () => {
    const plan = lock(await makePlan(), 0);
    const kept = await apply(plan, replaceAllInput(plan));
    expect(kept.stops[0].place.id).toBe(plan.stops[0].place.id);
    expect(kept.stops[0].locked).toBe(true);
    expect(kept.stops[1].place.id).not.toBe(plan.stops[1].place.id);
    expect(kept.stops[2].place.id).not.toBe(plan.stops[2].place.id);

    const all = await apply(plan, replaceAllInput(plan, { includeLocked: true }));
    for (const id of ids(all)) expect(ids(plan)).not.toContain(id);
    expect(all.stops[0].locked).toBe(false);
  });

  it("keeps a stop that has no alternative and says so", async () => {
    // the user already turned down every other entertainment place
    const plan = await makePlan({ ...base, steps: [{ category: "entertainment" }] });
    const others = DEMO_PLACES.filter((p) => p.category === "entertainment" && p.id !== plan.stops[0].place.id).map((p) => p.id);
    const only = { ...plan, stops: plan.stops.map((s) => ({ ...s, excluded: others })) };
    const next = await apply(only, replaceAllInput(only));
    expect(ids(next)).toEqual(ids(plan));
    const d = describeSameShapeChange(only, next, { headline: "غيّرت لك الأماكن:", unchanged: "ما لقيت أماكن بديلة" });
    expect(d.changed).toBe(false);
    expect(d.text).toContain("ما لقيت");
  });
});

describe("replace the entire plan", () => {
  it("builds the new request with no current place reused", async () => {
    const plan = await makePlan();
    const next = await apply(plan, regenerateInput(plan, { steps: [{ category: "cafe" }, { category: "dessert" }, { category: "restaurant" }], priority: "balanced", tags: [] }));
    expect(next.stops.map((s) => s.step.category)).toEqual(["cafe", "dessert", "restaurant"]);
    for (const id of ids(next)) expect(ids(plan)).not.toContain(id);
    expect(describeNewItinerary(plan, next).changed).toBe(true);
  });

  it("keeps a locked stop on the matching new step, or inserts it", async () => {
    const plan = lock(await makePlan(), 0);
    const withGym = await apply(plan, regenerateInput(plan, { steps: [{ category: "cafe" }, { category: "gym" }], priority: "balanced", tags: [] }));
    expect(withGym.stops[1].place.id).toBe(plan.stops[0].place.id);
    expect(withGym.stops[1].locked).toBe(true);

    const noGym = await apply(plan, regenerateInput(plan, { steps: [{ category: "cafe" }, { category: "dessert" }], priority: "balanced", tags: [] }));
    expect(noGym.stops[0].place.id).toBe(plan.stops[0].place.id);
    expect(noGym.stops.map((s) => s.step.category)).toEqual(["gym", "cafe", "dessert"]);

    const fresh = await apply(plan, regenerateInput(plan, { steps: [{ category: "gym" }, { category: "cafe" }], priority: "balanced", tags: [] }, { includeLocked: true }));
    expect(ids(fresh)).not.toContain(plan.stops[0].place.id);
  });

  it("without a new request rebuilds the same activities with new places", async () => {
    const plan = await makePlan();
    const next = await apply(plan, regenerateInput(plan, undefined));
    expect(next.stops.map((s) => s.step.category)).toEqual(["gym", "cafe", "restaurant"]);
    for (const id of ids(next)) expect(ids(plan)).not.toContain(id);
  });

  it("without a new request still changes each activity's type where the category has others", () => {
    const plan: Plan = {
      id: "p",
      origin: DISTRICTS["الصحافة"],
      originLabel: "موقعك",
      priority: "balanced",
      stops: [
        { step: { category: "cafe", subcategory: "quiet" }, place: { ...DEMO_PLACES[0], subcategory: "quiet" }, alternatives: [], excluded: [], locked: false, reason: "", anchorLabel: "موقعك" },
        { step: { category: "restaurant", subcategory: "burger" }, place: { ...DEMO_PLACES[1], subcategory: "burger" }, alternatives: [], excluded: [], locked: false, reason: "", anchorLabel: "المقهى" },
      ],
    };
    const { steps } = regenerateInput(plan, undefined);
    expect(steps.map((s) => s.category)).toEqual(["cafe", "restaurant"]);
    expect(steps[0].subcategory).not.toBe("quiet");
    expect(steps[1].subcategory).not.toBe("burger");
  });
});

describe("a district with nothing new left", () => {
  it("looks just outside the district instead of keeping or repeating a place", async () => {
    const input: BuildInput = { ...base, steps: [{ category: "gym", subcategory: "fitness" }], district: "الصحافة" };
    const first = await buildStops(input);
    const inDistrict = (await buildStops({ ...input, excluded: [[first[0].place.id]] }))[0];
    const next = await buildStops({ ...input, excluded: [[first[0].place.id]], avoid: [first[0].place.id, inDistrict?.place.id].filter(Boolean) as string[] });
    expect(next).toHaveLength(1);
    expect([first[0].place.id, inDistrict?.place.id]).not.toContain(next[0].place.id);
    expect(haversineKm(DISTRICTS["الصحافة"], next[0].place.location)).toBeLessThan(12);
  });
});

describe("replace one stop", () => {
  it("changes only that stop with onlyThis", async () => {
    const plan = await makePlan();
    const next = await apply(plan, replaceStopInput(plan, 1, { exclude: true, onlyThis: true }));
    expect(next.stops[0].place.id).toBe(plan.stops[0].place.id);
    expect(next.stops[1].place.id).not.toBe(plan.stops[1].place.id);
    expect(next.stops[2].place.id).toBe(plan.stops[2].place.id);
  });

  it("re-anchors later unlocked stops on the new one", async () => {
    const plan = await makePlan();
    const next = await apply(plan, replaceStopInput(plan, 1, { exclude: true }));
    expect(next.stops[0].place.id).toBe(plan.stops[0].place.id);
    expect(next.stops[1].place.id).not.toBe(plan.stops[1].place.id);
    expect(next.stops[2].anchorLabel).toBe("المقهى");
    expect(next.stops[2].distanceFromPrevKm).toBeCloseTo(haversineKm(next.stops[1].place.location, next.stops[2].place.location), 6);
  });

  it("keeps a locked gym when the restaurant changes", async () => {
    const plan = lock(await makePlan(), 0);
    const next = await apply(plan, replaceStopInput(plan, 2, { exclude: true }));
    expect(next.stops[0].place.id).toBe(plan.stops[0].place.id);
    expect(next.stops[0].locked).toBe(true);
    expect(next.stops[2].place.id).not.toBe(plan.stops[2].place.id);
  });
});

describe("edit plan constraints", () => {
  it("switches the gym to a women-only one and keeps locks", async () => {
    const plan = lock(await makePlan(), 1);
    const next = await apply(plan, constraintsInput(plan, { women: true }));
    expect(next.stops[0].place.subcategory).toBe("women");
    expect(next.stops[1].place.id).toBe(plan.stops[1].place.id);
    expect(describeConstraintChange(plan, next, { women: true }).changed).toBe(true);
  });

  it("moves the plan to a district", async () => {
    const plan = await makePlan();
    const next = await apply(plan, constraintsInput(plan, { district: "الملقا" }));
    expect(next.district).toBe("الملقا");
    expect(next.stops[0].place.district).toBe("الملقا");
  });

  it("reports honestly when nothing changed", async () => {
    const plan = await makePlan();
    const d = describeConstraintChange(plan, plan, { addTags: ["budget"] });
    expect(d.changed).toBe(false);
    expect(d.text).not.toContain("عدّلت");
  });
});
