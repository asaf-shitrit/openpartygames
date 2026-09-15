// Turns a Real or Nah award id into warm, short copy for the finale ceremony.
import type { Award } from "@opg/protocol";

export function realOrNahAwardCopy(
  award: Award,
): { title: string; detail: string } | null {
  switch (award.id) {
    case "best-liar":
      return { title: "Best liar", detail: `Fooled ${award.value} people` };
    case "truth-finder":
      return {
        title: "Truth finder",
        detail: `Found ${award.value} real answers`,
      };
    case "greatest-hit":
      return {
        title: "Greatest hit",
        detail: `One lie fooled ${award.value} people`,
      };
    case "most-trusting":
      return {
        title: "Most trusting",
        detail: `Believed ${award.value} lies`,
      };
    default:
      return null;
  }
}
