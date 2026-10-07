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
import { SCREENS } from "../../apps/web/src/dev/screens";

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
    opgStage: { collectStageViolations: () => Violation[] };
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

/** The first TV screen in the gallery; this suite only needs a stage to hang a stack inside. */
function firstHostScreen(): string {
  const host = SCREENS.find((screen) => screen.surface === "host");
  if (host === undefined) throw new Error("blame.spec: no host screen in the gallery");
  return host.id;
}

/**
 * A table whose rows run off the bottom of the stage, for the reason real ones do: not one
 * tall thing, but eight rows that are each one line taller than they look, because a single
 * cell in each wraps. The row that lands below the edge is the symptom; the wrapping cell is
 * what somebody has to change.
 *
 * Modelled on the Real or Nah reveal (#88), where exactly this shape cost four full runs of
 * the suite to diagnose — the violations named the row, and the author's name in a too-narrow
 * column was setting the height of all eight.
 */
function buildWrappingTable(): void {
  const stage = document.querySelector(".opg-grid-tv");
  if (stage === null) throw new Error("no stage on this page");
  const table = document.createElement("div");
  table.setAttribute("data-testid", "lies-table");
  table.style.position = "absolute";
  table.style.top = "400px";
  table.style.insetInlineStart = "0";
  table.style.width = "900px";
  table.style.display = "flex";
  table.style.flexDirection = "column";
  table.style.gap = "10px";
  for (let index = 0; index < 10; index += 1) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "16px";
    const lie = document.createElement("div");
    lie.style.fontSize = "30px";
    lie.textContent = `lie number ${index}`;
    const author = document.createElement("div");
    author.setAttribute("data-testid", "author-cell");
    author.style.fontSize = "30px";
    // The whole point: too narrow for the name, so it takes two lines and sets the row.
    author.style.width = "120px";
    author.textContent = "Wilhelmina Abernathy";
    row.append(lie, author);
    table.append(row);
  }
  stage.append(table);
}

/** Widens every author cell so the name fits one line — the fix the blame points at. */
function unwrapAuthorCells(): void {
  for (const cell of document.querySelectorAll<HTMLElement>('[data-testid="author-cell"]')) {
    cell.style.width = "400px";
  }
}

function stageViolations(): Violation[] {
  return window.opgStage.collectStageViolations();
}

test.describe("offstage-y", () => {
  test("names the cell that set the height, not just the row that fell off", async ({ page }) => {
    const screenId = firstHostScreen();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript({ path: INVARIANTS_PATH });
    await page.goto(`/dev/screens?id=${encodeURIComponent(screenId)}`);
    await page.waitForFunction((id) => document.body.dataset.screen === id, screenId, {
      timeout: 15_000,
    });

    // Clean first, so the failure below is the table and not the screen under it.
    expect(await page.evaluate(stageViolations)).toEqual([]);

    await page.evaluate(buildWrappingTable);
    const found = await page.evaluate(stageViolations);

    expect(found.length).toBeGreaterThan(0);
    const detail = found[0]?.detail ?? "";
    // The measurement the rule always gave (either wording: cut off, or entirely below).
    expect(detail).toContain("1080px bottom edge");
    // The lead it did not: how many things are stacked, and which box sets their height.
    expect(detail).toContain("stacks 10 items");
    expect(detail).toContain("author-cell");
    expect(detail).toContain("Wilhelmina Abernathy");

    // And it named the real lever: widening that cell, and nothing else, settles the stage.
    await page.evaluate(unwrapAuthorCells);
    expect(await page.evaluate(stageViolations)).toEqual([]);
  });
});
