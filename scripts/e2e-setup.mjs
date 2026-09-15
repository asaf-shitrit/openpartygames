#!/usr/bin/env node
// Prepares the isolated local state the API e2e suite runs against:
// a fresh D1 database with the migrations applied and the content packs seeded.
//
//   node scripts/e2e-setup.mjs
//
// Everything lands in apps/worker/.wrangler/e2e-state, the --persist-to directory
// `wrangler dev` uses in e2e/api/global-setup.ts.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const workerDir = path.join(rootDir, "apps", "worker");
// Each suite passes its own directory (relative to apps/worker) so API and browser runs never share state.
const persistArg = process.env.OPG_E2E_PERSIST ?? ".wrangler/e2e-state";
const persistDir = path.join(workerDir, persistArg);

/** Runs one command in the worker package, inheriting stdio, and dies on failure. */
function run(command, args, label) {
  console.log(`e2e-setup: ${label}`);
  const result = spawnSync(command, args, {
    cwd: workerDir,
    // No stdin and CI=true keep wrangler from waiting on interactive confirmation prompts.
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "true" },
    shell: false,
  });
  if (result.error) {
    console.error(`e2e-setup: ${label} failed:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`e2e-setup: ${label} failed with exit code ${result.status}`);
    process.exit(1);
  }
}

console.log(`e2e-setup: resetting ${persistDir}`);
fs.rmSync(persistDir, { recursive: true, force: true });
fs.mkdirSync(persistDir, { recursive: true });

run(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "openpartygames",
    "--local",
    "--persist-to",
    persistArg,
  ],
  "applying D1 migrations",
);

run("node", [path.join(rootDir, "scripts", "build-pack-seed.mjs")], "building the pack seed");

run(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "openpartygames",
    "--local",
    "--persist-to",
    persistArg,
    "--file=.wrangler/pack-seed.sql",
  ],
  "seeding content packs",
);

console.log("e2e-setup: done");