// The main action of a phone screen must be on screen without scrolling.
//
// A no-TV Most Likely To ballot stacks the staged prompt above the candidate list, so the page
// scrolls, and "Lock in vote" used to sit past the bottom edge: a player who picked a name had to
// scroll to find the button that sends it. No layout invariant objected, because a scrolling page
// is allowed to run long. This asks the narrower question: at rest, is the last button on the
// screen (the lock-in) fully inside the viewport?
import { expect, test } from "@playwright/test";

const BALLOTS = ["most-likely-to/14", "most-likely-to/21"];
const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

for (const id of BALLOTS) {
  for (const size of SIZES) {
    test(`${id} keeps its lock-in button in view at ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto(`/dev/screens?id=${encodeURIComponent(id)}`);
      await page.waitForFunction((screen) => document.body.dataset.screen === screen, id);
      await page.evaluate(() => document.fonts.ready);
      const box = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll("#root button")];
        const rect = buttons.at(-1)?.getBoundingClientRect();
        return rect === undefined
          ? null
          : { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
      });
      expect(box, "the ballot renders a button").not.toBeNull();
      expect(box?.top ?? -1).toBeGreaterThanOrEqual(0);
      expect(box?.bottom ?? Infinity).toBeLessThanOrEqual(box?.height ?? 0);
    });
  }
}
