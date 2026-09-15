import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * API e2e suite: real Worker, real Room Durable Object, real local D1.
 * Run with `pnpm e2e:api`; it is deliberately not part of `pnpm test`.
 */
export default defineConfig({
  test: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
    environment: "node",
    include: ["e2e/api/**/*.test.ts"],
    globalSetup: ["e2e/api/global-setup.ts"],
    testTimeout: 240000,
    hookTimeout: 180000,
    fileParallelism: false,
  },
});