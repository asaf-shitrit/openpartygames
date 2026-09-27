// Did the screen under test actually come up?
//
// Every pass in this folder needs the same guarantee before it measures anything: that the
// gallery rendered the real screen, and not a blank page or its own "no such screen" fallback.
// Measuring a page that never came up proves nothing, and — worse — it passes, because an empty
// page violates no invariant.
//
// This used to be a count: at least ten elements under `#root`. That number was calibrated on
// whichever screens happened to be busy, and it quietly failed the moment a screen was
// legitimately spare. The settled results card — a rank, a score and a row of award stickers —
// renders nine, so the first fixture ever to reach that beat was reported as "did not come up"
// while rendering exactly what it was supposed to. A threshold a correct screen can fall under
// is not a liveness check, it is a second layout rule nobody wrote down.
//
// So ask the two questions that actually distinguish a live screen from a dead one, neither of
// which has a magic number in it: the gallery is not showing its fallback, and something was
// painted.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

interface Liveness {
  /** The fallback's own text, or null when the gallery rendered a real screen. */
  missing: string | null;
  /** Text the screen renders, trimmed — empty on a screen that paints only graphics. */
  text: string;
  /** Drawings, avatars and stamps are SVG or canvas, so a wordless screen can still be alive. */
  graphics: number;
}

/**
 * Runs inside the page, so it closes over nothing: the `screen-missing` test id is written out
 * here rather than imported, because only this function's source crosses into the browser.
 * ScreenGallery's `Missing` component is the other half of that contract.
 */
function livenessOf(): Liveness {
  const fallback = document.querySelector('[data-testid="screen-missing"]');
  const root = document.querySelector("#root");
  return {
    missing: fallback === null ? null : (fallback.textContent ?? "").trim(),
    text: (root instanceof HTMLElement ? root.innerText : "").trim(),
    graphics: document.querySelectorAll("#root svg, #root canvas, #root img").length,
  };
}

/**
 * Fails unless the gallery rendered the real screen. The caller has already waited for
 * `body.dataset.screen`, which says the route mounted — this says the mount produced a screen.
 */
export async function expectScreenUp(page: Page, screenId: string): Promise<void> {
  const live = await page.evaluate(livenessOf);
  expect(
    live.missing,
    `${screenId} rendered the gallery's fallback instead of a screen: "${live.missing ?? ""}"`,
  ).toBeNull();
  expect(
    live.text !== "" || live.graphics > 0,
    `${screenId} did not come up: nothing under #root renders text or graphics`,
  ).toBe(true);
}
