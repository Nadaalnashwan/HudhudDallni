/**
 * Arabic text normalization for matching place names the way people type them:
 * no diacritics or tatweel, أإآٱ→ا, ى→ي, ة→ه, and "ال" ignored at the start of a word.
 */
export function normalizeArabic(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const stripAl = (w: string) => (w.length > 4 && w.startsWith("ال") ? w.slice(2) : w);

const tokens = (s: string) => normalizeArabic(s).split(" ").filter(Boolean).map(stripAl);

/** Request words that never belong to a place name ("ودني", "أبي", "قريب"). Compared after normalization. */
const FILLER = new Set(
  [
    "ابي", "ابغي", "ابغا", "ابا", "ابيك", "ودي", "ودني", "وديني", "خذني", "عطني", "اعطني", "دلني", "دلوني", "وين", "اروح", "نروح", "روح",
    "رح", "ممكن", "لو", "سمحت", "تكفي", "الحين", "اليوم", "قريب", "قريبه", "اقرب", "الاقرب", "مني", "لي", "في", "فيه", "حي", "بحي", "عند",
    "جنب", "من", "الي", "علي", "يا", "وش", "ايش", "شي", "مكان", "اقرب", "ب", "و", "وبعده", "وبعدها", "بعده", "بعدها", "بعدين", "ثم",
  ].map((w) => stripAl(w)),
);

/** Type words that a name may or may not repeat ("مول النخيل" vs "النخيل مول"). */
const GENERIC = new Set(
  ["مول", "مجمع", "تجاري", "جامعه", "اكاديميه", "وزاره", "محطه", "مترو", "مسجد", "جامع", "مدرسه", "مغسله", "ملعب", "حديقه", "مطعم", "كوفي", "نادي"].map(stripAl),
);

/**
 * How well a place name matches what the user typed: 0 = no match, higher = closer.
 * Every distinctive word of the query must appear in the name; type words are optional.
 */
export function nameMatchScore(name: string, query: string): number {
  const q = tokens(query).filter((w) => !FILLER.has(w));
  const distinctive = q.filter((w) => !GENERIC.has(w));
  const required = distinctive.length ? distinctive : q;
  if (!required.length) return 0;
  const n = tokens(name);
  // "عبدالعزيز" vs "عبد العزيز": also compare against the name with its spaces removed
  const joined = [n.join(""), normalizeArabic(name).replace(/ /g, "")];
  const has = (w: string) => n.includes(w) || (w.length >= 3 && joined.some((j) => j.includes(w)));
  if (!required.every(has)) return 0;
  // closer when the query covers more of the name (an exact name beats a longer one that contains it)
  const covered = n.filter((w) => q.includes(w)).length;
  return 1 + covered / n.length;
}

export const nameMatches = (name: string, query: string) => nameMatchScore(name, query) > 0;
