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
  fullyParallel: false,
  workers: 1,
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
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
