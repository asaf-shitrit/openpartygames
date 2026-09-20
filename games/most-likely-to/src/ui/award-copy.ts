// Turns a Most Likely To award id into warm, short copy for the finale ceremony.
import { format, pickPluralByCount, type Dictionary } from "@opg/i18n";
import type { Award } from "@opg/protocol";

type AwardCopy = { title: string; detail: string };

export function mostLikelyToAwardCopy(
  award: Award,
  t: Dictionary,
): AwardCopy | null {
  const copy = t.mostLikelyTo.awards;
  const times = format(pickPluralByCount(award.value, copy.times), {
    count: award.value,
  });
  switch (award.id) {
    case "main-character":
      return {
        title: copy.mainCharacter,
        detail: format(copy.mainCharacterDetail, { times }),
      };
    case "crowd-reader":
      return {
        title: copy.crowdReader,
        detail: format(copy.crowdReaderDetail, { times }),
      };
    case "owns-it":
      return {
        title: copy.ownsIt,
        detail: format(copy.ownsItDetail, { times }),
      };
    case "wild-card":
      return {
        title: copy.wildCard,
        detail: format(copy.wildCardDetail, { times }),
      };
    default:
      return null;
  }
}
