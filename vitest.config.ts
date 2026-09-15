import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "games/*",
      "apps/worker",
      "apps/web/vitest.config.ts",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], environment: "node" } },
    ],
    coverage: {
      provider: "v8",
      // "json" writes coverage/coverage-final.json, which the CRAP report reads.
      reporter: ["text-summary", "json"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.{ts,tsx}", "games/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/fixtures/**", "**/preview.ts", "**/*.d.ts"],
    },
  },
});
