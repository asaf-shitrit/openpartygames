// Layout suite: renders every game screen through the dev gallery and holds it to the
// invariants in invariants.ts. It needs no Worker, no Durable Object and no D1 — only the
// Vite dev server, because the gallery route is dev-only — so it runs in seconds.
//
//   pnpm e2e:layout
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.OPG_LAYOUT_PORT ?? 5174);

/** Suites that are projects of their own, so the default projects leave them alone. */
const DEFAULT_SKIPS = ["**/a11y.spec.ts", "**/visual.spec.ts"];
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
    // en/he run every default spec: the layout invariants and the content-width, font-fallback
    // and model checks beside them. They skip the two suites that are projects of their own —
    // a11y (different sizes, different rules) and visual (opt-in, platform-specific baselines).
    { name: "en", testIgnore: DEFAULT_SKIPS },
    {
      name: "he",
      testIgnore: DEFAULT_SKIPS,
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
    // Accessibility passes: 200% text, contrast and accessible names. Kept as their own
    // project rather than folded into "en"/"he" because they check a different thing at a
    // different (smaller) set of sizes — see a11y.spec.ts for what and why.
    { name: "a11y", testMatch: /a11y\.spec\.ts$/ },
    // The pixel-comparison suite (visual.spec.ts) is opt-in, not a default project: a bare
    // `pnpm e2e:layout` must keep passing on any platform, with no snapshots at all. e2e:visual
    // sets OPG_VISUAL=1 to register this project and selects it with --project=visual; see
    // visual.spec.ts for why and how to update a baseline.
    ...(process.env.OPG_VISUAL === "1"
      ? [{ name: "visual", testMatch: "**/visual.spec.ts" }]
      : []),
  ],
  webServer: {
    command: `pnpm --filter @opg/web exec vite --port ${PORT} --strictPort`,
    url: `${BASE_URL}/dev/screens`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
