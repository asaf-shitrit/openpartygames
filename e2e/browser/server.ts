// Lifecycle for the server the browser e2e suite runs against.
//
// `wrangler dev` serves the built web app (apps/web/dist) plus the real Worker,
// Room Durable Object and a local D1 at .wrangler/e2e-state. Preparing that
// state (web build + migrations + pack seed) and starting/stopping the server
// both live here so playwright.config.ts and global-setup.ts agree on one
// source of truth.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
export const WORKER_DIR = path.join(ROOT_DIR, "apps", "worker");
export const HOST = "127.0.0.1";
// A run id namespaces the port, the D1 persist directory and the output directory, so two
// `pnpm e2e:browser` invocations on one machine never collide (issue #40): overlapping runs
// used to write traces into the same shared test-results/, clobbering each other's artifacts
// mid-suite (a `real-or-nah.spec.ts` failure surfaced only in `context.close()`, after every
// assertion had already passed). Deriving the default port from process.pid means two
// concurrently running processes essentially never bind the same one, either — this suite
// always starts its own wrangler dev rather than reusing one, so a collision there would at
// least fail loudly (EADDRINUSE) rather than corrupt a run, but avoiding it lets two runs
// share a machine cleanly instead of just failing safely. OPG_BROWSER_PORT/OPG_E2E_RUN_ID
// override the defaults outright when a stable value is useful.
/**
 * One id for the whole run, pinned into the environment the first time any process in the run
 * asks for it.
 *
 * It cannot simply be `process.pid`. Playwright evaluates this config in every worker process
 * as well as the parent, and Vitest forks its own; each has a different pid, so a pid-derived
 * port means the workers dial a port nobody is serving. That failure looks exactly like the
 * bug this file exists to fix — every spec failing in about a second, in a contiguous block —
 * which is how it got caught.
 *
 * Writing it back to `process.env` is the whole trick: workers are spawned after this runs and
 * inherit it, so the parent's value is the run's value.
 */
function runId(): string {
  const pinned = process.env.OPG_E2E_RUN_ID;
  if (pinned !== undefined && pinned !== "") return pinned;
  const id = String(process.pid);
  process.env.OPG_E2E_RUN_ID = id;
  return id;
}

/** A port derived from the run id, so every process in the run agrees on it. */
function portFor(base: number, span: number, id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % span;
  return base + hash;
}

const RUN_ID = runId();
export const PORT = Number(
  process.env.OPG_BROWSER_PORT ?? portFor(30_000, 20_000, RUN_ID),
);
export const BASE_URL = `http://${HOST}:${PORT}`;
export const OUTPUT_DIR = path.join(ROOT_DIR, "test-results", `browser-${RUN_ID}`);

const LOG_PATH = path.join(WORKER_DIR, ".wrangler", `e2e-browser-wrangler-${RUN_ID}.log`);
/** Separate from the API suite's `.wrangler/e2e-state`, and namespaced per run so the suites
 * can run side by side and two runs of this suite can't share (and corrupt) the same D1. */
const PERSIST_DIR = `.wrangler/e2e-browser-state-${RUN_ID}`;
const HEALTH_TIMEOUT_MS = 120_000;
const POLL_MS = 500;
const STOP_GRACE_MS = 5_000;

export interface ServerHandle {
  pid: number;
  exit: Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs a command from the repo root; a non-zero exit aborts startup with context. */
export function runStep(
  command: string,
  args: string[],
  label: string,
  extraEnv: Readonly<Record<string, string>> = {},
): void {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, ...extraEnv, CI: "true" },
    shell: false,
  });
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${label} exited with code ${String(result.status)}`);
  }
}

/** Builds apps/web/dist, which wrangler dev serves as the production-like assets. */
export function prepareWeb(): void {
  runStep("pnpm", ["build"], "building the web app");
}

/** Resets the local D1 and seeds the content packs the suite plays with. */
export function prepareState(): void {
  runStep("node", ["scripts/e2e-setup.mjs"], "preparing local D1", { OPG_E2E_PERSIST: PERSIST_DIR });
}

/** Last few server log lines, so a failed start says why. */
function logTail(lines = 40): string {
  try {
    return fs
      .readFileSync(LOG_PATH, "utf8")
      .split("\n")
      .slice(-lines)
      .join("\n");
  } catch {
    return "(no server log)";
  }
}

/** Starts `wrangler dev` detached so teardown can kill the whole process group. */
export function startServer(): ServerHandle {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const log = fs.openSync(LOG_PATH, "a");
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--env",
      "e2e",
      "--port",
      String(PORT),
      "--ip",
      HOST,
      "--persist-to",
      PERSIST_DIR,
    ],
    {
      cwd: WORKER_DIR,
      detached: true,
      stdio: ["ignore", log, log],
      env: {
        ...process.env,
        CI: "true",
        NO_COLOR: "1",
        WRANGLER_SEND_METRICS: "false",
      },
      shell: false,
    },
  );
  const pid = child.pid;
  if (pid === undefined) throw new Error("failed to spawn wrangler dev");
  const exit = new Promise<void>((resolve) => {
    child.once("exit", () => {
      fs.closeSync(log);
      resolve();
    });
  });
  child.on("error", (error) => {
    fs.writeSync(log, `spawn error: ${error.message}\n`);
  });
  return { pid, exit };
}

async function healthOnce(): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (!response.ok) return `HTTP ${response.status}`;
    const body: { ok?: boolean } = await response.json();
    return body.ok === true ? "ok" : "ok:false";
  } catch (error) {
    return error instanceof Error ? error.message : "fetch failed";
  }
}

/** Polls /api/health until the Worker answers, the server exits or time runs out. */
export async function waitForHealth(
  exit: Promise<void>,
  deadline = Date.now() + HEALTH_TIMEOUT_MS,
  lastError = "no response",
): Promise<void> {
  if (Date.now() >= deadline) {
    throw new Error(
      `wrangler dev never became healthy at ${BASE_URL}/api/health: ${lastError}\n${logTail()}`,
    );
  }
  const raced = await Promise.race([
    healthOnce(),
    exit.then(() => "exited" as const),
  ]);
  if (raced === "ok") return;
  if (raced === "exited") {
    throw new Error(
      `wrangler dev exited before becoming healthy:\n${logTail()}`,
    );
  }
  await sleep(POLL_MS);
  await waitForHealth(exit, deadline, raced);
}

/** Kills the detached process group and waits for it to leave. */
export async function stopServer(
  pid: number,
  exit: Promise<void>,
): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await Promise.race([exit, sleep(STOP_GRACE_MS)]);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}
