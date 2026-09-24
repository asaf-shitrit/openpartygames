// The worst-case fixtures are only worst-case while they render at least as WIDE as the packs.
//
// scripts/content-stress.test.ts holds each game's STRESS_TEXT against its packs by character
// count. That is fast and needs no browser, so it stays as a cheap first line of defence — a
// pack that grows past the fixture in characters still fails fast, in `pnpm test`, long before
// anyone runs the (slower) layout suite. But layout does not care about characters, it cares
// about pixels: "WWWWWWWWWWWWWWWW" is nearly twice as wide as "flight attendant" at the same
// sixteen characters, and a pack built from wide glyphs would clear the character-count guard
// while still running off a phone. This measures width instead, in the real face the screen
// renders that content in, using the fonts the app actually ships. Measuring rendered width
// needs a browser — happy-dom (the Vitest scripts project's DOM) reports every rect as zero, per
// CLAUDE.md — so this lives in the layout suite rather than next to the character-count test.
//
// Scope: only the games' English-language packs. The preview fixtures every game ships (and
// that layout.spec.ts renders) are fixed English strings; there is currently no preview fixture
// that carries a game's Hebrew pack content, in either the "en" or "he" project, so Hebrew (and
// any other non-Latin) pack content is not exercised by the layout suite at all today — a real
// gap, but a different one (missing coverage, not a wrong proxy), and out of scope here: closing
// it means giving each game a Hebrew fixture in its own preview.ts, which this task does not own.
//
// Imposter is measured word by word, every other game value by value — matching
// scripts/content-stress.test.ts's own word/value split, for the same reason: imposter's
// crew/decoy renders through fitTextSize (packages/ui/src/text-fit.ts), which sizes off the
// single longest word in the text and nothing else, so a two-word pair like "flight attendant"
// is only ever as dangerous as "attendant" alone. Comparing whole values here would make the
// same mistake the character-count guard used to make: a longer compound value could look like
// the worst case while the pack's actual longest single word — the one that actually decides
// the size — went unmeasured. The other three games render fixed-size wrapped text with no
// per-word sizer, so whatever the whole value renders as, nowrap, remains the right thing to
// measure there.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STRESS_TEXT as doodleBluffStress } from "../../games/doodle-bluff/src/ui/preview";
import { STRESS_TEXT as imposterStress } from "../../games/imposter/src/ui/preview";
import { STRESS_TEXT as mostLikelyToStress } from "../../games/most-likely-to/src/ui/preview";
import { STRESS_TEXT as realOrNahStress } from "../../games/real-or-nah/src/ui/preview";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

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
  language?: string;
  items?: PackItem[];
}

/** The CSS custom property that names the face a piece of content actually renders in. */
type Face = "body" | "marker";

interface GameContent {
  id: string;
  stress: string;
  /** The face STRESS_TEXT (and every field below) renders in on a real screen. */
  face: Face;
  /** "word": measure the longest word only (what fitTextSize sizes from). "value": the whole
   *  string, nowrap (what a fixed-size wrapped field renders as a unit). */
  metric: "word" | "value";
  /** The strings in one item that a player actually reads. Ids and sources are not shown. */
  visibleTexts: (item: PackItem) => Array<string | undefined>;
}

// Every field here renders as plain body copy (Atkinson Hyperlegible) EXCEPT imposter's
// crew/decoy: those are the secret word, shown through WordCardFront in the Permanent Marker
// face via fitTextSize (games/imposter/src/ui/Phone.tsx), so they are measured in that face.
const GAMES: GameContent[] = [
  {
    id: "imposter",
    stress: imposterStress,
    face: "marker",
    metric: "word",
    visibleTexts: (item) => [item.crew, item.decoy],
  },
  {
    id: "real-or-nah",
    stress: realOrNahStress,
    face: "body",
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
    face: "body",
    metric: "value",
    visibleTexts: (item) => [item.prompt],
  },
  {
    id: "doodle-bluff",
    stress: doodleBluffStress,
    face: "body",
    metric: "value",
    visibleTexts: (item) => [item.prompt, ...(item.houseTitles ?? [])],
  },
];

/** The longest whitespace-separated word in `text`, or `text` itself if there is no space. */
function longestWord(text: string): string {
  let longest = "";
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > longest.length) longest = word;
  }
  return longest;
}

