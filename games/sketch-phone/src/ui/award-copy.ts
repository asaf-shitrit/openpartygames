// Turns a Sketch Phone award id into warm, short copy for the finale ceremony.
import { format, pickPluralByCount, type Dictionary } from "@opg/i18n";
import type { Award } from "@opg/protocol";

type AwardCopy = { title: string; detail: string };

export function sketchPhoneAwardCopy(award: Award, t: Dictionary): AwardCopy | null {
  const copy = t.sketchPhone.awards;
  const people = format(pickPluralByCount(award.value, copy.people), { count: award.value });
  switch (award.id) {
    case "favourite":
      return { title: copy.favourite, detail: format(copy.favouriteDetail, { people }) };
    case "sharpest-pencil":
      return { title: copy.sharpestPencil, detail: format(copy.sharpestPencilDetail, { people }) };
    case "wordsmith":
      return { title: copy.wordsmith, detail: format(copy.wordsmithDetail, { people }) };
    default:
      return null;
  }
}
