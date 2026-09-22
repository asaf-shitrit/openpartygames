// Guards the Real or Nah UI against a hardcoded English string quietly creeping back in as
// raw JSX text, or as a plain string literal in the reveal-copy helpers. Both should route
// through `t.*` (see Most Likely To's sibling test).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONVERTED_FILES = [
  "Host.tsx",
  "HostReveal.tsx",
  "Phone.tsx",
  "PhoneReveal.tsx",
  "Standings.tsx",
  "common.tsx",
];

/** A JSX text node: letters immediately between a closing `>` and an opening `</`. */
const TEXT_NODE = />[A-Z][^<>{}\n]{1,80}<\//g;

function sourceOf(fileName: string): string {
  const url = new URL(fileName, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("no hardcoded copy in the Real or Nah UI", () => {
  it.each(CONVERTED_FILES)("%s has no raw JSX text node", (fileName) => {
    const matches = sourceOf(fileName).match(TEXT_NODE) ?? [];
    expect(matches).toEqual([]);
  });
});

describe("no hardcoded copy in the reveal-copy helpers", () => {
  it("reveal-timeline.ts headlines and subs route through the dictionary, not string literals", () => {
    const source = sourceOf("reveal-timeline.ts");
    // Every headline/sub in the old, hardcoded version was a quoted sentence built inline.
    // Now they are all `p.xxxHeadline` / `p.xxxSub` dictionary lookups, or `format(...)` of one.
    expect(source).not.toMatch(/headline: "[A-Z]/);
    expect(source).not.toMatch(/sub: "[A-Z]/);
  });
});
