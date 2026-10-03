// The main action of a phone screen must be on screen without scrolling.
//
// A no-TV Most Likely To ballot stacks the staged prompt above the candidate list, so the page
// scrolls, and "Lock in vote" used to sit past the bottom edge: a player who picked a name had to
// scroll to find the button that sends it. The Doodle Bluff pad has the same shape: a square
// canvas as wide as the phone pushes "I'm done" off a short screen. No layout invariant objected,
// because a scrolling page is allowed to run long. This asks the narrower question: at rest, is
// the main action fully inside the viewport?
//
// Screens are chosen by what they are (a phone screen of this game and kind), not by preview
// index, and the button is found by its accessible name in the locale under test. If either goes
// missing the test fails rather than quietly measuring some other screen.
import { expect, test } from "@playwright/test";
import { DICTIONARIES } from "../../packages/i18n/src/dictionaries";
import type { Dictionary } from "../../packages/i18n/src/dictionary";
import type { Locale } from "../../packages/i18n/src/locale";
import { SCREENS } from "../../apps/web/src/dev/screens";
import type { ScreenCase } from "../../apps/web/src/dev/screens";

interface PrimaryAction {
  /** What the screens are, for the test titles. */
  what: string;
  gameId: string;
  /** Picks the screens out of the gallery by label. */
  matches: (label: string) => boolean;
  /** The action's accessible name in a locale. */
  name: (dictionary: Dictionary) => string;
  /** How many matching screens there must be, so a renamed preview fails loudly. */
  atLeast: number;
}

const ACTIONS: PrimaryAction[] = [
  {
    what: "no-TV ballot",
    gameId: "most-likely-to",
    matches: (label) => label.startsWith("Phone (no-TV)") && /vote selecting|ballot/.test(label),
    name: (dictionary) => dictionary.mostLikelyTo.lockInVote,
    atLeast: 2,
  },
  {
    what: "drawing pad",
    gameId: "doodle-bluff",
    matches: (label) => /^Phone( \(no-TV\))?: Dov drawing$/.test(label),
    name: (dictionary) => dictionary.doodleBluff.imDoneWithThisOne,
    atLeast: 2,
  },
];

const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

function screensFor(action: PrimaryAction): ScreenCase[] {
  return SCREENS.filter(
    (screen) =>
      screen.gameId === action.gameId && screen.surface === "phone" && action.matches(screen.label),
  );
}

for (const action of ACTIONS) {
  test(`there are ${action.what}s to measure`, () => {
    expect(screensFor(action).length).toBeGreaterThanOrEqual(action.atLeast);
  });

  for (const screen of screensFor(action)) {
    for (const size of SIZES) {
      test(`${screen.id} keeps its primary action in view at ${size.width}x${size.height}`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto(`/dev/screens?id=${encodeURIComponent(screen.id)}`);
        await page.waitForFunction((id) => document.body.dataset.screen === id, screen.id);
        await page.evaluate(() => document.fonts.ready);
        const stored = await page.evaluate(() => localStorage.getItem("opg:locale"));
        const locale: Locale = stored === "he" ? "he" : "en";
        const name = action.name(DICTIONARIES[locale]);
        const button = page.getByRole("button", { name });
        await expect(button, `${screen.id} renders a "${name}" button`).toHaveCount(1);
        const box = await button.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, height: window.innerHeight };
        });
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(box.height);
      });
    }
  }
}
