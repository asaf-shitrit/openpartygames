// The sideways-scroll rule has to name the element responsible, not just the page.
//
// Every other rule reports the element it judged. `page-scrolls-sideways` reported `html` and
// two widths, which is enough when `offscreen-x` fires on the same element and names it — and
// useless in the case where this rule fires alone. That case is the common one for this design:
// `checkHorizontal` only judges elements that carry words, so a decorative overflow (a tilted
// sticker, a celebration burst, a pseudo-element) is invisible to it, and the only symptom is
// the page width.
//
// This drives that case deliberately rather than waiting for a screen to regress into it.
import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

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

const INVARIANTS_PATH = fileURLToPath(new URL("./invariants.js", import.meta.url));
const PHONE_LIMITS: Limits = { minFontSize: 16, minTapTarget: 44 };

/**
 * A wordless decorative box hung past the inline-end edge, two levels deep.
 *
 * Inline-end, not "right", and that is not tidiness: `scrollWidth` only ever grows toward the
 * inline-end side. Measured in both locales — in LTR a box 300px past the left edge leaves
 * `scrollWidth` at the viewport width, and in RTL a box past the right edge does the same. The
 * browser simply clips that side. So a test that always pushed right would pass in English and
 * quietly measure nothing in Hebrew.
 */
function hangDecorationOffTheEdge(): void {
  const host = document.querySelector("#root > *") ?? document.body;
  const rtl = getComputedStyle(document.documentElement).direction === "rtl";
  const wrap = document.createElement("div");
  wrap.setAttribute("data-testid", "burst-wrap");
  // Relative with an absolutely positioned child, so the wrapper itself has no height —
  // the shape that used to strand the search one level above the real culprit.
  wrap.style.position = "relative";
  const burst = document.createElement("div");
  burst.setAttribute("data-testid", "confetti-burst");
  burst.style.position = "absolute";
  burst.style.top = "0";
  burst.style.left = rtl ? "-300px" : `${window.innerWidth - 20}px`;
  burst.style.width = "320px";
  burst.style.height = "40px";
  burst.style.background = "#f0f";
  wrap.append(burst);
  host.append(wrap);
}

function sidewaysViolations(limits: Limits): Violation[] {
  return window.opgLayout
    .collectViolations(limits)
    .filter((each) => each.rule === "page-scrolls-sideways");
}

test.describe("page-scrolls-sideways", () => {
  test("names the decorative element that caused it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript({ path: INVARIANTS_PATH });
    await page.goto("/dev/screens?id=app/0");
    await page.waitForFunction(() => document.body.dataset.screen === "app/0", null, {
      timeout: 15_000,
    });

    // The screen is clean before anything is done to it, so the failure below is the
    // decoration and not the screen.
    expect(await page.evaluate(sidewaysViolations, PHONE_LIMITS)).toEqual([]);

    await page.evaluate(hangDecorationOffTheEdge);
    const found = await page.evaluate(sidewaysViolations, PHONE_LIMITS);

    expect(found).toHaveLength(1);
    // The point of the whole exercise: the report says which element, not just that the page
    // is too wide. Anchored on the test id so it cannot pass by naming some ancestor.
    expect(found[0]?.path).toContain("confetti-burst");
    expect(found[0]?.detail).toContain("clipping this element settles it");

    // And the element really was the cause: removing it settles the page.
    await page.evaluate(() => {
      document.querySelector('[data-testid="burst-wrap"]')?.remove();
    });
    expect(await page.evaluate(sidewaysViolations, PHONE_LIMITS)).toEqual([]);
  });
});
