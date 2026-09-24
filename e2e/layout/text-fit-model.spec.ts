// fitTextSize (packages/ui/src/text-fit.ts) sizes a heading from MARKER_ADVANCE: a fraction of
// font size that stands in for how wide a Permanent Marker glyph actually is, measured once by
// hand and written down in a comment. That number is a bet — if a real word's average glyph
// advance ever exceeds it, fitTextSize hands out a size that overflows its container; if the
// real ceiling sits well below it, headings shrink more than they need to. This holds the bet
// against the fonts and pack content the app actually ships, in a real browser (text-fit.ts
// itself stays a pure function with no DOM access, so this lives here rather than as a unit
// test).
//
// Writing this found the model wrong: real words already shipped in packs/imposter — "owl",
// "mop", "meadow" — measure a wider average advance in the real, running Permanent Marker face
// than the old 0.62 allowed for, which meant fitTextSize could hand those words a size a touch
// too large for their container. MARKER_ADVANCE is now 0.75, with headroom over the widest real
// and adversarial word found here; see packages/ui/src/text-fit.ts for the numbers and how they
// were measured (three independent ways, all agreeing, to rule out a measurement artifact
// rather than a real font-metrics gap). This exists so a future word (or a future swap of the
// Permanent Marker font file) that breaks the bet again fails loudly instead of quietly
// overflowing a phone.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER_ADVANCE } from "../../packages/ui/src/text-fit";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

interface PackItem {
  crew?: string;
  decoy?: string;
}

interface PackFile {
  language?: string;
  items?: PackItem[];
}

/**
 * Every individual word any English imposter pack ships in crew/decoy, split on whitespace.
 * fitTextSize only ever measures one word at a time (it sizes off the longest word in the
 * text, ignoring the rest), so a two-word value like "flight attendant" is really two
 * candidates here, "flight" and "attendant" — not one 17-character string with a space in it,
 * which would dilute the advance of whichever half is actually the wide one.
 */
function packWords(): string[] {
  const dir = path.join(rootDir, "packs", "imposter");
  const words = new Set<string>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    // SAFETY: pnpm validate:packs gates every pack here against the content schema ahead of
    // this test, so the shape read here already matches; every field is optional regardless.
    const pack: PackFile = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (pack.language !== "en") continue;
    for (const item of pack.items ?? []) {
      for (const value of [item.crew, item.decoy]) {
        if (!value) continue;
        for (const word of value.trim().split(/\s+/)) words.add(word);
      }
    }
  }
  return [...words];
}

// English words built almost entirely from the widest letters in a Latin alphabet (m/w), long
// enough that hand-picking pack content forever would be luck rather than a guarantee. Real
// pack words rarely concentrate m/w this heavily, so these push past what today's packs ship
// and stand in for tomorrow's.
const ADVERSARIAL_WORDS = [
  "marshmallow",
  "grandmother",
  "waterworks",
  "mammogram",
  "wheelbarrow",
  "millimeter",
  "watermelon",
  "wigwam",
  "maximum",
  "mishmash",
  "webcam",
  "meowmeow",
  "wowzers",
];

/** Average glyph advance as a fraction of font size, for every word at one probe size. */
async function measureAdvances(
  page: Page,
  words: string[],
  fontSizePx: number,
): Promise<number[]> {
  return page.evaluate(
    ({ words: probeWords, fontSizePx: probeSize }) => {
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue(
        "--opg-font-marker",
      );
      const probe = document.createElement("span");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.whiteSpace = "nowrap";
      probe.style.left = "-99999px";
      probe.style.top = "0";
      probe.style.fontSize = `${probeSize}px`;
      probe.style.fontFamily = fontFamily;
      document.body.appendChild(probe);
      const advances = probeWords.map((word) => {
        probe.textContent = word;
        const width = probe.getBoundingClientRect().width;
        return width / (word.length * probeSize);
      });
      probe.remove();
      return advances;
    },
    { words, fontSizePx },
  );
}

test.describe("MARKER_ADVANCE covers the words it sizes", () => {
  // fitTextSize is used at sizes from WORD_MIN_SIZE (28) to the imposter word ceiling; check
  // the model at both ends, since hinting can shift metrics at small sizes.
  for (const fontSizePx of [28, 72, 200]) {
    test(`at ${fontSizePx}px, no pack word or adversarial word exceeds the model`, async ({
      page,
    }) => {
      await page.goto("/dev/screens");
      // A face is only fetched once a glyph in it is actually rendered; force it to load
      // before measuring, or a probe on this otherwise-empty page measures the fallback
      // font's metrics instead of Permanent Marker's.
      await page.evaluate(async () => {
        await document.fonts.load('200px "Permanent Marker"');
        await document.fonts.ready;
      });

      const words = [...packWords(), ...ADVERSARIAL_WORDS];
      expect(words.length).toBeGreaterThan(0);

      const advances = await measureAdvances(page, words, fontSizePx);
      const measured = words.map((word, i) => ({ word, advance: advances[i] }));
      // Non-empty: words.length was asserted above, and measured has the same length.
      const found = measured.reduce((a, b) => (b.advance > a.advance ? b : a));
      expect(
        found.advance,
        `"${found.word}" measures ${found.advance.toFixed(4)} average advance at ` +
          `${fontSizePx}px, but MARKER_ADVANCE is ${MARKER_ADVANCE}. Raise MARKER_ADVANCE in ` +
          `packages/ui/src/text-fit.ts to cover it.`,
      ).toBeLessThanOrEqual(MARKER_ADVANCE);
    });
  }
});
