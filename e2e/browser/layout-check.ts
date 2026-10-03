// Layout invariants, checked against real play instead of a settled preview fixture.
//
// e2e/layout/ renders every game screen from preview.ts fixtures, one at a time, motion
// reduced, and holds each to invariants.js. That misses states no fixture produces: a phone
// mid-turn while another player's turn still shows, a reconnect overlay over game content, a
// phase that just replaced another. This module runs the same invariants.js against a live
// page, at a moment a spec has already waited for.
//
// invariants.js is owned by another agent's work (e2e/layout/); it is only read here, never
// edited.
import { expect, type Locator, type Page } from "@playwright/test";
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
    opgLayout?: { collectViolations: (limits: Limits) => Violation[] };
  }
}

export type Surface = "phone" | "tv";

/** Same floors e2e/layout/layout.spec.ts holds every fixture to. */
const LIMITS = {
  phone: { minFontSize: 16, minTapTarget: 44 },
  tv: { minFontSize: 28, minTapTarget: 0 },
} satisfies Record<Surface, Limits>;

export const INVARIANTS_PATH = fileURLToPath(new URL("../layout/invariants.js", import.meta.url));

/**
 * How long to let the page settle before measuring.
 *
 * Most of the app's motion really is gone under the `reducedMotion: "reduce"` context option
 * set in playwright.config.ts and harness.ts: every CSS keyframe collapses to 0.001ms and the
 * JS-driven effects (Confetti, the reveal ring) skip themselves outright. FlipCard is the
 * exception, and it is the one that matters here: reduced motion does not remove its flip, it
 * swaps it for a 200ms opacity crossfade (CROSSFADE_DURATION_MS in packages/ui/src/fx/
 * FlipCard.tsx). Measure inside that window and the card is painted by neither face, so a hit
 * test at its centre falls through to an ancestor and reports the card as covered by its own
 * wrapper — while a screenshot taken a moment later shows a perfectly normal screen, which is
 * what makes this so confusing to chase.
 *
 * So this sits above that crossfade, not merely above the collapsed keyframes.
 */
const SETTLE_MS = 250;

/** Time between the two scans, so a second opinion samples a different frame than the first. */
const RESCAN_GAP_MS = 120;

function report(violations: Violation[]): string {
  return violations
    .map(
      (found) =>
        `  ${found.rule}: ${found.detail}\n    at ${found.path}${found.text ? ` — "${found.text}"` : ""}`,
    )
    .join("\n");
}

/** Injects invariants.js if this page does not already carry it — a fresh navigation or a
 * reload that happened before addInitScript was registered on this context. */
async function ensureInjected(page: Page): Promise<void> {
  const present = await page.evaluate(() => "opgLayout" in window);
  if (!present) await page.addScriptTag({ path: INVARIANTS_PATH });
}

/**
 * Holds `page` to the layout invariants right now. Call this only after the spec's own wait
 * for the phase's content has resolved (a `getByText`/`getByTestId` assertion, same as every
 * spec here already does before acting) — that wait is what makes the phase's real content
 * present, and `SETTLE_MS` is what makes it done moving.
 *
 * `label` should say what phase/page this is, so a failure names the moment, not just the URL.
 */
/** Identity of a violation across two scans: the same rule on the same element. Pixel figures
 * in `detail` shift by a fraction between frames, so they are not part of it. */
function identity(found: Violation): string {
  return `${found.rule}|${found.path}`;
}

/**
 * Scans, and if anything is wrong, scans again a moment later and keeps only what both saw.
 *
 * A live page is not a fixture: a phase can arrive while the scan walks the DOM, and a scan
 * that trips over an element being replaced mid-walk reports a control as covered by whatever
 * now sits at its centre. That is an artifact of measuring a moving page, not a bug a player
 * could meet. A real layout bug is still there a moment later; a half-applied phase change is
 * not — which is why the two scans are deliberately spaced rather than back to back.
 *
 * The second scan only runs when the first found something, so a clean page pays nothing.
 */
async function stableViolations(page: Page, surface: Surface): Promise<Violation[]> {
  const first = await page.evaluate(
    (limits) => window.opgLayout?.collectViolations(limits) ?? [],
    LIMITS[surface],
  );
  if (first.length === 0) return [];
  await page.waitForTimeout(RESCAN_GAP_MS);
  const second = await page.evaluate(
    (limits) => window.opgLayout?.collectViolations(limits) ?? [],
    LIMITS[surface],
  );
  const seenAgain = new Set(second.map(identity));
  return first.filter((found) => seenAgain.has(identity(found)));
}


