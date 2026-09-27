// Accessibility passes over every game screen, run through the same dev gallery as
// layout.spec.ts but as their own project: none of them depend on the three phone widths the
// way layout does, so running them at every size would only repeat the same answer for more
// cost. Colour and names do not move with width either, so each runs once per surface, in
// English only — a missing aria-label or a failing ratio is failing or not regardless of which
// language sits next to it.
//
// A third pass, text at 200%, reuses the layout invariants themselves, zoomed. It ran parked
// behind describe.skip while the repair it asked for was made (issue #31); it is live now.
//
// pnpm e2e:layout runs this project alongside "en" and "he"; OPG_LAYOUT_PORT picks the port.
import { expect, test } from "@playwright/test";
import { expectScreenUp } from "./screen-ready";
import type { Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { SCREENS } from "../../apps/web/src/dev/screens";
import type { ScreenCase } from "../../apps/web/src/dev/screens";

interface Limits {
  minFontSize: number;
  minTapTarget: number;
}

interface Violation {
  rule: string;
  detail: string;
  path: string;
  text: string;
}

interface ContrastResult {
  violations: Violation[];
  checked: number;
  skipped: number;
}

declare global {
  interface Window {
    opgLayout: { collectViolations: (limits: Limits) => Violation[] };
    opgA11y: {
      collectNameViolations: () => Violation[];
      collectContrastViolations: () => ContrastResult;
    };
  }
}

const PHONE_LIMITS: Limits = { minFontSize: 16, minTapTarget: 44 };
const TV_LIMITS: Limits = { minFontSize: 28, minTapTarget: 0 };

interface Viewport {
  name: string;
  width: number;
  height: number;
  surface: ScreenCase["surface"];
  limits: Limits;
}

/** One representative phone size, plus the TV. Widths beyond this are layout.spec.ts's job. */
const VIEWPORTS: Viewport[] = [
  { name: "phone-390", width: 390, height: 844, surface: "phone", limits: PHONE_LIMITS },
  { name: "tv", width: 1920, height: 1080, surface: "host", limits: TV_LIMITS },
];

/** The zoom pass walks phones only — see the note beside the pass itself for why not the TV. */
const ZOOM_VIEWPORTS: Viewport[] = VIEWPORTS.filter((viewport) => viewport.surface === "phone");


const INVARIANTS_PATH = fileURLToPath(new URL("./invariants.js", import.meta.url));

const HEBREW_STORAGE = [{ name: "opg:locale", value: "he" }];

/**
 * Known, narrow gaps the contrast pass does not resolve — each one a design call, not a bug in
 * the rule. Kept as a short, explicit list (rather than weakening the rule or skipping the
 * whole project) so every other screen keeps the same conservative check with the same guard
 * against silently skipping everything.
 *
 * Each entry costs more than it looks. The skip is per test and a test is a whole screen, so
 * waiving one element's colour also stops the pass looking at every other element beside it: a
 * second, unrelated regression on a waived screen would go unreported. An entry therefore stays
 * only while its cause is genuinely unresolved, and comes out the moment it is. Two entries for
 * --opg-marker on body text stood here until --opg-marker-text (#c73328, 5.04:1 on paper)
 * shipped and the screens moved to it.
 */
const CONTRAST_KNOWN_GAPS = {
  "doodle-bluff/16":
    "every text-bearing element on this screen sits directly on the paper background's " +
    "decorative grid image (styles.css's repeating linear-gradient hairlines), and the rule " +
    "treats any background carrying an image as unresolvable rather than guess at it — so it " +
    "skips every candidate here and trips the can't-check-nothing guard. Whether that hairline " +
    "grid should count as opaque for contrast purposes, app-wide, is a call for whoever owns " +
    "the paper texture.",
  "doodle-bluff/25":
    "same cause as doodle-bluff/16 — its worst-case fixture is the same no-TV reveal layout, " +
    "text straight over the grid background with nothing solid behind it.",
} satisfies Record<string, string>;

/**
 * The screens a viewport answers for: a phone size gets the phone screens, the TV the host
 * ones. Shared by both passes below so neither can drift onto the other's list.
 */
function screensFor(viewport: Viewport): ScreenCase[] {
  return SCREENS.filter((screen) => screen.surface === viewport.surface);
}

function report(violations: Violation[]): string {
  return violations
    .map(
      (found) =>
        `  ${found.rule}: ${found.detail}\n    at ${found.path}${found.text ? ` — "${found.text}"` : ""}`,
    )
    .join("\n");
}

async function openScreen(
  page: Page,
  viewport: Viewport,
  screen: ScreenCase,
  locale: "en" | "he",
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.addInitScript({ path: INVARIANTS_PATH });
  if (locale === "he") {
    await page.addInitScript((entries) => {
      for (const entry of entries) localStorage.setItem(entry.name, entry.value);
    }, HEBREW_STORAGE);
  }
  await page.goto(`/dev/screens?id=${encodeURIComponent(screen.id)}`);
  await page.waitForFunction((id) => document.body.dataset.screen === id, screen.id, {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
  await expectScreenUp(page, screen.id);
}

// The zoom pass alone. It has its own loop because it is the only pass here that is about a
// person's browser settings rather than the pixels on the screen, and so the only one the TV
// is genuinely exempt from — see the note inside. Contrast and accessible names follow in
// their own loop over every viewport; keeping the three under one head is what quietly took
// the TV out of all of them once.
for (const viewport of ZOOM_VIEWPORTS) {
  const screens = screensFor(viewport);
  if (screens.length === 0) continue;

  // What this pass is worth, and where it stops.
  //
  // `document.documentElement.style.zoom` reproduces the part of browser zoom that breaks
  // layouts — every box and font doubles while the screen does not — but it is not the whole of
  // it, and the difference matters to anyone fixing a failure here. Under a real browser zoom
  // the CSS viewport itself shrinks, so media queries fire and `vh` tracks it. Under this one
  // they do not: `matchMedia("(max-height: 600px)")` is false at 200% and `100vh` doubles along
  // with everything else (measured, not assumed). A repair keyed to a media query therefore
  // fixes the product and leaves this pass red, which reads like a broken fix. Reach instead
  // for what is true in both worlds — wrapping, minimum rather than fixed sizes, `min-width: 0`
  // — or measure the viewport in JS, where `getBoundingClientRect` and `window.innerHeight` are
  // in the same (zoomed) space and a ratio between them means the same thing either way.
  //
  // The TV is deliberately not among ZOOM_VIEWPORTS. The host stage is a fixed 1920x1080
  // canvas scaled to whatever screen it is cast to, shown across a room, and driven by nobody's
  // personal browser settings — it is a presentation surface, not a page someone zooms, so
  // 1.4.4 does not apply to it. That is a decision, recorded here and in the README, not an
  // omission: intent/0001-platform-mvp.md commits to AA contrast on phones, and this is the
  // boundary of that commitment.
  test.describe(`text at 200% — ${viewport.name}`, () => {
    for (const locale of ["en", "he"] as const) {
      for (const screen of screens) {
        test(`${screen.id} "${screen.label}" (${locale})`, async ({ page }) => {
          await openScreen(page, viewport, screen, locale);
          // WCAG 1.4.4: resizing text to 200% must not lose content. This codebase sizes type
          // in raw px (no root-relative units to scale), so a root font-size change would move
          // nothing; a CSS zoom reproduces what a person actually gets from their browser's
          // text/page zoom — every box and font doubles while the layout viewport (what
          // window.innerWidth reports, and what the existing invariants measure against) does
          // not, so anything that no longer fits shows up exactly as the plain-size invariants
          // already know how to report.
          await page.evaluate(() => {
            document.documentElement.style.zoom = "200%";
          });
          await page.waitForTimeout(60);
          const violations = await page.evaluate(
            (limits) => window.opgLayout.collectViolations(limits),
            viewport.limits,
          );
          expect(
            violations,
            `${screen.id} at ${viewport.name} 200% (${locale}):\n${report(violations)}`,
          ).toEqual([]);
        });
      }
    }
  });
}

// Colour and accessible names, on every surface. A ratio and a missing label are properties of
// the markup, not of the width it is measured at, so one pass per surface is the whole of it —
// but the TV is a surface, and a heading nobody across the room can read off it is as much a
// failure there as on a phone.
for (const viewport of VIEWPORTS) {
  const screens = screensFor(viewport);
  if (screens.length === 0) continue;

  test.describe(`contrast — ${viewport.name}`, () => {
    for (const screen of screens) {
      test(`${screen.id} "${screen.label}"`, async ({ page }) => {
        const knownGap = CONTRAST_KNOWN_GAPS[screen.id];
        test.skip(knownGap !== undefined, knownGap);
        await openScreen(page, viewport, screen, "en");
        const result = await page.evaluate(() => window.opgA11y.collectContrastViolations());
        // If every element on a screen got skipped, the rule checked nothing there and would
        // pass no matter what colours were used — that is a broken rule, not a clean screen.
        expect(
          result.checked > 0 || result.skipped === 0,
          `${screen.id} at ${viewport.name}: contrast rule skipped every one of ${result.skipped} candidate elements — it is not checking anything`,
        ).toBe(true);
        expect(
          result.violations,
          `${screen.id} at ${viewport.name}:\n${report(result.violations)}`,
        ).toEqual([]);
      });
    }
  });

  test.describe(`accessible names — ${viewport.name}`, () => {
    for (const screen of screens) {
      test(`${screen.id} "${screen.label}"`, async ({ page }) => {
        await openScreen(page, viewport, screen, "en");
        const violations = await page.evaluate(() => window.opgA11y.collectNameViolations());
        expect(
          violations,
          `${screen.id} at ${viewport.name}:\n${report(violations)}`,
        ).toEqual([]);
      });
    }
  });
}
