// The main action of a phone screen must be on screen without scrolling.
//
// A no-TV Most Likely To ballot stacks the staged prompt above the candidate list, so the page
// scrolls, and "Lock in vote" used to sit past the bottom edge: a player who picked a name had to
// scroll to find the button that sends it. No layout invariant objected, because a scrolling page
// is allowed to run long. This asks the narrower question: at rest, is the lock-in button fully
// inside the viewport?
//
// Screens are chosen by what they are (a no-TV phone ballot of this game), not by preview index,
// and the button is found by its accessible name in the locale under test. If either goes
// missing the test fails rather than quietly measuring some other screen.
import { expect, test } from "@playwright/test";
import { DICTIONARIES } from "../../packages/i18n/src/dictionaries";
import type { Locale } from "../../packages/i18n/src/locale";
import { SCREENS } from "../../apps/web/src/dev/screens";

const BALLOTS = SCREENS.filter(
  (screen) =>
    screen.gameId === "most-likely-to" &&
    screen.surface === "phone" &&
    screen.label.startsWith("Phone (no-TV)") &&
    /vote selecting|ballot/.test(screen.label),
);
const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test("there are no-TV ballots to measure", () => {
  // Both the plain and the worst-case (8 long names) ballot.
  expect(BALLOTS.length).toBeGreaterThanOrEqual(2);
});

for (const ballot of BALLOTS) {
  for (const size of SIZES) {
    test(`${ballot.id} keeps its lock-in button in view at ${size.width}x${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto(`/dev/screens?id=${encodeURIComponent(ballot.id)}`);
      await page.waitForFunction((screen) => document.body.dataset.screen === screen, ballot.id);
      await page.evaluate(() => document.fonts.ready);
      const stored = await page.evaluate(() => localStorage.getItem("opg:locale"));
      const locale: Locale = stored === "he" ? "he" : "en";
      const name = DICTIONARIES[locale].mostLikelyTo.lockInVote;
      const lockIn = page.getByRole("button", { name });
      await expect(lockIn, `${ballot.id} renders a "${name}" button`).toHaveCount(1);
      const box = await lockIn.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
      });
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(box.height);
    });
  }
}