/**
 * Words that are in the page but clipped out of sight: every pixel of the text lies outside
 * an ancestor that clips (`overflow: hidden` or `clip`) and cannot scroll. This is the shape
 * of the bug where a game's whole TV body collapsed to zero height under its frame: every
 * element was "visible" to Playwright and to the invariants, and nothing was on screen.
 *
 * Headings are held to a stricter test as well, a hit test at their centre, since a screen
 * with its heading gone is a screen nobody can read however the rest is laid out.
 */
async function clippedAway(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const clips = (element: Element): boolean => {
      const { overflowX, overflowY } = getComputedStyle(element);
      return [overflowX, overflowY].some((value) => value === "hidden" || value === "clip");
    };
    const outside = (inner: DOMRect, outer: DOMRect): boolean =>
      inner.right <= outer.left ||
      inner.left >= outer.right ||
      inner.bottom <= outer.top ||
      inner.top >= outer.bottom;
    const clippedBy = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      for (let up = element.parentElement; up !== null; up = up.parentElement) {
        if (clips(up) && outside(rect, up.getBoundingClientRect())) return true;
      }
      return false;
    };
    const stuck = (element: Element): boolean => {
      for (let up: Element | null = element; up !== null; up = up.parentElement) {
        const { position } = getComputedStyle(up);
        if (position === "fixed" || position === "sticky") return true;
      }
      return false;
    };
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (element.children.length > 0) continue;
      const text = (element.textContent ?? "").trim();
      if (text === "") continue;
      const rect = element.getBoundingClientRect();
      // Screen-reader-only text is a 1px box on purpose.
      if (rect.width < 4 || rect.height < 4) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      if (element.closest("[aria-hidden='true'], [hidden]") !== null) continue;
      if (clippedBy(element)) out.push(`clipped away: "${text.slice(0, 40)}"`);
    }
    for (const heading of Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))) {
      const rect = heading.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;
      if (getComputedStyle(heading).opacity === "0") continue;
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      // Below the fold of a page that scrolls is not clipped, and neither is what slides
      // under a sticky footer or banner: both are the page doing its job.
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && stuck(hit)) continue;
      if (hit === null || !(heading.contains(hit) || hit.contains(heading))) {
        out.push(`heading not painted: "${(heading.textContent ?? "").trim().slice(0, 40)}"`);
      }
    }
    return out;
  });
}

export async function assertLayout(page: Page, surface: Surface, label: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await ensureInjected(page);
  const violations = await stableViolations(page, surface);
  expect(violations, `${label}:\n${report(violations)}`).toEqual([]);
  expect(await clippedAway(page), `${label}: content on the page but not on screen`).toEqual([]);
}

/**
 * Asserts `locator` is actually painted where a player would see it, not merely "visible".
 *
 * Playwright's own visibility check counts an element with a size and no `visibility: hidden`;
 * an element whose ancestor collapsed to zero height under `overflow: hidden` has both and is
 * still not on screen. That is how the TV's whole Doodle Bluff phase body once went missing
 * with every other assertion green. A hit test at the element's centre finds out: whatever
 * is really painted there must be the element, or something inside it.
 */
export async function expectPainted(locator: Locator, label: string): Promise<void> {
  await expect(locator, `${label} is in the page`).toBeVisible();
  const painted = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && element.contains(hit);
  });
  expect(painted, `${label} is painted on screen, not clipped away by a collapsed ancestor`).toBe(true);
}

/**
 * Text and controls the reconnect banner sits on top of, found by hit-testing: an element is
 * covered when the banner is what the browser would hand a tap at its centre, ignoring the
 * banner's own `pointer-events: none` by comparing rectangles instead.
 */
export async function coveredByBanner(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const banner = Array.from(document.querySelectorAll("output")).find((o) => /Reconnecting/.test(o.textContent ?? "")) ?? null;
    if (banner === null) return ["no banner on the page"];
    const box = banner.getBoundingClientRect();
    const covered: string[] = [];
    for (const element of Array.from(document.querySelectorAll("body *"))) {
      if (banner.contains(element)) continue;
      const isControl = element.matches("button, a, input, textarea, [role=button]");
      const isText = element.children.length === 0 && (element.textContent ?? "").trim() !== "";
      if (!isControl && !isText) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const overlaps =
        rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
      if (overlaps) covered.push((element.textContent ?? element.tagName).trim().slice(0, 40));
    }
    return covered;
  });
}
