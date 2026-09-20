// Turns a Real or Nah award id into warm, short copy for the finale ceremony.
import { format, pickPluralByCount, type Dictionary } from "@opg/i18n";
import type { Award } from "@opg/protocol";

type AwardCopy = { title: string; detail: string };

export function realOrNahAwardCopy(
  award: Award,
  t: Dictionary,
): AwardCopy | null {
  const copy = t.realOrNah.awards;
  const count = { count: award.value };
  const people = format(pickPluralByCount(award.value, copy.people), count);
  switch (award.id) {
    case "best-liar":
      return {
        title: copy.bestLiar,
        detail: format(copy.bestLiarDetail, { people }),
      };
    case "truth-finder":
      return {
        title: copy.truthFinder,
        detail: format(copy.truthFinderDetail, {
          answers: format(pickPluralByCount(award.value, copy.answers), count),
        }),
      };
    case "greatest-hit":
      return {
        title: copy.greatestHit,
        detail: format(copy.greatestHitDetail, { people }),
      };
    case "most-trusting":
      return {
        title: copy.mostTrusting,
        detail: format(copy.mostTrustingDetail, {
          lies: format(pickPluralByCount(award.value, copy.lies), count),
        }),
      };
    default:
      return null;
  }
}
