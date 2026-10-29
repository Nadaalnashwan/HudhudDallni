import { describe, expect, it } from "vitest";
import { nameMatches, nameMatchScore, normalizeArabic } from "./arabic";

describe("normalizeArabic", () => {
  it("drops diacritics and tatweel and unifies letter forms", () => {
    expect(normalizeArabic("أَكاديـمية")).toBe("اكاديميه");
    expect(normalizeArabic("إدارة آمنة مستشفى")).toBe("اداره امنه مستشفي");
  });
});

describe("nameMatches", () => {
  it.each([
    ["أكاديمية طويق", "ودني أكاديمية طويق"],
    ["أكاديمية طويق", "طويق"],
    ["أكاديمية طويق", "اكاديميه طويق"],
    ["وزارة التعليم", "أبي وزارة التعليم"],
    ["وزارة التعليم", "التعليم"],
    ["وزارة التعليم", "وزاره التعليم"],
    ["جامعة الملك سعود", "جامعة الملك سعود"],
    ["جامعة الملك سعود", "الملك سعود"],
    ["النخيل مول", "النخيل مول"],
    ["النخيل مول", "مول النخيل"],
    ["الرياض بارك", "مول الرياض بارك"],
    ["جامعة الأميرة نورة بنت عبدالرحمن", "جامعه الاميره نوره"],
    ["محطة عبد العزيز", "عبدالعزيز"],
  ])("%s ← %s", (name, query) => {
    expect(nameMatches(name, query)).toBe(true);
  });

  it.each([
    ["وزارة الصحة", "وزارة التعليم"],
    ["غرناطة مول", "النخيل مول"],
    ["جامعة الملك سعود", "جامعة الملك فهد"],
    ["النخيل مول", "ودني"],
  ])("%s ✗ %s", (name, query) => {
    expect(nameMatches(name, query)).toBe(false);
  });

  it("ranks an exact name above a longer one that contains it", () => {
    expect(nameMatchScore("جامعة الملك سعود", "جامعة الملك سعود")).toBeGreaterThan(nameMatchScore("مستشفى جامعة الملك سعود الجامعي", "جامعة الملك سعود"));
  });
});
