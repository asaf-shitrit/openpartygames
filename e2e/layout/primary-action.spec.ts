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
import type { Locator, Page } from "@playwright/test";
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
  /** Other controls that must be in view with it, by role and accessible name. */
  alongside?: (dictionary: Dictionary) => { role: "button" | "radiogroup"; name: string }[];
  /** A canvas that must be fully in view too (the drawing pad). */
  canvas?: boolean;
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
    // A player draws with these: undo a slip, wipe the page, pick an ink. None may need a scroll.
    alongside: (dictionary) => [
      { role: "button", name: dictionary.kit.doodle.undo },
      { role: "button", name: dictionary.kit.doodle.clear },
      { role: "radiogroup", name: dictionary.kit.doodle.penColorGroup },
    ],
    canvas: true,
    atLeast: 2,
  },
];

const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

/** Smallest canvas a finger can still draw on: what a 360x640 no-TV phone leaves under its stage. */
const MIN_CANVAS = 140;

async function inViewport(locator: Locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: window.innerHeight,
      // Whatever is drawn at its centre and just above its bottom edge is the thing itself (or
      // part of it), not a bar over it: a pad's bottom rows sliding under a pinned bar still
      // sit inside the viewport.
      reachable: [
        [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
        [(rect.left + rect.right) / 2, rect.bottom - 4],
      ].every(([x, y]) => {
        const hit = document.elementFromPoint(x ?? 0, y ?? 0);
        return hit !== null && el.contains(hit);
      }),
    };
  });
}

async function expectInView(
  page: Page,
  screenId: string,
  target: { role: "button" | "radiogroup"; name: string },
): Promise<void> {
  const found = page.getByRole(target.role, { name: target.name, exact: true });
  await expect(found, `${screenId} renders "${target.name}"`).toHaveCount(1);
  const box = await inViewport(found);
  expect(box.top, `${target.name} top`).toBeGreaterThanOrEqual(0);
  expect(box.bottom, `${target.name} bottom`).toBeLessThanOrEqual(box.height);
  expect(box.reachable, `${target.name} is not covered`).toBe(true);
}

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
        const targets = [
          { role: "button" as const, name },
          ...(action.alongside?.(DICTIONARIES[locale]) ?? []),
        ];
        await Promise.all(targets.map((target) => expectInView(page, screen.id, target)));
        if (action.canvas === true) {
          const canvas = page.locator("canvas:visible");
          await expect(canvas, `${screen.id} renders one visible canvas`).toHaveCount(1);
          const box = await inViewport(canvas);
          expect(box.top, "canvas top").toBeGreaterThanOrEqual(0);
          expect(box.bottom, "canvas bottom").toBeLessThanOrEqual(box.height);
          // Whole canvas, and big enough to draw on.
          expect(box.width, "canvas width").toBeGreaterThanOrEqual(MIN_CANVAS);
          expect(box.bottom - box.top, "canvas height").toBeGreaterThanOrEqual(MIN_CANVAS);
          expect(box.reachable, "canvas is not covered").toBe(true);
          expect(box.left, "canvas left").toBeGreaterThanOrEqual(0);
          expect(box.right, "canvas right").toBeLessThanOrEqual(size.width);
        }
      });
    }
  }
}
