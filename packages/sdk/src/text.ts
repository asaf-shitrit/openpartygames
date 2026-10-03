// Shared answer normalization: the one definition every game compares typed text with
// (Imposter's last chance, Real or Nah's lies, Doodle Bluff's titles). scripts/pack-rules.mjs
// cannot import TypeScript and keeps a copy; scripts/pack-rules.test.ts fails if they diverge.

/** Niqqud and cantillation marks: the same Hebrew word with or without them is one answer. */
const HEBREW_POINTS = /[֑-ֽֿ-ׇׂׅׄ]/g;
/** Apostrophes, backtick and the Hebrew geresh join a word ("dont" is "don't"), not split it. */
const APOSTROPHES = /['‘’ʼ׳`]/g;

/**
 * NFC, lowercase, trim, drop Hebrew points and apostrophes, turn other punctuation into
 * spaces, drop a leading "a", "an" or "the" and collapse inner whitespace.
 * "  The Giraffe!  " -> "giraffe"; "שָׁלוֹם" -> "שלום"; "don't" -> "dont".
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(HEBREW_POINTS, "")
    .replace(APOSTROPHES, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:an?|the)\s+/, "")
    .trim();
}
