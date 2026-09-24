// Every game screen, at every size we support, held to the layout invariants.
//
// The screens come from each game's preview.ts through the dev gallery, so this suite grows by
// itself: a new preview is a new case, and a screen with no preview is a gap to close. Each
// screen is its own test, so a failure names the screen and the size it broke at.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { SCREENS } from "../../apps/web/src/dev/screens";
import type { ScreenCase } from "../../apps/web/src/dev/screens";

interface Limits {
  /** Smallest computed font-size a text-bearing element may use. */
  minFontSize: number;
  /** Smallest side of an interactive element's box. 0 turns the rule off. */
  minTapTarget: number;
}

interface Violation {
  rule: string;
  detail: string;
  path: string;
  text: string;
}

interface Viewport {
  name: string;
  width: number;
  height: number;
  surface: ScreenCase["surface"];
  limits: Limits;
}

declare global {
  interface Window {
    opgLayout: { collectViolations: (limits: Limits) => Violation[] };
  }
}

/** The phone floors are the project's own rules, from CLAUDE.md. */
const PHONE_LIMITS: Limits = { minFontSize: 16, minTapTarget: 44 };
/** The TV is read from a sofa: a 28px floor, and nothing on it is tapped. */
const TV_LIMITS: Limits = { minFontSize: 28, minTapTarget: 0 };

/**
 * The smallest phone we support, the design reference, and a large phone. 360x780 is a small
 * modern Android: 360 CSS px is the narrowest width in real use, and phones that narrow are
 * 780+ tall today. A 640px-tall phone is a 2014 device and not a size these screens promise to
 * hold — say so here rather than letting a viewport nobody has decide the design.
 *
 * The TV viewport is the stage's own 1920x1080, so the scale is 1 and measurements are exact.
 */
const VIEWPORTS: Viewport[] = [
  { name: "phone-360", width: 360, height: 780, surface: "phone", limits: PHONE_LIMITS },
  { name: "phone-390", width: 390, height: 844, surface: "phone", limits: PHONE_LIMITS },
  { name: "phone-430", width: 430, height: 932, surface: "phone", limits: PHONE_LIMITS },
  { name: "tv", width: 1920, height: 1080, surface: "host", limits: TV_LIMITS },
];

/** Below this the page is a fallback or an error, not a screen, so measuring it proves nothing. */
const MIN_ELEMENTS = 10;

const INVARIANTS_PATH = fileURLToPath(new URL("./invariants.js", import.meta.url));

const GAME_IDS = [...new Set(SCREENS.map((screen) => screen.gameId))];

function report(violations: Violation[]): string {
  return violations
    .map(
      (found) =>
        `  ${found.rule}: ${found.detail}\n    at ${found.path}${found.text ? ` — "${found.text}"` : ""}`,
    )
    .join("\n");
}

/**
 * Sizes the viewport, loads a screen through the dev gallery and waits for it to settle. Shared
 * by every pass — the baseline size, the keyboard-shrunk size and the toolbar-shrunk size all
 * load a screen the same way and differ only in what they measure or do once it is up.
 */
