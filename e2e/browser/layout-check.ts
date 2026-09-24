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
 * A phase change plays `.opg-phase-enter` (packages/ui/src/styles.css): with the page's
 * `reducedMotion: "reduce"` context option (set in playwright.config.ts and harness.ts), its
 * animation-duration collapses to 0.001ms, same as every other CSS keyframe in the app, and
 * every JS-driven effect (FlipCard, Confetti, the reveal ring) reads the same
 * `prefers-reduced-motion` media feature and skips its animation outright. Nothing in the app
 * today uses the slower `.opg-motion-fade` exception (styles.css keeps that one running for
 * 200ms on purpose, for a case no current screen exercises), so there is no real transition
 * left to wait out. This is only a settle margin for the one animation frame it still takes a
 * collapsed-to-near-zero animation to apply its end state and for layout to reflow after that —
 * the same order of margin layout.spec.ts gives its own already-settled fixtures.
 */
const SETTLE_MS = 80;

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
export async function assertLayout(page: Page, surface: Surface, label: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await ensureInjected(page);
  const violations = await page.evaluate(
    (limits) => window.opgLayout?.collectViolations(limits) ?? [],
    LIMITS[surface],
  );
  expect(violations, `${label}:\n${report(violations)}`).toEqual([]);
}
