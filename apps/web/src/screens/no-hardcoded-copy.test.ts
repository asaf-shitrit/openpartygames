// Guards the join -> lobby surface against a hardcoded English string quietly creeping back
// in as raw JSX text. It does not catch every possible slip (a literal passed as a prop, for
// instance), but a raw JSX text node — `>Some words<` — is the common way copy gets typed
// straight into a component, and every one of these files should route through `t.*` instead.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CONVERTED_FILES = [
  "PhoneJoin.tsx",
  "PhoneLobby.tsx",
  "TvLobby.tsx",
  "PhoneAvatarPicker.tsx",
];

/** A JSX text node: letters immediately between a closing `>` and an opening `</`. */
const TEXT_NODE = />[A-Z][^<>{}\n]{1,80}<\//g;

function sourceOf(fileName: string): string {
  const url = new URL(fileName, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("no hardcoded copy in the join -> lobby screens", () => {
  it.each(CONVERTED_FILES)("%s has no raw JSX text node", (fileName) => {
    const matches = sourceOf(fileName).match(TEXT_NODE) ?? [];
    expect(matches).toEqual([]);
  });
});
