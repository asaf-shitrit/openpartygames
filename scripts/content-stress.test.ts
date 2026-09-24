// The worst-case fixtures are only worst-case while they stay worse than the packs.
//
// Each game's preview.ts exports STRESS_TEXT: the longest content string its fixtures carry.
// The layout suite measures those fixtures, so a pack that ships something longer would walk
// straight past every layout invariant we have. This fails the moment that happens, and says
// which pack did it, so the fixture is raised before the content ships.
//
// This holds the fixture to character count, not rendered width — layout does not actually
// care about characters, it cares about pixels, and a word can be wider than a longer one
// because it leans on wide letters like w and m. That gap is real: see
// e2e/layout/content-width.spec.ts, which holds the same fixtures against the same packs by
// rendered width, in the real fonts, in a browser (this Vitest project has no browser; happy-dom
// reports every rect as zero, per CLAUDE.md, so it cannot measure width). This test stays
// anyway, as a cheap first line of defence: it runs in `pnpm test`, with no browser and no dev
// server, so a pack that grows past the fixture fails in seconds, long before anyone runs the
// slower layout suite — character count is a close enough proxy to catch most growth
// immediately, even though it is not the whole truth.
//
// Imposter is compared by its longest WORD, every other game by its longest whole VALUE. The
// difference matters: imposter's crew/decoy renders through fitTextSize
// (packages/ui/src/text-fit.ts), which only ever looks at the single longest word in the text —
// a 12-character word like "thunderstorm" forces a smaller size than a 9-character word does,
// regardless of how many other words sit next to it. Comparing whole values hid this: "flight
// attendant" (17 characters, longest word "attendant" at 9) looked like the worst case next to
// "thunderstorm" (12 characters, and its own longest word, since it has no space in it), so a
// pack that already shipped "thunderstorm" was passing this guard by a metric fitTextSize never
// actually uses. The other three games render their prompts as plain wrapped text at a fixed
// size, with no per-word sizer, so the whole value's length remains the fixture's job to cover
// there — this file does not compare longest-word-across-games, only game by game.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STRESS_TEXT as doodleBluffStress } from "../games/doodle-bluff/src/ui/preview";
import { STRESS_TEXT as imposterStress } from "../games/imposter/src/ui/preview";
import { STRESS_TEXT as mostLikelyToStress } from "../games/most-likely-to/src/ui/preview";
import { STRESS_TEXT as realOrNahStress } from "../games/real-or-nah/src/ui/preview";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

/** The fields a pack item can carry, across every content kind. */
interface PackItem {
  crew?: string;
  decoy?: string;
  prompt?: string;
  answer?: string;
  alternates?: string[];
  decoys?: string[];
  houseTitles?: string[];
}

interface PackFile {
  items?: PackItem[];
}

interface GameContent {
  id: string;
  stress: string;
  /** The strings in one item that a player actually reads. Ids and sources are not shown. */
  visibleTexts: (item: PackItem) => Array<string | undefined>;
  /**
   * "word": compare by the longest whitespace-separated word (what fitTextSize actually sizes
   * from). "value": compare by the whole string (what a fixed-size wrapped field renders as a
   * unit). See the file header for why imposter is the only "word" game today.
   */
  metric: "word" | "value";
}

/** The longest whitespace-separated run of characters in `text`, itself if there is no space. */
function longestWord(text: string): string {
  let longest = "";
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > longest.length) longest = word;
  }
  return longest;
}

const GAMES: GameContent[] = [
  {
    id: "imposter",
    stress: imposterStress,
    metric: "word",
    visibleTexts: (item) => [item.crew, item.decoy],
  },
  {
    id: "real-or-nah",
    stress: realOrNahStress,
    metric: "value",
    visibleTexts: (item) => [
      item.prompt,
      item.answer,
      ...(item.alternates ?? []),
      ...(item.decoys ?? []),
    ],
  },
  {
    id: "most-likely-to",
    stress: mostLikelyToStress,
    metric: "value",
    visibleTexts: (item) => [item.prompt],
  },
  {
    id: "doodle-bluff",
    stress: doodleBluffStress,
    metric: "value",
    visibleTexts: (item) => [item.prompt, ...(item.houseTitles ?? [])],
  },
];

interface LongestString {
  /** The full pack value, for the error message. */
  text: string;
  /** What was actually measured: `text` itself, or its longest word, per the game's metric. */
  measured: string;
  file: string;
}

function readPack(file: string): PackFile {
  // SAFETY: pnpm validate:packs gates every pack in this directory against the content schema,
  // and runs ahead of the tests, so a pack on disk already matches this shape. Every field read
  // from it here is optional, so a pack that somehow did not would read as empty, never crash.
  const pack: PackFile = JSON.parse(fs.readFileSync(file, "utf8"));
  return pack;
}

/** The text a game's metric actually measures: the whole value, or just its longest word. */
function measuredText(text: string, game: GameContent): string {
  return game.metric === "word" ? longestWord(text) : text;
}

function longestInPack(file: string, game: GameContent): LongestString | null {
  let longest: LongestString | null = null;
  for (const item of readPack(path.join(rootDir, "packs", game.id, file)).items ?? []) {
    for (const text of game.visibleTexts(item)) {
      if (text === undefined) continue;
      const measured = measuredText(text, game);
      if (longest !== null && measured.length <= longest.measured.length) continue;
      longest = { text, measured, file };
    }
  }
  return longest;
}

function longestForGame(game: GameContent): LongestString | null {
  const dir = path.join(rootDir, "packs", game.id);
  let longest: LongestString | null = null;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const found = longestInPack(file, game);
    if (found === null) continue;
    if (longest === null || found.measured.length > longest.measured.length) longest = found;
  }
  return longest;
}

/** Null when the fixture still covers the packs; otherwise what to do about it. */
function complaintFor(game: GameContent): string | null {
  const longest = longestForGame(game);
  if (longest === null) return `no pack content found for ${game.id}`;
  const stressMeasured = measuredText(game.stress, game);
  if (stressMeasured.length >= longest.measured.length) return null;
  const what = game.metric === "word" ? `its longest word, "${longest.measured}", is` : "it is";
  return (
    `packs/${game.id}/${longest.file} ships "${longest.text}" — ${what} ` +
    `${longest.measured.length} characters — but the worst-case fixture only carries ` +
    `${stressMeasured.length} (from "${game.stress}"). Raise STRESS_TEXT in ` +
    `games/${game.id}/src/ui/preview.ts, then rerun pnpm e2e:layout.`
  );
}

describe("worst-case fixtures cover the packs", () => {
  for (const game of GAMES) {
    it(`${game.id}: STRESS_TEXT is at least as long as anything its packs ship`, () => {
      expect(complaintFor(game)).toBeNull();
    });
  }
});
