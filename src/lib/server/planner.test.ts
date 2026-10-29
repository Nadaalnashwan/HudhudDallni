import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../catalog";
import { haversineKm } from "../geo";
import type { StepSpec } from "../types";
import { buildStops, type BuildInput } from "./planner";
import { placesMode } from "./places";

const steps: StepSpec[] = [{ category: "gym" }, { category: "cafe" }, { category: "restaurant", subcategory: "burger" }];
const base: BuildInput = {
  steps,
  origin: DISTRICTS["الصحافة"],
  originLabel: "موقعك",
  priority: "balanced",
  tags: [],
};

describe("buildStops (offline demo data)", () => {
  it("runs against the demo dataset", () => {
    expect(placesMode()).toBe("demo");
  });

  it("returns one stop per step, in the requested order and type", async () => {
    const stops = await buildStops(base);
    expect(stops.map((s) => s.place.category)).toEqual(["gym", "cafe", "restaurant"]);
    expect(stops[2].place.subcategory).toBe("burger");
    expect(stops.every((s) => s.place.isDemo && s.reason.length > 0)).toBe(true);
  });

  it("never uses the same place twice", async () => {
    const stops = await buildStops({ ...base, steps: [{ category: "cafe" }, { category: "cafe" }, { category: "cafe" }] });
    expect(new Set(stops.map((s) => s.place.id)).size).toBe(stops.length);
  });

  it("measures each stop from the one before it", async () => {
    const stops = await buildStops(base);
    for (let i = 1; i < stops.length; i++) {
      const km = haversineKm(stops[i - 1].place.location, stops[i].place.location);
      expect(stops[i].distanceFromPrevKm).toBeCloseTo(km, 6);
      expect(stops[i].anchorLabel).not.toBe("موقعك");
    }
  });

  it("restricts the first stop to the requested district", async () => {
    const stops = await buildStops({ ...base, district: "الملقا" });
    expect(stops[0].place.district).toBe("الملقا");
  });

  it("keeps a locked place and avoids rejected ones", async () => {
    const first = await buildStops(base);
    const kept = first[0].place;
    const rejected = first[1].place.id;
    const next = await buildStops({ ...base, keep: [kept, null, null], locked: [true, false, false], excluded: [[], [rejected], []] });
    expect(next[0].place.id).toBe(kept.id);
    expect(next[0].locked).toBe(true);
    expect(next[1].place.id).not.toBe(rejected);
  });

  it("picks the closest candidate when asked for a nearer option", async () => {
    const [stop] = await buildStops({ ...base, steps: [{ category: "cafe" }], nearest: [true] });
    for (const alt of stop.alternatives) {
      expect(haversineKm(base.origin, stop.place.location)).toBeLessThanOrEqual(haversineKm(base.origin, alt.location));
    }
  });
});
