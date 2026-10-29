import { describe, expect, it } from "vitest";
import { anchorLabel, CATEGORY_META, locationStatusOf, SUBCATEGORY_META, subcategoriesOf, subcategoryImage } from "./catalog";
import type { Category, Subcategory } from "./types";

const CATS = Object.keys(CATEGORY_META) as Category[];
const SUBS = Object.keys(SUBCATEGORY_META) as Subcategory[];

describe("taxonomy", () => {
  it("maps every subcategory to a known category", () => {
    for (const s of SUBS) expect(CATS, s).toContain(SUBCATEGORY_META[s].category);
  });

  // (pin icons are a Record<Category, string> in components/icons.tsx, so typecheck enforces them)
  it("gives every category meta and at least one subcategory", () => {
    for (const c of CATS) {
      const m = CATEGORY_META[c];
      expect(m.label && m.plural && m.googleType && m.query, c).toBeTruthy();
      expect(m.color, c).toMatch(/^#[0-9A-F]{6}$/i);
      expect(subcategoriesOf(c).length, c).toBeGreaterThan(0);
    }
  });

  it("uses a distinct pin color per category", () => {
    const colors = CATS.map((c) => CATEGORY_META[c].color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("covers the database's category and subcategory keys", () => {
    expect(CATS).toEqual(expect.arrayContaining(["laundry", "mosque", "sports", "education", "transport", "government", "mall"]));
    expect(SUBS).toEqual(
      expect.arrayContaining(["car_wash", "clothes_laundry", "mosque", "football", "padel", "primary_school", "secondary_school", "university", "academy", "metro_station", "ministry", "shopping"]),
    );
  });

  it("only points at local photos that exist", () => {
    expect(subcategoryImage("burger")).toBe("/images/places/burger.jpg");
    expect(subcategoryImage(undefined, "cafe")).toBe("/images/places/cat-cafe.jpg");
    expect(subcategoryImage("university")).toBeUndefined();
    expect(subcategoryImage(undefined, "government")).toBeUndefined();
  });

  it("names the previous stop naturally", () => {
    expect(anchorLabel("gym")).toBe("النادي");
    expect(anchorLabel("education", "university")).toBe("الجامعة");
    expect(anchorLabel("education", "primary_school")).toBe("المدرسة");
    expect(anchorLabel("laundry", "car_wash")).toBe("المغسلة");
  });

  it("never treats an unknown location as verified for demo data", () => {
    expect(locationStatusOf({ isDemo: true } as never)).toBe("synthetic");
    expect(locationStatusOf({ isDemo: false, locationStatus: "approximate" })).toBe("approximate");
  });
});
