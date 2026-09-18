import { defineProject } from "vitest/config";

export default defineProject({
  test: { include: ["src/**/*.test.{ts,tsx}"], environment: "happy-dom", passWithNoTests: true,
    // Report every source file so untested code counts as 0% instead of being skipped.
    coverage: { include: ["src/**/*.{ts,tsx}"], exclude: ["src/**/*.test.{ts,tsx}", "src/**/fixtures/**", "src/**/*.d.ts"] },
  },
});
