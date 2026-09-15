// Shared answer normalization: used to compare a player's typed guess against the real
// answer (Imposter's last chance, Real or Nah's lie/truth matching).

/**
 * Lowercases, trims, strips punctuation, drops a leading "a", "an" or "the" and collapses
 * inner whitespace. "  The Giraffe!  " -> "giraffe".
 */
export function normalizeAnswer(text: string): string {
   return text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:an?|the)\s+/, "")
      .trim();
}
