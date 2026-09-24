// Pixel-comparison suite over a handful of canonical screens.
//
// The layout suite (layout.spec.ts) proves a screen is readable and tappable — no text off the
// edge, no covered button. It cannot see a screen that fits and is still wrong: a sticker over
// a face, a doodle rendering blank, a reveal's colour going missing, an avatar not drawing. That
// is what this suite is for, and it is the only thing it is for. Six screens, not sixty: one per
// game plus the moments where a visual break would hurt most — the two Doodle Bluff galleries,
// where sixteen drawings render as raster images and a blank canvas is easy to ship by accident,
// and three reveal screens, where colour alone (never colour alone in the copy, but the pixels
// still have to be right) carries who was caught, who lied, who guessed right.
//
//   pnpm e2e:visual            — run against the committed baselines
//   pnpm e2e:visual:update     — regenerate baselines from what's on screen right now
//
// ## Updating a baseline
//
// Only ever run the update script when the change is an intended design change you've looked at
// with your own eyes (`pnpm dev`, open the screen, compare with the design file). Then:
//
//   OPG_LAYOUT_PORT=5184 pnpm exec playwright test -c e2e/layout/playwright.config.ts \
//     --project=visual --update-snapshots
//
// commit the changed PNGs under e2e/layout/visual.spec.ts-snapshots/ alongside the change that
// caused them, and say in the PR description which screens moved and why. A baseline that
// changes without an explanation in the same PR is a reason to reject the PR, not merge it.
//
// ## Platform
//
// Baselines here are Linux (chromium via Playwright 1.63.0, the same build `playwright install
// --with-deps chromium` pulls in CI's ubuntu-latest job), generated in a matching Docker
// container rather than on the macOS machine that wrote this suite — font hinting and
// antialiasing differ enough between macOS and Linux that a baseline made on a Mac fails on
// every CI run and trains everyone to ignore red. This suite is not yet wired into `pnpm e2e` or
// CI's e2e job; it runs opt-in via `pnpm e2e:visual` until the baselines have been proven stable
// against a few real CI runs, at which point adding one line to ci.yml turns it into a gate.
import { expect, test } from "@playwright/test";

interface VisualCase {
  /** Snapshot file name, independent of the screen id so a renumbered fixture doesn't orphan a baseline. */
  name: string;
  id: string;
  width: number;
  height: number;
}

const CASES: VisualCase[] = [
  // TV: one per game that has a shared screen, weighted toward reveals and the gallery. Every
  // fixture freezes its clock at the phase's own start (see ScreenGallery's clockFor), so a
  // reveal that counts up or fills in over time is caught here at its first frame — still a
  // real frame a player sees, and enough to prove the standings card, avatars and colour
  // blocks painted at all.
  { name: "doodle-bluff-host-gallery", id: "doodle-bluff/5", width: 1920, height: 1080 },
  { name: "imposter-host-result-caught", id: "imposter/11", width: 1920, height: 1080 },
  { name: "real-or-nah-host-reveal-3-foolers", id: "real-or-nah/2", width: 1920, height: 1080 },
  // Phone, at the design reference size (390x844), and the no-TV variant where the reveal's own
  // colour and avatars have to render on the phone itself — there's no host screen to fall back
  // on if they don't. A blank doodle here is worst of all: nothing else on the screen says so.
  { name: "doodle-bluff-phone-no-tv-gallery", id: "doodle-bluff/17", width: 390, height: 844 },
  { name: "imposter-phone-no-tv-result", id: "imposter/42", width: 390, height: 844 },
  { name: "most-likely-to-phone-no-tv-reveal", id: "most-likely-to/16", width: 390, height: 844 },
];

for (const visualCase of CASES) {
  test(`${visualCase.name} matches its baseline`, async ({ page }) => {
    await page.setViewportSize({ width: visualCase.width, height: visualCase.height });
    await page.goto(`/dev/screens?id=${encodeURIComponent(visualCase.id)}`);
    await page.waitForFunction(
      (id) => document.body.dataset.screen === id,
      visualCase.id,
      { timeout: 15_000 },
    );
    await page.evaluate(() => document.fonts.ready);
    // Same settle as the layout suite: reducedMotion stops the CSS transitions, this is the
    // last frame of whatever paints after.
    await page.waitForTimeout(60);

    await expect(page).toHaveScreenshot(`${visualCase.name}.png`, {
      // 0.5% of pixels: enough slack for a sub-pixel antialiasing difference between chromium
      // builds, nowhere near enough to hide a missing sticker, a blank canvas or a wrong fill —
      // those move thousands of pixels, not a handful at a glyph edge.
      maxDiffPixelRatio: 0.005,
      animations: "disabled",
      caret: "hide",
    });
  });
}
