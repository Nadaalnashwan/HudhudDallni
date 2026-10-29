import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../catalog";
import { DEMO_PLACES } from "../demoPlaces";
import { haversineKm } from "../geo";
import type { Place } from "../types";
import { buildStops } from "./planner";
import { matchByName, searchPlaces } from "./places";

const at = (name: string, lat: number): Place => ({
  id: name,
  name,
  category: "mall",
  subcategory: "shopping",
  location: { lat, lng: 46.68 },
  address: "",
  tags: [],
  source: "supabase",
  isDemo: false,
  locationStatus: "verified",
});

describe("named place search", () => {
  const malls = [at("الرياض بارك", 24.75), at("غرناطة مول", 24.78), at("النخيل مول", 24.76), at("الرياض جاليري", 24.74)];

  it("finds a named place however the name is spelled", () => {
    expect(matchByName(malls, "مول النخيل").map((p) => p.name)).toEqual(["النخيل مول"]);
    expect(matchByName(malls, "غرناطه").map((p) => p.name)).toEqual(["غرناطة مول"]);
    expect(matchByName(malls, "الرياض").map((p) => p.name).sort()).toEqual(["الرياض بارك", "الرياض جاليري"]);
    expect(matchByName(malls, "مول")).toHaveLength(2);
    expect(matchByName(malls, undefined)).toEqual([]);
  });

  it("falls back to the whole category when no name matches", async () => {
    const all = await searchPlaces({ category: "education", subcategory: "academy", near: DISTRICTS["العليا"] });
    const named = await searchPlaces({ category: "education", subcategory: "academy", query: "أكاديميه المهارات", near: DISTRICTS["العليا"] });
    const unknown = await searchPlaces({ category: "education", subcategory: "academy", query: "طويق", near: DISTRICTS["العليا"] });
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((p) => p.name === "أكاديمية المهارات")).toBe(true);
    expect(unknown).toEqual(all);
  });
});

describe("demo data for new place types", () => {
  it("has no rating, price or hours and a synthetic location", () => {
    const fresh = DEMO_PLACES.filter((p) => ["laundry", "mosque", "sports", "education", "transport", "government"].includes(p.category));
    expect(fresh.length).toBeGreaterThan(0);
    for (const p of fresh) {
      expect(p.rating ?? p.ratingCount ?? p.priceLevel ?? p.hours ?? p.openNow).toBeUndefined();
      expect(p.locationStatus).toBe("synthetic");
    }
    expect(DEMO_PLACES.every((p) => p.isDemo && p.locationStatus === "synthetic")).toBe(true);
  });
});

describe("buildStops with a named place", () => {
  it("takes the named place even when it is far from the previous stop", async () => {
    const origin = DISTRICTS["العارض"];
    const [gym, uni] = await buildStops({
      steps: [{ category: "gym" }, { category: "education", subcategory: "university", placeName: "جامعه المعرفه" }],
      origin,
      originLabel: "موقعك",
      priority: "distance",
      tags: [],
    });
    expect(gym.place.category).toBe("gym");
    expect(uni.place.name).toBe("جامعة المعرفة");
    expect(uni.reason).toContain("اخترته أنت");
    expect(uni.anchorLabel).toBe("النادي");
  });

  it("keeps short hops and makes no 'you chose it' claim when the name is not found", async () => {
    const [first, stop] = await buildStops({
      steps: [{ category: "gym" }, { category: "mosque", placeName: "مسجد غير موجود" }],
      origin: DISTRICTS["الملقا"],
      originLabel: "موقعك",
      priority: "balanced",
      tags: [],
    });
    expect(stop.place.category).toBe("mosque");
    expect(stop.reason).not.toContain("اخترته أنت");
    expect(haversineKm(first.place.location, stop.place.location)).toBeLessThan(13);
  });
});
