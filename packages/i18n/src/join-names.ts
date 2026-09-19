import { format } from "./format";
import type { Dictionary } from "./dictionary";

type ListForms = Pick<
  Dictionary["common"],
  "listAndTwo" | "listAndLast" | "listOrTwo" | "listOrLast"
>;

function joinList(
  names: readonly string[],
  two: string,
  last: string,
): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return format(two, { a: names[0] ?? "", b: names[1] ?? "" });
  const list = names.slice(0, -1).join(", ");
  return format(last, { list, last: names[names.length - 1] ?? "" });
}

/** "A", "A and B", "A, B and C" (locale conjunction). */
export function joinNamesAnd(t: ListForms, names: readonly string[]): string {
  return joinList(names, t.listAndTwo, t.listAndLast);
}

/** "A", "A or B", "A, B or C" (locale disjunction). */
export function joinNamesOr(t: ListForms, names: readonly string[]): string {
  return joinList(names, t.listOrTwo, t.listOrLast);
}