async function loadScreen(
  page: Page,
  screen: ScreenCase,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  // An init script, not addScriptTag: it is re-injected on every navigation, so a
  // reload — Vite sends one whenever a source file changes mid-run — cannot leave the
  // page without the checker and turn a real measurement into a TypeError.
  await page.addInitScript({ path: INVARIANTS_PATH });
  await page.goto(`/dev/screens?id=${encodeURIComponent(screen.id)}`);
  // The route is lazy-loaded: wait for the screen itself, or a blank page gets
  // measured. Attached, not visible: behind the TV stage the body has no height.
  await page.waitForFunction((id) => document.body.dataset.screen === id, screen.id, {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  // Motion is reduced in the config; this is the last frame settling.
  await page.waitForTimeout(60);

  const rendered = await page.evaluate(() => document.querySelectorAll("#root *").length);
  expect(rendered, `${screen.id} did not come up`).toBeGreaterThanOrEqual(MIN_ELEMENTS);
}

async function violationsOf(page: Page, limits: Limits): Promise<Violation[]> {
  return page.evaluate((theLimits) => window.opgLayout.collectViolations(theLimits), limits);
}

for (const gameId of GAME_IDS) {
  for (const viewport of VIEWPORTS) {
    const screens = SCREENS.filter(
      (screen) => screen.gameId === gameId && screen.surface === viewport.surface,
    );
    if (screens.length === 0) continue;

    test.describe(`${gameId} ${viewport.surface} at ${viewport.name}`, () => {
      for (const screen of screens) {
        test(`${screen.id} "${screen.label}"`, async ({ page }) => {
          await loadScreen(page, screen, viewport.width, viewport.height);
          const violations = await violationsOf(page, viewport.limits);
          expect(violations, `${screen.id} at ${viewport.name}:\n${report(violations)}`).toEqual([]);
        });
      }
    });
  }
}

/**
 * A focusable text field, if this screen has one. Detected at runtime rather than a hardcoded
 * list, so a new input screen is covered the moment its preview exists.
 */
const TEXT_INPUT_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea';

/**
 * On-screen keyboards eat roughly half a phone's height. A screen with a text field has to
 * survive that — the player must still see what they are typing and reach the button that
 * submits it — so this focuses the field as a real keyboard would and re-measures at what is
 * left. Only screens with a detected input run: everything else is unaffected by a keyboard.
 */
const KEYBOARD_REMAINING_FRACTION = 0.5;

const PHONE_VIEWPORTS = VIEWPORTS.filter((viewport) => viewport.surface === "phone");
const PHONE_SCREENS = SCREENS.filter((screen) => screen.surface === "phone");

test.describe("behind the on-screen keyboard", () => {
  for (const viewport of PHONE_VIEWPORTS) {
    test.describe(`at ${viewport.name}`, () => {
      for (const screen of PHONE_SCREENS) {
        test(`${screen.id} "${screen.label}"`, async ({ page }) => {
          await loadScreen(page, screen, viewport.width, viewport.height);
          const input = page.locator(TEXT_INPUT_SELECTOR).first();
          test.skip(
            (await input.count()) === 0,
            `${screen.id} has no focusable text input; the keyboard never opens on it`,
          );
          await input.focus();
          const shrunk = Math.round(viewport.height * KEYBOARD_REMAINING_FRACTION);
          await page.setViewportSize({ width: viewport.width, height: shrunk });
          await page.waitForTimeout(60);

          const violations = await violationsOf(page, viewport.limits);
          expect(
            violations,
            `${screen.id} at ${viewport.name} behind the keyboard (${viewport.width}x${shrunk}):\n${report(violations)}`,
          ).toEqual([]);
        });
      }
    });
  }
});

/**
 * `PhoneScreen` sits on `100dvh` (packages/ui/src/layout.tsx), so on iOS the screen shrinks by
 * roughly 15% whenever Safari's toolbar is showing — the common case, not an edge case. Every
 * phone screen gets this pass, not only the ones built with `fit`: a screen that lets its
 * middle scroll can still pin a header or footer that assumes the full 100dvh, so the failure
 * this is meant to catch is not confined to screens that opt into clamping. Running it
 * everywhere costs nothing beyond the same measurement at a shorter height.
 */
const TOOLBAR_REMAINING_FRACTION = 0.85;

test.describe("behind the browser toolbar", () => {
  for (const viewport of PHONE_VIEWPORTS) {
    const shrunk = Math.round(viewport.height * TOOLBAR_REMAINING_FRACTION);
    test.describe(`at ${viewport.name} (${viewport.width}x${shrunk})`, () => {
      for (const screen of PHONE_SCREENS) {
        test(`${screen.id} "${screen.label}"`, async ({ page }) => {
          await loadScreen(page, screen, viewport.width, shrunk);
          const violations = await violationsOf(page, viewport.limits);
          expect(
            violations,
            `${screen.id} at ${viewport.name} with the toolbar showing (${viewport.width}x${shrunk}):\n${report(violations)}`,
          ).toEqual([]);
        });
      }
    });
  }
});
