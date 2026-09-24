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
import { expect, type Page } from "@playwright/test";
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

export async function assertLayout(page: Page, surface: Surface, label: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await ensureInjected(page);
  const violations = await stableViolations(page, surface);
  expect(violations, `${label}:\n${report(violations)}`).toEqual([]);
}
