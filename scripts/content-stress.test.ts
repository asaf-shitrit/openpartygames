// The worst-case fixtures are only worst-case while they stay worse than the packs.
//
// Each game's preview.ts exports STRESS_TEXT: the longest content string its fixtures carry.
// The layout suite measures those fixtures, so a pack that ships something longer would walk
// straight past every layout invariant we have. This fails the moment that happens, and says
// which pack did it, so the fixture is raised before the content ships.
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
}

const GAMES: GameContent[] = [
  {
    id: "imposter",
    stress: imposterStress,
    visibleTexts: (item) => [item.crew, item.decoy],
  },
  {
    id: "real-or-nah",
    stress: realOrNahStress,
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
    visibleTexts: (item) => [item.prompt],
  },
  {
    id: "doodle-bluff",
    stress: doodleBluffStress,
    visibleTexts: (item) => [item.prompt, ...(item.houseTitles ?? [])],
  },
];

interface LongestString {
  text: string;
  file: string;
}

function readPack(file: string): PackFile {
  // SAFETY: pnpm validate:packs gates every pack in this directory against the content schema,
  // and runs ahead of the tests, so a pack on disk already matches this shape. Every field read
  // from it here is optional, so a pack that somehow did not would read as empty, never crash.
  const pack: PackFile = JSON.parse(fs.readFileSync(file, "utf8"));
  return pack;
}

function longestInPack(file: string, game: GameContent): LongestString | null {
  let longest: LongestString | null = null;
  for (const item of readPack(path.join(rootDir, "packs", game.id, file)).items ?? []) {
    for (const text of game.visibleTexts(item)) {
      if (text === undefined) continue;
      if (longest !== null && text.length <= longest.text.length) continue;
      longest = { text, file };
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
    if (longest === null || found.text.length > longest.text.length) longest = found;
  }
  return longest;
}

/** Null when the fixture still covers the packs; otherwise what to do about it. */
function complaintFor(game: GameContent): string | null {
  const longest = longestForGame(game);
  if (longest === null) return `no pack content found for ${game.id}`;
  if (game.stress.length >= longest.text.length) return null;
  return (
    `packs/${game.id}/${longest.file} ships ${longest.text.length} characters ("${longest.text}") ` +
    `but the worst-case fixture only carries ${game.stress.length}. Raise STRESS_TEXT in ` +
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
