// Turns a Most Likely To award id into warm, short copy for the finale ceremony.
import type { Award } from "@opg/protocol";

function timesPhrase(value: number): string {
  return value === 1 ? "1 time" : `${value} times`;
}

type AwardCopy = { title: string; detail: string };

const AWARD_COPY = new Map<string, (value: number) => AwardCopy>([
  [
    "main-character",
    (value) => ({
      title: "Main character",
      detail: `Picked by the room ${timesPhrase(value)}`,
    }),
  ],
  [
    "crowd-reader",
    (value) => ({
      title: "Crowd reader",
      detail: `Read the room ${timesPhrase(value)}`,
    }),
  ],
  [
    "owns-it",
    (value) => ({
      title: "Owns it",
      detail: `Voted for themselves ${timesPhrase(value)}`,
    }),
  ],
  [
    "wild-card",
    (value) => ({
      title: "Wild card",
      detail: `Went their own way ${timesPhrase(value)}`,
    }),
  ],
]);

export function mostLikelyToAwardCopy(award: Award): AwardCopy | null {
  const copyFor = AWARD_COPY.get(award.id);
  return copyFor === undefined ? null : copyFor(award.value);
}
