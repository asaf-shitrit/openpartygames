// Two previews that claim different things must not render the same screen.
//
// Every other suite in this folder measures a screen against the invariants. None of them can
// tell whether the screen it measured is the screen the preview promised — and for a while,
// several were not. Six Most Likely To previews labelled "reveal matched", "reveal missed",
// "reveal tie", "reveal split", "reveal picked" and "reveal sat out" all rendered one identical
// "Eyes on the TV — the votes are in…" card, so the layout suite measured that placeholder six
// times and never once measured a real result card. Doodle Bluff and Real or Nah had the same
// thing on four previews each.
//
// The cause is shared and easy to reintroduce. A reveal is a timed ceremony: `useMoment` plays
// it out from the phase start. The dev gallery freezes the clock so a measurement cannot race a
// ticking timer, and `timingOf` (apps/web/src/dev/screens.ts) anchors that frozen clock at
// `game.timerStartedAt`. A fixture that also sets `timerStartedAt` therefore pins the clock to
// the exact instant the ceremony begins, and `elapsed` comes out as 0 every time — the intro
// beat, forever, whatever the label says.
//
// Checking for that specific bug would mean hardcoding teaser copy and going stale. This checks
// the property the bug violates instead: distinct labels, distinct pixels. It is agnostic about
// why two screens collided, so it also catches a fixture copy-pasted without editing its data,
// an `id` wired to the wrong component, and a worst case whose stress content never reaches the
// screen — the whole family, not one member of it.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { SCREENS } from "../../apps/web/src/dev/screens";
import type { ScreenCase } from "../../apps/web/src/dev/screens";
import { expectScreenUp } from "./screen-ready";

/** Phone and TV previews are sized the way the other suites size them. */
const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };

const GAME_IDS = [...new Set(SCREENS.map((screen) => screen.gameId))];

/**
 * What a preview actually puts on the screen. Text only, whitespace collapsed: two cards that
 * differ by a tilt or a sticker are the same screen for this purpose, while two that say
 * different words are not. A drawing-only screen would signature as empty, so the count of
 * graphics goes in too, keeping two different doodles apart.
 */
function signatureOf(): string {
  const root = document.querySelector("#root");
  const text = (root instanceof HTMLElement ? root.innerText : "").replace(/\s+/g, " ").trim();
  const graphics = document.querySelectorAll("#root svg, #root canvas, #root img").length;
  return `${graphics}|${text}`;
}

async function signatureFor(page: Page, screen: ScreenCase): Promise<string> {
  const size = screen.surface === "host" ? TV : PHONE;
  await page.setViewportSize(size);
  await page.goto(`/dev/screens?id=${encodeURIComponent(screen.id)}`);
  await page.waitForFunction((id) => document.body.dataset.screen === id, screen.id, {
    timeout: 15_000,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(60);
  await expectScreenUp(page, screen.id);
  return page.evaluate(signatureOf);
}

/**
 * One readable line per collision, rather than the colliding `ScreenCase` objects. A failed
 * `toEqual` prints both sides in full, and a ScreenCase carries the fixture's whole `view` — so
 * asserting on the objects buries the four ids that matter under a few hundred lines of game
 * state. Strings keep the diff the size of the problem.
 */
function collisionsIn(seen: Map<string, ScreenCase[]>): string[] {
  const found: string[] = [];
  for (const [signature, screens] of seen) {
    if (screens.length < 2) continue;
    const ids = screens.map((screen) => `${screen.id} "${screen.label}"`).join("\n      ");
    const rendered = signature.split("|").slice(1).join("|").slice(0, 140);
    found.push(`these render the same screen:\n      ${ids}\n    rendering: "${rendered}"`);
  }
  return found;
}

// One test per game, so a failure names the game and lists every screen that collided rather
// than stopping at the first pair.
for (const gameId of GAME_IDS) {
  const screens = SCREENS.filter((screen) => screen.gameId === gameId);
  if (screens.length < 2) continue;

  test(`${gameId}: every preview renders something of its own`, async ({ page }) => {
    // Sequential on purpose, and reduced rather than looped: one page visits one screen at a
    // time, so there is nothing to parallelise without opening a browser context per preview.
    // The same shape the Worker uses to run room effects in order.
    const seen = new Map<string, ScreenCase[]>();
    await screens.reduce(async (previous, screen) => {
      await previous;
      const signature = await signatureFor(page, screen);
      const bucket = seen.get(signature);
      if (bucket) bucket.push(screen);
      else seen.set(signature, [screen]);
    }, Promise.resolve());

    expect(
      collisionsIn(seen),
      `${gameId} has previews that promise different screens and render the same one.\n` +
        `A timed screen is the usual cause: a fixture that sets \`timerStartedAt\` pins the\n` +
        `gallery's frozen clock to the phase start, so the ceremony never advances past its\n` +
        `first beat. See the note at the top of this file.`,
    ).toEqual([]);
  });
}
