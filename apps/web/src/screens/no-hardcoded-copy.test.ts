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
  "PhoneStarting.tsx",
  "PhoneNextRoundBar.tsx",
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

/**
 * The same props handed a template literal — `` label={`${pack.name} pack`} `` — which the
 * quoted-string rule above cannot see, because the copy is not in quotes.
 *
 * This is not hypothetical: the pack switches on both the TV picker and the VIP's phone shipped
 * their entire accessible name as one of these, so a Hebrew screen reader announced an English
 * noun, and nothing here noticed. Interpolation is the whole point of a template, so the test
 * is not "does it contain letters" — it is "does it contain letters *outside* the `${…}`".
 */
const COPY_PROP_TEMPLATE = new RegExp(
  `(?:${COPY_PROPS.join("|")})=\\{\`([^\`]*)\``,
  "g",
);

/** A run of letters long enough to be a word rather than a separator or a unit. */
const ENGLISH_WORD = /[A-Za-z]{3,}/;

/** The literal halves of a template: everything the author typed outside any `${…}`. */
function outsideInterpolations(template: string): string {
  return template.replaceAll(/\$\{[^}]*\}/g, " ");
}

function templateCopyIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(COPY_PROP_TEMPLATE)) {
    const literal = outsideInterpolations(match[1] ?? "");
    if (ENGLISH_WORD.test(literal)) found.push(match[0]);
  }
  return found;
}

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

  it.each(CONVERTED_FILES)("%s has no copy in a prop template literal", (fileName) => {
    expect(templateCopyIn(sourceOf(fileName))).toEqual([]);
  });
});
