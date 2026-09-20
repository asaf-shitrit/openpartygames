// Turns an Imposter award id into warm, short copy for the finale ceremony.
import { format, pickPluralByCount, type Dictionary } from "@opg/i18n";
import type { Award } from "@opg/protocol";

type AwardCopy = { title: string; detail: string };

export function imposterAwardCopy(
  award: Award,
  t: Dictionary,
): AwardCopy | null {
  const copy = t.imposter.awards;
  const times = format(pickPluralByCount(award.value, copy.times), {
    count: award.value,
  });
  switch (award.id) {
    case "word-thief":
      return {
        title: copy.wordThief,
        detail: format(copy.wordThiefDetail, { times }),
      };
    case "master-of-disguise":
      return {
        title: copy.masterOfDisguise,
        detail: format(copy.masterOfDisguiseDetail, { times }),
      };
    case "sharpest-eye":
      return {
        title: copy.sharpestEye,
        detail: format(copy.sharpestEyeDetail, { times }),
      };
    case "trusted-crew":
      return {
        title: copy.trustedCrew,
        detail: format(copy.trustedCrewDetail, {
          words: format(pickPluralByCount(award.value, copy.words), {
            count: award.value,
          }),
        }),
      };
    default:
      return null;
  }
}
