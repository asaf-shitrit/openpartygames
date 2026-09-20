// Guards every platform screen against a hardcoded English string quietly creeping back
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
  "PhoneLanding.tsx",
  "TvLanding.tsx",
  "ShowOnTv.tsx",
  "PhoneResults.tsx",
  "TvFinalScores.tsx",
  "PhoneVipControls.tsx",
  "VipGameBar.tsx",
  "TvGamePicker.tsx",
  "PhoneWaiting.tsx",
  "PhoneKicked.tsx",
  "PhoneReconnecting.tsx",
  "TvReconnecting.tsx",
  "TvFullTonight.tsx",
  "TvCredits.tsx",
  "HostApp.tsx",
  "shared.tsx",
];

/** A JSX text node: letters immediately between a closing `>` and an opening `</`. */
const TEXT_NODE = />[A-Z][^<>{}\n]{1,80}<\//g;

/**
 * A sentence handed to a prop that ends up on screen or in a screen reader. This is the
 * half the text-node check cannot see, and the half that hides best: the UI kit shipped a
 * whole screen's worth of English in `aria-label`s and `title`s precisely because nothing
 * looked here.
 */
const COPY_PROPS = ["title", "label", "aria-label", "alt", "detail", "placeholder"];
const COPY_PROP_LITERAL = new RegExp(
  `(?:${COPY_PROPS.join("|")})="[A-Z][^"]{2,}"`,
  "g",
);

function sourceOf(fileName: string): string {
  const url = new URL(fileName, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

describe("no hardcoded copy in the platform screens", () => {
  it.each(CONVERTED_FILES)("%s has no raw JSX text node", (fileName) => {
    const matches = sourceOf(fileName).match(TEXT_NODE) ?? [];
    expect(matches).toEqual([]);
  });

  it.each(CONVERTED_FILES)("%s has no copy in a prop literal", (fileName) => {
    const matches = sourceOf(fileName).match(COPY_PROP_LITERAL) ?? [];
    expect(matches).toEqual([]);
  });
});
