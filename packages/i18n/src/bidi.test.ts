// A signed number or a numeric range inside Hebrew text must sit in an LTR isolate.
//
// Without one the Unicode bidi algorithm treats "+" and "–" as neutrals between right-to-left
// context and a number, and resolves them to the right-to-left side: "+500" paints as "500+"
// and a range "3–8" paints as "8–3". Both read as plausible, wrong numbers, so nothing crashes
// and nobody on the team who reads English would see it.
import { describe, expect, it } from "vitest";
import { he } from "./he";

const LRI = "⁦";
const PDI = "⁩";

type DictNode = string | { readonly [key: string]: DictNode };

function leaves(node: DictNode, path: string[], into: Map<string, string>): void {
  if (!(node instanceof Object)) {
    into.set(path.join("."), node);
    return;
  }
  for (const [key, child] of Object.entries(node)) leaves(child, [...path, key], into);
}

/** Every "+N", "+{x}", "N–M" or "{a}–{b}" run in a string, with and without its isolate. */
const SIGNED_OR_RANGE = /\+(?:\{\w+\}|\d[\d,]*)|(?:\{\w+\}|\d+)–(?:\{\w+\}|\d+)/g;

function unisolated(value: string): string[] {
  const bad: string[] = [];
  for (const match of value.matchAll(SIGNED_OR_RANGE)) {
    const at = match.index;
    const before = value.slice(Math.max(0, at - 1), at);
    const after = value.slice(at + match[0].length, at + match[0].length + 1);
    if (before !== LRI || after !== PDI) bad.push(match[0]);
  }
  return bad;
}

describe("Hebrew signed numbers and ranges", () => {
  it("sits every one in an LTR isolate", () => {
    const all = new Map<string, string>();
    leaves(he, [], all);
    const offenders = [...all].filter(([, value]) => unisolated(value).length > 0);
    expect(offenders.map(([key]) => key)).toEqual([]);
  });

  it("knows an isolated run from a bare one", () => {
    expect(unisolated(`${LRI}+500${PDI} בשבילכם`)).toEqual([]);
    expect(unisolated("+500 בשבילכם")).toEqual(["+500"]);
    expect(unisolated("{min}–{max} שחקנים")).toEqual(["{min}–{max}"]);
  });
});
