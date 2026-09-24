// If Permanent Marker or Atkinson Hyperlegible never arrives, the browser falls back to
// whatever --opg-font-marker / --opg-font-body list next: "Marker Felt", "Comic Sans MS",
// cursive for the English marker stack, "Secular One", "Arial Hebrew", system-ui for Hebrew
// (packages/ui/src/styles.css). Fallback fonts have different metrics, so text that fits under
// the real faces can overflow under the fallback stack. layout.spec.ts always runs against the
// real fonts — Playwright fetches them like the browser would on a good connection — so it can
// never catch a fallback-only overflow. This app self-hosts its fonts (@fontsource, bundled by
// Vite) rather than linking Google Fonts directly, so "the fonts never arrive" here means the
// font *files* fail, not a stylesheet host; this blocks those, and the Google Fonts hosts too
// in case a future change links them directly, and reruns the same layout invariants everywhere
// else uses against a representative slice: one phone size, the TV, every game, in both the
// "en" and "he" projects (their fallback stacks differ, so both are worth holding to this).
//
// A full three-phone-size rerun would double the whole suite's runtime for a check whose only
// job is "does the fallback stack, not the screen, hold up" — one phone size next to the TV is
// enough to prove that without paying for it twice.
import { expect, test } from "@playwright/test";
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

declare global {
  interface Window {
    opgLayout: { collectViolations: (limits: Limits) => Violation[] };
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

const VIEWPORTS: Viewport[] = [
  { name: "phone-390", width: 390, height: 844, surface: "phone", limits: PHONE_LIMITS },
  { name: "tv", width: 1920, height: 1080, surface: "host", limits: TV_LIMITS },
];

const MIN_ELEMENTS = 10;
const INVARIANTS_PATH = fileURLToPath(new URL("./invariants.js", import.meta.url));
const FONT_FILE = /\.(woff2?|ttf|otf)(\?.*)?$/i;
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;

function report(violations: Violation[]): string {
  return violations
    .map(
      (found) =>
        `  ${found.rule}: ${found.detail}\n    at ${found.path}${found.text ? ` — "${found.text}"` : ""}`,
    )
    .join("\n");
}

for (const viewport of VIEWPORTS) {
  const screens = SCREENS.filter((screen) => screen.surface === viewport.surface);

  test.describe(`fonts blocked, ${viewport.name}`, () => {
    for (const screen of screens) {
      test(`${screen.id} "${screen.label}"`, async ({ page }) => {
        await page.route(FONT_FILE, (route) => route.abort());
        await page.route(GOOGLE_FONTS, (route) => route.abort());
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript({ path: INVARIANTS_PATH });
        await page.goto(`/dev/screens?id=${encodeURIComponent(screen.id)}`);
        await page.waitForFunction((id) => document.body.dataset.screen === id, screen.id, {
          timeout: 15_000,
        });
        // The real webfonts never arrive (blocked above), so this resolves once the browser
        // gives up on them and settles on the fallback stack — it does not hang waiting.
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(60);

        const rendered = await page.evaluate(() => document.querySelectorAll("#root *").length);
        expect(rendered, `${screen.id} did not come up`).toBeGreaterThanOrEqual(MIN_ELEMENTS);

        const violations = await page.evaluate(
          (limits) => window.opgLayout.collectViolations(limits),
          viewport.limits,
        );
        expect(
          violations,
          `${screen.id} at ${viewport.name} with fonts blocked:\n${report(violations)}`,
        ).toEqual([]);
      });
    }
  });
}
