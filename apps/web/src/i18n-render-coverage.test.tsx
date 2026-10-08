// Every player-visible string must be rendered by at least one screen in the dev gallery.
//
// The worst-case fixtures are written for length: the longest content a pack ships, eight
// players, names at NAME_MAX_LENGTH. Length is half of it. The other half is reach: a string
// only ever drawn on a branch that no fixture takes is a string the layout suite never measures,
// however long the fixtures are. Real or Nah's callout stamp sat at 22px, under the 28px TV
// floor, for as long as it existed, because `callout()` needs three fooled players and no
// fixture had more than two. Nothing failed, because nothing looked.
//
// So this renders every screen the layout suite walks, in English, through a copy of the
// dictionary that records each string a component reads, and compares what was read against every string the
// dictionary holds. A read stands in for a render: components take copy from `useLocale().t`
// and put it on the screen, so a string nobody reads is a string nobody draws. That also makes
// plural forms count separately, which is the point: "Waiting for 1 more" and "Waiting for 2
// more" are different strings at different widths, and a fixture that only ever has two
// stragglers measures one of them.
//
// Strings no screen reaches yet are listed in `dev/unrendered-copy.ts`. The list holds both
// ways: a new string missing from every screen fails here until a preview renders it, and a
// listed string a preview starts rendering fails here until its line is deleted, so the list
// can only shrink.
import { DICTIONARIES, en, LocaleProvider } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeAll, expect, it } from "vitest";
import { z } from "zod";
import { ScreenGallery } from "./dev/ScreenGallery";
import { SCREENS } from "./dev/screens";
import type { ScreenCase } from "./dev/screens";
import { NOT_YET_RENDERED } from "./dev/unrendered-copy";
import { preloadGameUi } from "./games";

/** A dictionary entry: a string a player reads, or a namespace (or plural set) of more. */
type CopyNode =
  | { kind: "text"; text: string }
  | { kind: "group"; children: Array<[string, CopyNode]> };

const copyNodeSchema: z.ZodType<CopyNode> = z.lazy(() =>
  z.union([
    z.string().transform((text): CopyNode => ({ kind: "text", text })),
    z
      .record(z.string(), copyNodeSchema)
      .transform((children): CopyNode => ({ kind: "group", children: Object.entries(children) })),
  ]),
);

const englishCopy = copyNodeSchema.parse(en);

/** Every string path under a node, as "namespace.key" or "namespace.key.form". */
function stringPaths(node: CopyNode, path: string): string[] {
  if (node.kind === "text") return [path];
  return node.children.flatMap(([key, child]) => stringPaths(child, joinPath(path, key)));
}

function joinPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/** Every dictionary path a screen has read. */
const read = new Set<string>();

/** A property that hands back its string and notes, on the way, that it was read. */
function recordingProperty(node: CopyNode, path: string): PropertyDescriptor {
  if (node.kind === "group") return { enumerable: true, value: recordingGroup(node, path) };
  return {
    enumerable: true,
    get: () => {
      read.add(path);
      return node.text;
    },
  };
}

function recordingGroup(node: CopyNode & { kind: "group" }, path: string) {
  const group = {};
  for (const [key, child] of node.children) {
    Object.defineProperty(group, key, recordingProperty(child, joinPath(path, key)));
  }
  return group;
}

/** Holds a rebuilt dictionary to the one it was rebuilt from: the same keys, the same strings. */
const sameAsEnglish = z.custom<Dictionary>(
  (rebuilt) => JSON.stringify(copyNodeSchema.parse(rebuilt)) === JSON.stringify(englishCopy),
);

/** English, rebuilt key for key so that every read of a string is recorded. */
function recordingEnglish(): Dictionary {
  if (englishCopy.kind !== "group") throw new Error("The English dictionary is not a namespace");
  const rebuilt = sameAsEnglish.parse(recordingGroup(englishCopy, ""));
  // Checking the copy read every string in it; only what the screens read counts.
  read.clear();
  return rebuilt;
}

const dictionaries = { ...DICTIONARIES, en: recordingEnglish() };

// A game's screens are a lazy chunk; load them all up front so each render below waits on
// rendering, not on an import.
const PRELOAD_TIMEOUT_MS = 60_000;
const SCREEN_READY_TIMEOUT_MS = 20_000;
beforeAll(async () => {
  const gameIds = new Set(SCREENS.flatMap((each) => (each.kind === "game" ? [each.gameId] : [])));
  await Promise.all([...gameIds].map((id) => preloadGameUi(id)));
}, PRELOAD_TIMEOUT_MS);

/** Mounts one screen the way /dev/screens does and waits until the gallery says it is up. */
async function renderScreen(screen: ScreenCase): Promise<void> {
  render(
    <LocaleProvider dictionaries={dictionaries}>
      <ScreenGallery search={`?id=${encodeURIComponent(screen.id)}`} />
    </LocaleProvider>,
  );
  await waitFor(() => expect(document.body.dataset.screen).toBe(screen.id), {
    timeout: SCREEN_READY_TIMEOUT_MS,
  });
  cleanup();
}

it(
  "every player-visible string is rendered by some screen, or listed as not yet",
  async () => {
    // One at a time: each render reads into the same set, and the gallery marks the body with
    // the one screen it is showing.
    await SCREENS.reduce(async (previous, screen) => {
      await previous;
      await renderScreen(screen);
    }, Promise.resolve());

    const all = stringPaths(englishCopy, "");
    const listed = new Set(NOT_YET_RENDERED);
    const exists = new Set(all);

    expect.soft(
      all.filter((path) => !read.has(path) && !listed.has(path)),
      "These strings are in the dictionary but no gallery screen renders them, so the layout\n" +
        "suite has never measured them. Add a preview fixture that reaches each one (the game's\n" +
        "preview.ts, or dev/app-screens.tsx for the app shell).",
    ).toEqual([]);
    expect.soft(
      NOT_YET_RENDERED.filter((path) => read.has(path)),
      "A preview now renders these, so delete them from dev/unrendered-copy.ts.",
    ).toEqual([]);
    expect.soft(
      NOT_YET_RENDERED.filter((path) => !exists.has(path)),
      "These are listed in dev/unrendered-copy.ts but are no longer in the dictionary.",
    ).toEqual([]);
  },
  SCREENS.length * SCREEN_READY_TIMEOUT_MS,
);
