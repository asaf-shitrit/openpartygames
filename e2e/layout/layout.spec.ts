// Every game screen, at every size we support, held to the layout invariants.
//
// The screens come from each game's preview.ts through the dev gallery, so this suite grows by
// itself: a new preview is a new case, and a screen with no preview is a gap to close. Each
// screen is its own test, so a failure names the screen and the size it broke at.
import { expect, test } from "@playwright/test";
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

for (const gameId of GAME_IDS) {
  for (const viewport of VIEWPORTS) {
    const screens = SCREENS.filter(
      (screen) => screen.gameId === gameId && screen.surface === viewport.surface,
    );
    if (screens.length === 0) continue;

    test.describe(`${gameId} ${viewport.surface} at ${viewport.name}`, () => {
      for (const screen of screens) {
        test(`${screen.id} "${screen.label}"`, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
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

          const violations = await page.evaluate(
            (limits) => window.opgLayout.collectViolations(limits),
            viewport.limits,
          );
          expect(violations, `${screen.id} at ${viewport.name}:\n${report(violations)}`).toEqual([]);
        });
      }
    });
  }
}
