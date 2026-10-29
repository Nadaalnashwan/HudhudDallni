import { describe, expect, it } from "vitest";
import { toPlace, type PlaceRow } from "./supabasePlaces";

const row: PlaceRow = {
  id: "p1",
  name_ar: "تجريبي - كوفي سكون",
  category: "cafe",
  subcategory: "quiet",
  neighborhood: "الملقا",
  address_ar: null,
  latitude: 24.8,
  longitude: 46.6,
  rating: "4.3",
  review_count: 120,
  price_level: 2,
  tags: ["هادئ", "تجريبي"],
  amenities: null,
  opening_hours: { open: "07:00", close: "23:00", days: "daily" },
  image_url: null,
  is_demo: true,
  source: "seed",
  location_status: "synthetic",
  location_source: "synthetic",
};

describe("toPlace", () => {
  it("maps a seeded demo row", () => {
    const p = toPlace(row);
    expect(p).toMatchObject({ name: "كوفي سكون", rating: 4.3, ratingCount: 120, priceLevel: 2, hours: "07:00 – 23:00 يومياً", isDemo: true, locationStatus: "synthetic" });
    expect(p.address).toBe("حي الملقا، الرياض");
    expect(p.tags).toContain("quiet");
  });

  it("leaves NULL rating, price, hours and photo empty instead of inventing them", () => {
    const p = toPlace({
      ...row,
      name_ar: "جامعة الملك سعود",
      category: "education",
      subcategory: "university",
      neighborhood: "الدرعية",
      address_ar: null,
      rating: null,
      review_count: null,
      price_level: null,
      tags: null,
      opening_hours: null,
      is_demo: false,
      location_status: "verified",
      location_source: "openstreetmap",
    });
    expect(p.rating).toBeUndefined();
    expect(p.ratingCount).toBeUndefined();
    expect(p.priceLevel).toBeUndefined();
    expect(p.hours).toBeUndefined();
    expect(p.photoUrl).toBeUndefined();
    expect(p.tags).toEqual([]);
    expect(p).toMatchObject({ name: "جامعة الملك سعود", subcategory: "university", district: "الدرعية", isDemo: false, locationStatus: "verified", locationSource: "openstreetmap" });
    expect(JSON.stringify(p)).not.toMatch(/NaN|null/);
  });

  it("maps approximate locations and tolerates a missing neighborhood", () => {
    const p = toPlace({ ...row, is_demo: false, neighborhood: null, location_status: "approximate", rating: "", opening_hours: { open: "08:00" } });
    expect(p.locationStatus).toBe("approximate");
    expect(p.address).toBe("الرياض");
    expect(p.district).toBeUndefined();
    expect(p.rating).toBeUndefined();
    expect(p.hours).toBeUndefined();
  });

  it("never upgrades a row without a status to verified", () => {
    const legacy: PlaceRow = { ...row, location_status: undefined, location_source: undefined };
    expect(toPlace(legacy).locationStatus).toBe("synthetic");
    expect(toPlace({ ...legacy, is_demo: false }).locationStatus).toBe("approximate");
  });
});
