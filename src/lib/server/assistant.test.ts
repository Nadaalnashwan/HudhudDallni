import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS } from "../store";
import type { IntentContext } from "../intent";

const gemini = vi.hoisted(() => {
  class GeminiQuotaError extends Error {}
  return { geminiEnabled: vi.fn(() => true), geminiJson: vi.fn(), GeminiQuotaError };
});
vi.mock("./gemini", () => gemini);

const { answer, userPayload } = await import("./assistant");
const { changesPlan } = await import("./intentSchema");

const ctx: IntentContext = {
  planSteps: [
    { category: "gym", locked: true, name: "نادي القمة", placeId: "g1", distanceKm: 1.234 },
    { category: "cafe", locked: false, name: "كوفي سكون", placeId: "c1", distanceKm: 0.8 },
    { category: "restaurant", subcategory: "burger", locked: false, name: "برقر الحارة", placeId: "r1", distanceKm: 1.1 },
  ],
  plan: { district: "الصحافة", priority: "balanced", tags: ["budget"] },
  goal: "نادي وبعده كوفي وبعده مطعم برجر",
  history: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `رسالة ${i}` }) as const),
  rejectedIds: ["c0"],
  canUndo: true,
};

beforeEach(() => {
  gemini.geminiEnabled.mockReturnValue(true);
  gemini.geminiJson.mockReset();
});

describe("answer: Gemini path", () => {
  it("uses a valid Gemini decision", async () => {
    gemini.geminiJson.mockResolvedValue({ intent: "replace_entire_plan", reply: "أبشر", request: { steps: [{ category: "park" }, { category: "cafe" }] } });
    const res = await answer({ message: "ما عجبتني الخطة", context: ctx });
    expect(res.engine).toBe("gemini");
    expect(res.action).toMatchObject({ type: "regenerate", request: { steps: [{ category: "park" }, { category: "cafe" }] } });
  });

  it("sends the plan, the original goal, recent history and rejected places", async () => {
    gemini.geminiJson.mockResolvedValue({ intent: "chat" });
    await answer({ message: "غيرلي الأماكن", context: ctx, preferences: { ...DEFAULT_PREFS, consent: false, likes: ["quiet"] } });
    const payload = JSON.parse(gemini.geminiJson.mock.calls[0][1]);
    expect(payload.message).toBe("غيرلي الأماكن");
    expect(payload.originalRequest).toBe(ctx.goal);
    expect(payload.history).toHaveLength(8);
    expect(payload.history.at(-1)).toEqual({ role: "assistant", text: "رسالة 11" });
    expect(payload.currentPlan.stops[0]).toEqual({ index: 0, category: "gym", subcategory: null, placeName: "نادي القمة", placeId: "g1", locked: true, distanceFromPreviousKm: 1.2 });
    expect(payload.currentPlan).toMatchObject({ district: "الصحافة", tags: ["budget"] });
    expect(payload.rejectedPlaceIds).toEqual(["c0"]);
    expect(payload.canUndo).toBe(true);
    expect(payload.savedPreferences).toBeNull(); // no consent → not sent
  });

  it("sends saved preferences only with consent", () => {
    const p = JSON.parse(userPayload("هلا", { planSteps: [] }, { ...DEFAULT_PREFS, consent: true, likes: ["quiet"] }));
    expect(p.savedPreferences.likes).toEqual(["quiet"]);
    expect(p.currentPlan).toBeNull();
  });

  it("falls back to the rules when Gemini's output is invalid", async () => {
    gemini.geminiJson.mockResolvedValue({ intent: "replace_single_stop", index: 7 });
    const res = await answer({ message: "غيرلي الأماكن", context: ctx });
    expect(res).toMatchObject({ engine: "rules", fallback: "invalid", action: { type: "replace_all" } });
  });
});

describe("answer: when Gemini is unavailable", () => {
  const unclear = ["مو هذي الفكرة اللي ببالي", "ابي شي", "طيب", "اوكي غيره", "يعني؟", "hmm not sure"];

  it.each(unclear)("never changes the plan on an unclear message («%s»)", async (message) => {
    gemini.geminiJson.mockRejectedValue(new Error("timeout"));
    const res = await answer({ message, context: ctx });
    expect(res.fallback).toBe("unavailable");
    expect(changesPlan(res.action)).toBe(false);
  });

  it("asks when it cannot tell what should change", async () => {
    gemini.geminiJson.mockRejectedValue(new Error("timeout"));
    expect((await answer({ message: "مو هذي الفكرة اللي ببالي", context: ctx })).action.type).toBe("clarify");
  });

  it("still acts on clear phrasing", async () => {
    gemini.geminiJson.mockRejectedValue(new gemini.GeminiQuotaError("429"));
    const res = await answer({ message: "سو لي خطة ثانية", context: ctx });
    expect(res).toMatchObject({ engine: "rules", fallback: "quota", action: { type: "regenerate" } });
  });

  it("treats unparseable JSON as invalid output", async () => {
    gemini.geminiJson.mockRejectedValue(new SyntaxError("Unexpected token"));
    expect((await answer({ message: "طيب", context: ctx })).fallback).toBe("invalid");
  });

  it("uses the rules alone when Gemini is not configured", async () => {
    gemini.geminiEnabled.mockReturnValue(false);
    const res = await answer({ message: "بدلها كلها", context: ctx });
    expect(res).toMatchObject({ engine: "rules", action: { type: "replace_all" } });
    expect(res.fallback).toBeUndefined();
    expect(gemini.geminiJson).not.toHaveBeenCalled();
  });
});
