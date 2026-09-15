// Vitest global setup for the API e2e suite.
//
// Starts a real `wrangler dev` (Worker + Room Durable Object + local D1) on a
// dedicated port with its own `--persist-to` directory, after preparing that
// directory with scripts/e2e-setup.mjs. The teardown kills the whole process
// group, so no wrangler is left behind when the suite ends.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const workerDir = path.join(rootDir, "apps", "worker");
const webDistDir = path.join(rootDir, "apps", "web", "dist");
const logPath = path.join(workerDir, ".wrangler", "e2e-wrangler.log");
const PORT = 8799;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;
const HEALTH_TIMEOUT_MS = 120_000;
const POLL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Applies migrations and seeds the local D1 the suite runs against. */
function prepareState(): void {
  const result = spawnSync("node", ["scripts/e2e-setup.mjs"], {
    cwd: rootDir,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "true" },
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`e2e-setup.mjs exited with code ${String(result.status)}`);
  }
}

/** Last few log lines, so a failed start says why. */
function logTail(lines = 40): string {
  try {
    return fs
      .readFileSync(logPath, "utf8")
      .split("\n")
      .slice(-lines)
      .join("\n");
  } catch {
    return "(no wrangler log)";
  }
}

/** Starts `wrangler dev` detached so teardown can kill the whole process group. */
function startWrangler() {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, "a");
  const child = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--port",
      String(PORT),
      "--ip",
      HOST,
      "--persist-to",
      ".wrangler/e2e-state",
    ],
    {
      cwd: workerDir,
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

/** Polls /api/health until it answers {ok:true} or the deadline passes. */
async function waitForHealth(
  exit: Promise<void>,
  deadline: number,
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

/** Kills the detached process group and waits for it to leave. */
async function stopWrangler(pid: number, exit: Promise<void>): Promise<void> {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await Promise.race([exit, sleep(5000)]);
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  prepareState();
  fs.mkdirSync(webDistDir, { recursive: true });

  const wrangler = startWrangler();
  await waitForHealth(wrangler.exit, Date.now() + HEALTH_TIMEOUT_MS);

  // Test workers inherit this env, so client.ts needs no Vitest inject plumbing.
  process.env.OPG_E2E_BASE_URL = BASE_URL;

  return async () => {
    await stopWrangler(wrangler.pid, wrangler.exit);
  };
}
