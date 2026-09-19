// Guards the Most Likely To UI against a hardcoded English string quietly creeping back in as
// raw JSX text, or as a plain string literal in the reveal-copy helpers. Both should route
// through `t.*` (see PhoneJoin/PhoneLobby's sibling test in apps/web for the JSX-only version).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONVERTED_FILES = [
  "Host.tsx",
  "Phone.tsx",
  "HostReveal.tsx",
  "PhoneReveal.tsx",
  "common.tsx",
  "stage/Vote.tsx",
  "stage/Reveal.tsx",
];

/** A JSX text node: letters immediately between a closing `>` and an opening `</`. */
const TEXT_NODE = />[A-Z][^<>{}\n]{1,80}<\//g;

function sourceOf(fileName: string): string {
  const url = new URL(fileName, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("no hardcoded copy in the Most Likely To UI", () => {
  it.each(CONVERTED_FILES)("%s has no raw JSX text node", (fileName) => {
    const matches = sourceOf(fileName).match(TEXT_NODE) ?? [];
    expect(matches).toEqual([]);
  });
});

describe("no hardcoded copy in the reveal-copy helpers", () => {
  it("reveal-timeline.ts headlines and subs route through the dictionary, not string literals", () => {
    const source = sourceOf("reveal-timeline.ts");
    // Every headline/sub in the old, hardcoded version was a quoted sentence passed straight
    // to `card(...)`. Now they are all `p.xxxHeadline` / `p.xxxSub` dictionary lookups.
    expect(source).not.toMatch(/card\(\s*"[A-Z]/);
  });
});
