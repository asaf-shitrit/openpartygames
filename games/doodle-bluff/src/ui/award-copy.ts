// Turns a Doodle Bluff award id into warm, short copy for the finale ceremony.
import type { Award } from "@opg/protocol";

function timesPhrase(value: number): string {
  return value === 1 ? "1 person" : `${value} people`;
}

type AwardCopy = { title: string; detail: string };

const AWARD_COPY = new Map<string, (value: number) => AwardCopy>([
  [
    "pen-of-the-people",
    (value) => ({
      title: "Pen of the people",
      detail: `${timesPhrase(value)} found your real titles`,
    }),
  ],
  [
    "master-forger",
    (value) => ({
      title: "Master forger",
      detail: `Fooled ${timesPhrase(value)} with fake titles`,
    }),
  ],
  [
    "sharp-eye",
    (value) => ({
      title: "Sharp eye",
      detail: `Found the real title ${value === 1 ? "1 time" : `${value} times`}`,
    }),
  ],
  [
    "abstract-artist",
    (value) => ({
      title: "Abstract artist",
      detail: `Fooled ${timesPhrase(value)} — nobody found the truth`,
    }),
  ],
]);

export function doodleBluffAwardCopy(award: Award): AwardCopy | null {
  const copyFor = AWARD_COPY.get(award.id);
  return copyFor === undefined ? null : copyFor(award.value);
}
