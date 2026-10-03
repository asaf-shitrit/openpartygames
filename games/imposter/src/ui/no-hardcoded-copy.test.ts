// Guards the Imposter UI against a hardcoded English string quietly creeping back in as a
// raw JSX text node, or as a plain string literal in the beat-timeline copy helpers. Both
// should route through `t.imposter.*` (see Most Likely To's sibling test for the same idea).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONVERTED_FILES = [
  "Host.tsx",
  "HostLastChance.tsx",
  "HostResult.tsx",
  "HostReveal.tsx",
  "Phone.tsx",
  "PhoneLastChance.tsx",
  "PhoneResult.tsx",
  "PhoneReveal.tsx",
  "stage/Clues.tsx",
  "stage/LastChance.tsx",
  "stage/Result.tsx",
  "stage/Reveal.tsx",
  "stage/Vote.tsx",
  "stage/WordCheck.tsx",
];

/** A JSX text node: letters immediately between a closing `>` and an opening `</`. */
const TEXT_NODE = />[A-Z][^<>{}\n]{1,80}<\//g;

/**
 * Words typed after a `{expression}`, in the same JSX text run: `{formatPoints(total)} total`.
 * The text-node rule above only sees a run that opens with a capital right after `>`, so this
 * shipped as English on a Hebrew phone.
 */
const TRAILING_WORDS = /\}\)?\}?[ \t]+[A-Za-z]{3,}(?: [A-Za-z]{2,})*[ \t]*(?:<\/|\n)/g;

function sourceOf(fileName: string): string {
  const url = new URL(fileName, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("no hardcoded copy in the Imposter UI", () => {
  it.each(CONVERTED_FILES)("%s has no raw JSX text node", (fileName) => {
    const matches = sourceOf(fileName).match(TEXT_NODE) ?? [];
    expect(matches).toEqual([]);
  });

  it.each(CONVERTED_FILES)("%s has no words trailing an expression", (fileName) => {
    const matches = sourceOf(fileName).match(TRAILING_WORDS) ?? [];
    expect(matches).toEqual([]);
  });
});

describe("no hardcoded copy in the beat-timeline copy helpers", () => {
  it("result-timeline.ts headlines and subs route through the dictionary, not string literals", () => {
    const source = sourceOf("result-timeline.ts");
    // Every headline/sub in the old, hardcoded version was a quoted sentence assigned
    // straight into the returned object. Now they are all `r.xxx` dictionary lookups.
    expect(source).not.toMatch(/headline: "[A-Z]/);
    expect(source).not.toMatch(/sub: "[A-Z]/);
  });

  it("reveal-timeline.ts headlines and subs route through the dictionary, not string literals", () => {
    const source = sourceOf("reveal-timeline.ts");
    expect(source).not.toMatch(/headline: "[A-Z]/);
    expect(source).not.toMatch(/sub: "[A-Z]/);
  });
});
