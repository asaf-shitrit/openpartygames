// Turns a Doodle Bluff award id into warm, short copy for the finale ceremony.
import { format, pickPluralByCount, type Dictionary } from "@opg/i18n";
import type { Award } from "@opg/protocol";

type AwardCopy = { title: string; detail: string };

export function doodleBluffAwardCopy(
  award: Award,
  t: Dictionary,
): AwardCopy | null {
  const copy = t.doodleBluff.awards;
  const count = { count: award.value };
  const people = format(pickPluralByCount(award.value, copy.people), count);
  switch (award.id) {
    case "pen-of-the-people":
      return {
        title: copy.penOfThePeople,
        detail: format(copy.penOfThePeopleDetail, { people }),
      };
    case "master-forger":
      return {
        title: copy.masterForger,
        detail: format(copy.masterForgerDetail, { people }),
      };
    case "sharp-eye":
      return {
        title: copy.sharpEye,
        detail: format(copy.sharpEyeDetail, {
          times: format(pickPluralByCount(award.value, copy.times), count),
        }),
      };
    case "abstract-artist":
      return {
        title: copy.abstractArtist,
        detail: format(copy.abstractArtistDetail, { people }),
      };
    default:
      return null;
  }
}
