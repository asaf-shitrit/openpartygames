// Runs every gate in turn — `pnpm check` and the three e2e suites — and prints one summary.
// Each suite writes its full output to .verify/<suite>.log; a failure does not stop
// the later suites, so one run says everything that is red. Exits non-zero if anything failed.
import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";

const LOG_DIR = ".verify";
// Fastest first.
const SUITES = ["check", "e2e:api", "e2e:layout", "e2e:browser"];
// Playwright's closing lines: "12 passed", "1 failed", "10 skipped". Vitest's: "Tests  9 passed".
const COUNTS = /^\s*(Tests\s+)?\d+ (passed|failed|skipped|flaky|did not run)\b.*$/gm;

function run(suite) {
  const log = `${LOG_DIR}/${suite.replace(":", "-")}.log`;
  console.log(`▶ ${suite} (log: ${log})`);
  const out = openSync(log, "w");
  const { status } = spawnSync("pnpm", [suite], {
    stdio: ["ignore", out, out],
    env: { ...process.env, CI: "true" },
  });
  return { suite, log, status };
}

function counts(log) {
  return (readFileSync(log, "utf8").match(COUNTS) ?? []).map((line) => line.trim());
}

function report({ suite, log, status }) {
  console.log(`${status === 0 ? "✓" : "✗"} ${suite} exit ${status}  ${counts(log).join(", ")}`);
}

mkdirSync(LOG_DIR, { recursive: true });
const results = SUITES.map((suite) => {
  const result = run(suite);
  report(result);
  return result;
});
console.log("\nSummary:");
results.forEach(report);
process.exitCode = results.every((result) => result.status === 0) ? 0 : 1;