/** What a game's metric actually measures for one pack string: the value, or just its word. */
function measuredText(text: string, game: GameContent): string {
  return game.metric === "word" ? longestWord(text) : text;
}

interface Candidate {
  /** The full pack value, for the failure message. */
  text: string;
  /** What is actually rendered and measured: `text`, or its longest word. */
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

/** Every English-language string a game's packs put in front of a player, deduplicated. */
function englishCandidates(game: GameContent): Candidate[] {
  const dir = path.join(rootDir, "packs", game.id);
  const seen = new Map<string, Candidate>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const pack = readPack(path.join(dir, file));
    if (pack.language !== "en") continue;
    for (const item of pack.items ?? []) {
      for (const text of game.visibleTexts(item)) {
        if (text === undefined || text === "") continue;
        if (!seen.has(text)) seen.set(text, { text, measured: measuredText(text, game), file });
      }
    }
  }
  return [...seen.values()];
}

/**
 * A face is only requested from the network once a glyph in it is actually rendered; a probe
 * on an otherwise-empty page can measure before that request settles and silently get the
 * fallback font's metrics instead. Forcing the load first (and awaiting it) is what makes this
 * a measurement of Permanent Marker / Atkinson Hyperlegible rather than of "cursive".
 */
async function ensureFontsLoaded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('200px "Permanent Marker"'),
      document.fonts.load('200px "Atkinson Hyperlegible"'),
      document.fonts.load('700 200px "Atkinson Hyperlegible"'),
    ]);
    await document.fonts.ready;
  });
}

/**
 * Renders `texts` off-screen, one at a time, in the given face at a large fixed size (px
 * quantization is coarser at small sizes; 200px keeps the comparison precise) and returns each
 * one's nowrap pixel width. A real browser only: this is exactly the measurement the app itself
 * cannot fake, which is the whole reason this check needs to run here.
 */
async function measureWidths(page: Page, face: Face, texts: string[]): Promise<number[]> {
  return page.evaluate(
    ({ face: probeFace, texts: probeTexts }) => {
      const cssVar = probeFace === "marker" ? "--opg-font-marker" : "--opg-font-body";
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue(cssVar);
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "nowrap";
      probe.style.left = "-99999px";
      probe.style.top = "0";
      probe.style.fontSize = "200px";
      probe.style.fontFamily = fontFamily;
      document.body.appendChild(probe);
      const widths = probeTexts.map((text) => {
        probe.textContent = text;
        return probe.getBoundingClientRect().width;
      });
      probe.remove();
      return widths;
    },
    { face, texts },
  );
}

test.describe("worst-case fixtures are at least as wide as the packs", () => {
  for (const game of GAMES) {
    test(`${game.id}: STRESS_TEXT covers every English pack string by rendered width`, async ({
      page,
    }) => {
      await page.goto("/dev/screens");
      await ensureFontsLoaded(page);

      const candidates = englishCandidates(game);
      expect(candidates.length, `no English pack content found for ${game.id}`).toBeGreaterThan(
        0,
      );

      const stressMeasured = measuredText(game.stress, game);
      const texts = [stressMeasured, ...candidates.map((c) => c.measured)];
      const widths = await measureWidths(page, game.face, texts);
      const stressWidth = widths[0];

      const measured = candidates.map((candidate, i) => ({ candidate, width: widths[i + 1] }));
      // Non-empty: candidates.length was asserted above, and measured has the same length.
      const worst = measured.reduce((a, b) => (b.width > a.width ? b : a));
      const what = game.metric === "word" ? `its longest word, "${worst.candidate.measured}", ` : "";
      expect(
        stressWidth,
        `packs/${game.id}/${worst.candidate.file} ships "${worst.candidate.text}" — ${what}` +
          `renders ${worst.width.toFixed(1)}px in the ${game.face} face — but STRESS_TEXT ` +
          `("${game.stress}") only renders ${stressWidth.toFixed(1)}px wide (as measured: ` +
          `"${stressMeasured}"). Raise STRESS_TEXT in games/${game.id}/src/ui/preview.ts, then ` +
          `rerun pnpm e2e:layout.`,
      ).toBeGreaterThanOrEqual(worst.width);
    });
  }
});
