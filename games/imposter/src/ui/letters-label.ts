// The screen-reader name for a row of blank guess tiles. Once every letter is face up the
// tiles name themselves with the word, so this only speaks while some are still hidden.
import { format, pickPluralByCount } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

export function lettersLabel(
  t: Dictionary,
  length: number,
  revealed: number,
): string | undefined {
  if (revealed >= length && length > 0) return undefined;
  return format(pickPluralByCount(length, t.imposter.lastChance.letters), { count: length });
}
