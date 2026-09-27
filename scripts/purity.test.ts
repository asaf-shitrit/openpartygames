// Games and RoomCore are pure. This is the thing that says so out loud.
//
// CLAUDE.md states the rule — "Games and RoomCore are pure and deterministic: no Date.now(),
// Math.random(), timers or I/O. Use ctx.now and ctx.rng" — and until now nothing enforced it.
// The layer is clean today; it stayed clean by everyone remembering.
//
// What it costs to forget is unusually nasty. A `Math.random()` in a game's `onAction` does
// not throw and does not fail a test: it makes the same inputs produce different outputs, so
// the bot playthroughs stop being reproducible, a snapshot restored after a deploy diverges
// from the room it was taken from, and the dev gallery's frozen clock stops freezing anything.
// Every one of those shows up somewhere other than the line that caused it.
//
// Modelled on `apps/web/src/screens/no-hardcoded-copy.test.ts`: the repo already enforces one
// convention by reading its own source, and this is the same shape of problem.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * What a pure module may not reach for, and what to use instead. The message matters as much
 * as the rule: someone hitting this needs to know there is a supported way to do the thing.
 */
const BANNED: { pattern: RegExp; use: string }[] = [
  { pattern: /\bDate\.now\s*\(/, use: "ctx.now" },
  { pattern: /\bnew Date\s*\(/, use: "ctx.now" },
  { pattern: /\bMath\.random\s*\(/, use: "ctx.rng" },
  { pattern: /\bsetTimeout\s*\(/, use: "a deadline the room ticks" },
  { pattern: /\bsetInterval\s*\(/, use: "a deadline the room ticks" },
  { pattern: /\bfetch\s*\(/, use: "a RoomEffect the adapter runs" },
  { pattern: /\bcrypto\./, use: "ctx.rng, or a token from the adapter" },
];

/**
 * The pure layer: the SDK, the wire contract, and each game's rules.
 *
 * `games/<id>/src/ui` is deliberately outside it. Those are React components and the rules
 * they follow are different ones — they legitimately schedule animation work and read the
 * clock the host hands them.
 */
function pureFiles(): string[] {
  const roots = [
    path.join(rootDir, "packages/sdk/src"),
    path.join(rootDir, "packages/protocol/src"),
    ...gameSourceDirs(),
  ];
  return roots.flatMap((dir) => walk(dir)).filter(isPureSource);
}

function gameSourceDirs(): string[] {
  const gamesDir = path.join(rootDir, "games");
  if (!fs.existsSync(gamesDir)) return [];
  return fs
    .readdirSync(gamesDir)
    .map((game) => path.join(gamesDir, game, "src"))
    .filter((dir) => fs.existsSync(dir));
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function isPureSource(file: string): boolean {
  if (!file.endsWith(".ts") && !file.endsWith(".tsx")) return false;
  if (file.includes(`${path.sep}ui${path.sep}`)) return false;
  return !/\.(test|spec)\.tsx?$/.test(file);
}

/**
 * The source with its comments removed.
 *
 * Every current mention of these calls in the pure layer is a comment explaining that they are
 * banned, so scanning raw text would fail on the rule's own documentation. Line comments are
 * cut at `//`, which also truncates a URL inside a string — that can only hide a call, never
 * invent one, and a real call sharing a line with a URL literal is not a thing worth the
 * machinery of a parser.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function violationsIn(file: string): string[] {
  const source = withoutComments(fs.readFileSync(file, "utf8"));
  const relative = path.relative(rootDir, file);
  return source.split("\n").flatMap((line, index) =>
    BANNED.filter((banned) => banned.pattern.test(line)).map(
      (banned) =>
        `${relative}:${index + 1} uses ${String(banned.pattern)} — use ${banned.use}`,
    ),
  );
}

describe("the pure layer stays pure", () => {
  const files = pureFiles();

  it("is reading the files it thinks it is", () => {
    // Without this, a bad path or a changed layout would make the rule below pass by
    // scanning nothing at all — the failure mode every source-scanning test has.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((file) => file.endsWith(`sdk${path.sep}src${path.sep}room.ts`))).toBe(true);
    expect(files.some((file) => file.includes(`imposter${path.sep}src`))).toBe(true);
    expect(files.every((file) => !file.includes(`${path.sep}ui${path.sep}`))).toBe(true);
  });

  it("calls no clock, no randomness, no timer and no network", () => {
    expect(files.flatMap((file) => violationsIn(file))).toEqual([]);
  });

  it("would notice if one appeared", () => {
    // The rule is only worth having if it fires, and the comment-stripping above is exactly
    // the part that could quietly neuter it.
    const sample = [
      "const t = Date.now();",
      "// Date.now() in a comment is fine",
      "/* and Math.random() in a block comment */",
      "const r = Math.random();",
    ].join("\n");
    const stripped = withoutComments(sample);
    expect(BANNED.filter((banned) => banned.pattern.test(stripped))).toHaveLength(2);
  });
});
