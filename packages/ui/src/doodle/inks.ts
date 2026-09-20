import type { Dictionary } from "@opg/i18n";

// Six marker inks, settled by the design pass and contrast-checked against the `#FBF8F1` paper
// (plan/0003-doodle-bluff.md). A stroke is decoration only: no prompt, title, vote, score or
// award ever refers to a colour, so a player who cannot distinguish these loses nothing.
export const DOODLE_INKS = [
  "#2B2B2B",
  "#D7372B",
  "#2F6FB5",
  "#1E8449",
  "#C96A15",
  "#7A4FBF",
] as const;

/** Accessible names, in palette-index order, for "Red pen"-style labels, from the dictionary. */
export function doodleInkNames(ink: Dictionary["kit"]["ink"]): readonly string[] {
  return [ink.ink, ink.red, ink.blue, ink.green, ink.orange, ink.purple];
}
