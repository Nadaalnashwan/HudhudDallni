import { describe, expect, it } from "vitest";
import { formatLeg, latinDigits } from "./geo";

describe("latinDigits", () => {
  it("turns Arabic-Indic and Persian digits into Latin ones", () => {
    expect(latinDigits("خطتك فيها ٣ وجهات و۲ بدائل")).toBe("خطتك فيها 3 وجهات و2 بدائل");
    expect(latinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
});

describe("formatLeg", () => {
  it("shows time and distance when a road route exists, and an approximate distance otherwise", () => {
    expect(formatLeg(10700, 900)).toMatch(/^\d+ د • 10\.7 كم$/);
    expect(formatLeg(800)).toBe("800 م تقريباً");
  });
});
