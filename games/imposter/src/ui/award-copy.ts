// Turns an Imposter award id into warm, short copy for the finale ceremony.
import type { Award } from "@opg/protocol";

function timesPhrase(value: number): string {
  return value === 1 ? "1 time" : `${value} times`;
}

export function imposterAwardCopy(
  award: Award,
): { title: string; detail: string } | null {
  switch (award.id) {
    case "word-thief":
      return {
        title: "Word thief",
        detail: `Stole the word ${timesPhrase(award.value)}`,
      };
    case "master-of-disguise":
      return {
        title: "Master of disguise",
        detail: `Slipped away ${timesPhrase(award.value)}`,
      };
    case "sharpest-eye":
      return {
        title: "Sharpest eye",
        detail: `Spotted the imposter ${award.value} times`,
      };
    case "trusted-crew":
      return {
        title: "Trusted crew",
        detail: `Nobody suspected them in ${award.value} words`,
      };
    default:
      return null;
  }
}
