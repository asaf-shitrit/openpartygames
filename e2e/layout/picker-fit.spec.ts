// No word on the TV game picker may be broken across two lines.
//
// The picker sizes its cards from a table chosen by game count, measured by hand. A fourth
// game once pushed "Imposter" past its box and the TV rendered it as "Imposte" / "r", in front
// of a room. No invariant objected: the text never left its box, so `offscreen-x` and
// `text-clipped` were both silent, and the only way to see it was to look.
//
// The numbers are still hand-measured — this does not change that. It makes the assumption
// fail out loud at the moment it stops being true: a fifth game, a longer single-word name, or
// a font change. `overflow-wrap: break-word` is set globally so a word that cannot fit breaks
// rather than leaving the screen, which is the right fallback everywhere else; on this screen
// reaching that fallback means the card table needs re-measuring.
import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { SCREENS } from "../../apps/web/src/dev/screens";

const INVARIANTS_PATH = fileURLToPath(new URL("./invariants.js", import.meta.url));

interface BrokenWord {
  word: string;
  lines: number;
}

const picker = SCREENS.find(
  (screen) => screen.kind === "app" && screen.appId === "tv-game-picker",
);

/**
 * Every word the page renders across more than one line box.
 *
 * A word is one run of non-space characters, ranged over its own text node. Counting its
 * rects is not enough and neither is counting distinct `top` values: a Hebrew screen mixes
 * scripts inside one word — "כ-15", a room code, a game name — and each script is a separate
 * bidi run in a different font, so the rects for one line sit at slightly different tops.
 * Counting tops calls that a wrap. Counting line BOXES does not: rects that overlap
 * vertically are the same line however their fonts differ, and a real wrap leaves a gap.
 */
function brokenWords(): BrokenWord[] {
  const found: BrokenWord[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
    const text = node.textContent ?? "";
    const words = /\S+/g;
    for (let hit = words.exec(text); hit !== null; hit = words.exec(text)) {
      const range = document.createRange();
      range.setStart(node, hit.index);
      range.setEnd(node, hit.index + hit[0].length);
      const rects = [...range.getClientRects()].filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      // Counted inline, not in a helper: this function is serialised into the page by
      // `page.evaluate`, so anything it calls from module scope simply does not exist there.
      //
      // Grouped by how far apart the tops are, with a tolerance scaled to the glyph height.
      // Neither simpler rule works. Distinct tops alone calls a mixed-script word two lines,
      // because a Latin run and a Hebrew run on the SAME line sit a few pixels apart in
      // different fonts. Vertical overlap alone misses a real wrap, because Permanent Marker's
      // glyph boxes are taller than its 1.1 line-height: measured here, a genuinely broken
      // "Imposter" gives rects at 372-445 and 443-514, which overlap by two pixels.
      const byTop = rects.toSorted((a, b) => a.top - b.top);
      let lines = 0;
      let lineTop = Number.NEGATIVE_INFINITY;
      for (const rect of byTop) {
        const tolerance = Math.max(4, rect.height * 0.6);
        if (rect.top - lineTop >= tolerance) {
          lines += 1;
          lineTop = rect.top;
        }
      }
      if (lines > 1) found.push({ word: hit[0], lines });
    }
  }
  return found;
}

test.describe("TV game picker", () => {
  test("renders every game name without breaking a word", async ({ page }) => {
    // Not skipped silently: the screen this exists to guard must be in the gallery.
    expect(picker, "no tv-game-picker screen in the dev gallery").toBeDefined();
    const id = picker?.id ?? "";

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript({ path: INVARIANTS_PATH });
    await page.goto(`/dev/screens?id=${encodeURIComponent(id)}`);
    await page.waitForFunction((want) => document.body.dataset.screen === want, id, {
      timeout: 15_000,
    });

    const broken = await page.evaluate(brokenWords);
    expect(
      broken.map((each) => `"${each.word}" split across ${each.lines} lines`),
    ).toEqual([]);
  });
});
