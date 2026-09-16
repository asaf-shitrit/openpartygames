// Real or Nah reveal timing: a pure plan the game (deadline) and the UI (beats) both call.

export const RON_REVEAL = {
  introMs: 2000,
  dudsMs: 2000,
  lieMs: 3500,
  minLieMs: 2200,
  truthMs: 4000,
  standingsMs: 3500,
  capMs: 30000,
} as const;

export type RevealSegmentKind = "intro" | "duds" | "lie" | "truth" | "standings";

export interface RevealSegment {
  kind: RevealSegmentKind;
  atMs: number;
  durationMs: number;
  /** The lie's option id for "lie" segments, otherwise null. */
  optionId: string | null;
}

/**
 * The reveal plan is built from the frozen fooled-count per lie (`RonPlanLie`), never
 * from live `fooledIds`, so a kick mid-reveal cannot reorder or resize the timeline.
 */
export interface RevealInput {
  lies: ReadonlyArray<{ optionId: string; fooledCount: number }>;
}

interface LieSplit {
  duds: ReadonlyArray<{ optionId: string; fooledCount: number }>;
  foolers: ReadonlyArray<{ optionId: string; fooledCount: number }>;
}

type Lie = { optionId: string; fooledCount: number };

/** Sortable key: fooled count first (zero-padded), optionId breaks ties. */
function sortKey(lie: Lie): string {
  return `${String(lie.fooledCount).padStart(6, "0")}-${lie.optionId}`;
}

/**
 * Fewest-fooled first, ties broken by optionId. ES2022 has no Array#toSorted, so
 * sort by hand.
 */
function byFooledCountAscending<T extends Lie>(lies: readonly T[]): T[] {
  const remaining = [...lies];
  const sorted: T[] = [];
  while (remaining.length > 0) {
    const keys = remaining.map(sortKey);
    const lowest = keys.reduce((min, key) => (key < min ? key : min));
    const at = keys.indexOf(lowest);
    sorted.push(...remaining.splice(at, 1));
  }
  return sorted;
}

/** Duds (fooled nobody) vs foolers (fooled someone), foolers sorted fewest-fooled first. */
function splitLies(reveal: RevealInput): LieSplit {
  const duds = reveal.lies.filter((lie) => lie.fooledCount === 0);
  const foolers = byFooledCountAscending(
    reveal.lies.filter((lie) => lie.fooledCount > 0),
  );
  return { duds, foolers };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Per-lie spotlight length: split the remaining cap budget evenly, clamped both ends. */
function lieSegmentLength(foolerCount: number, hasDuds: boolean): number {
  if (foolerCount === 0) return 0;
  const fixed =
    RON_REVEAL.introMs +
    (hasDuds ? RON_REVEAL.dudsMs : 0) +
    RON_REVEAL.truthMs +
    RON_REVEAL.standingsMs;
  const remaining = Math.floor((RON_REVEAL.capMs - fixed) / foolerCount);
  return clamp(remaining, RON_REVEAL.minLieMs, RON_REVEAL.lieMs);
}

function buildSegments(reveal: RevealInput): RevealSegment[] {
  const { duds, foolers } = splitLies(reveal);
  const perLie = lieSegmentLength(foolers.length, duds.length > 0);
  const segments: RevealSegment[] = [];
  let atMs = 0;

  segments.push({ kind: "intro", atMs, durationMs: RON_REVEAL.introMs, optionId: null });
  atMs += RON_REVEAL.introMs;

  if (duds.length > 0) {
    segments.push({ kind: "duds", atMs, durationMs: RON_REVEAL.dudsMs, optionId: null });
    atMs += RON_REVEAL.dudsMs;
  }

  for (const lie of foolers) {
    segments.push({ kind: "lie", atMs, durationMs: perLie, optionId: lie.optionId });
    atMs += perLie;
  }

  segments.push({ kind: "truth", atMs, durationMs: RON_REVEAL.truthMs, optionId: null });
  atMs += RON_REVEAL.truthMs;

  segments.push({
    kind: "standings",
    atMs,
    durationMs: RON_REVEAL.standingsMs,
    optionId: null,
  });

  return segments;
}

/** Segments in play order: intro, duds (when any), one "lie" per fooler (ascending), truth, standings. */
export function revealPlan(reveal: RevealInput): RevealSegment[] {
  return buildSegments(reveal);
}

export function revealDurationMs(reveal: RevealInput): number {
  const segments = revealPlan(reveal);
  const last = segments[segments.length - 1];
  return last === undefined ? 0 : last.atMs + last.durationMs;
}
