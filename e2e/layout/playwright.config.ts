// Layout suite: renders every game screen through the dev gallery and holds it to the
// invariants in invariants.ts. It needs no Worker, no Durable Object and no D1 — only the
// Vite dev server, because the gallery route is dev-only — so it runs in seconds.
//
//   pnpm e2e:layout
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // Screens animate in; measuring a half-played transition measures nothing.
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  },
  projects: [
    { name: "en" },
    {
      name: "he",
      use: {
        // The app reads its locale from storage, so the whole suite runs in Hebrew too:
        // different faces, different word lengths, right-to-left.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: BASE_URL,
              localStorage: [{ name: "opg:locale", value: "he" }],
            },
          ],
        },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @opg/web exec vite --port ${PORT} --strictPort`,
    url: `${BASE_URL}/dev/screens`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
