// Browser e2e suite: a real TV page plus phone pages playing full games through
// the real web app, Worker, Room Durable Object and local D1.
//
// Run with `CI=true pnpm e2e:browser`. global-setup.ts builds the web app,
// resets and seeds the local D1, then starts `wrangler dev` on PORT; the
// teardown kills it.

import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { BASE_URL, OUTPUT_DIR } from "./server";

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  globalSetup: fileURLToPath(new URL("./global-setup.ts", import.meta.url)),
  outputDir: OUTPUT_DIR,
  fullyParallel: true,
  // Two, not more. The Imposter spec's fixed ceremonies put a ~4 minute floor under the
  // suite whatever the worker count, so a third buys no wall clock and only adds contention
  // on one local worker — which is enough to make a dropped click reproducible now that a
  // clue turn has no deadline to rescue it.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // The in-play layout checks (layout-check.ts) rely on this: it makes every CSS keyframe
    // in the app collapse to near-zero duration and every JS-driven effect skip itself, the
    // same way e2e/layout/ already renders its fixtures. Without it a check could fire mid
    // phase-transition and report an overlap that is the animation playing, not a bug.
    reducedMotion: "reduce",
  },
  // Two projects, not one. Everything short runs in parallel; the Imposter spec then runs
  // on its own. It plays six words of real ceremonies and is four minutes of the suite by
  // itself, so it gains nothing from sharing a machine — and it loses something real:
  // a clue turn has no deadline any more, so a tap that gets dropped under contention
  // hangs the game instead of costing thirty seconds. Isolating it keeps the wall-clock
  // win without betting the suite on every click landing.
  projects: [
    {
      name: "fast",
      testIgnore: /imposter\.spec\.ts/,
      // The TV page (this project's default `page`/`context` fixture — phones open their
      // own Pixel 5 contexts explicitly in harness.ts and are unaffected) is the real
      // 1920x1080 stage the design targets, same as e2e/layout/'s own TV viewport. Without
      // this override, devices["Desktop Chrome"]'s own 1280x720 default shrinks the
      // viewport the app shell's chrome (HostApp's room code / fullscreen / sound controls,
      // which sit outside the scaled Stage) actually renders into, and an in-play layout
      // check would report that mismatch as a real overflow.
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "imposter",
      testMatch: /imposter\.spec\.ts/,
      dependencies: ["fast"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
});
