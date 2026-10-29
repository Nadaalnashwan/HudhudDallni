import { describe, expect, it, vi } from "vitest";

// A database without the location_status migration: PostgREST rejects the new columns with 42703.
const selects: string[] = [];
vi.mock("../supabase", () => ({
  getServerSupabase: () => ({
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        const q = {
          eq: () => q,
          limit: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return cols.includes("location_status")
              ? { data: null, error: { code: "42703", message: "column places.location_status does not exist" } }
              : { data: [], error: null };
          },
        };
        return q;
      },
    }),
  }),
}));

describe("queryPlaces before the location_status migration", () => {
  it("falls back to the legacy columns for every parallel search", async () => {
    const { queryPlaces } = await import("./supabasePlaces");
    const results = await Promise.all([
      queryPlaces({ category: "gym" }),
      queryPlaces({ category: "cafe" }),
      queryPlaces({ category: "restaurant", subcategory: "burger" }),
    ]);
    expect(results).toEqual([[], [], []]);
    expect(selects.filter((c) => !c.includes("location_status"))).toHaveLength(3);
  });
});
