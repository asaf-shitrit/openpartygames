// Real or Nah: constants, state and view types. Pure JSON, no classes/Map/Set.
import { z } from "zod";
import type { Fact } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";

// Timing constants (the UI imports these).
export const FACTS_PER_GAME = 6;
export const WRITE_MS = 60000;
export const VOTE_MS = 30000;

export const LIE_MAX_LENGTH = 40;
export const MIN_OPTIONS = 4;

export const RON_MIN_PLAYERS = 3;
export const RON_MAX_PLAYERS = 8;
export const RON_MINUTES = 15;

export const POINTS_TRUTH = 1000;
export const POINTS_PER_FOOL = 500;

const ronPhaseSchema = z.enum(["write", "vote", "reveal"]);

export type RonPhase = z.infer<typeof ronPhaseSchema>;

const ronLieErrorSchema = z.enum(["invalid", "truth", "duplicate"]);

export type RonLieError = z.infer<typeof ronLieErrorSchema>;

export interface RonOption {
  /** "o1", "o2", ... in shuffled display order. */
  id: string;
  text: string;
  /** The player whose lie this is, or null for the truth and house decoys. */
  authorId: PlayerId | null;
  isTruth: boolean;
  /** True for a house decoy that filled the ballot. Absent on earlier snapshots. */
  isDecoy?: boolean;
}

const ronFooledLieSchema = z.object({
  optionId: z.string(),
  text: z.string(),
  authorId: z.string().nullable(),
  fooledIds: z.array(z.string()),
  points: z.number(),
});

export type RonFooledLie = z.infer<typeof ronFooledLieSchema>;

/** How many people a lie fooled at the moment the reveal started, frozen for the plan. */
const ronPlanLieSchema = z.object({
  optionId: z.string(),
  fooledCount: z.number(),
});

export type RonPlanLie = z.infer<typeof ronPlanLieSchema>;

const ronRevealSchema = z.object({
  truthOptionId: z.string(),
  answer: z.string(),
  source: z.object({ title: z.string(), url: z.string() }),
  foundByIds: z.array(z.string()),
  lies: z.array(ronFooledLieSchema),
  /**
   * The reveal-plan input, frozen when the reveal started so a later kick can't reorder
   * or resize the timeline. Optional because snapshots saved before this field existed
   * lack it; `planLiesOf` derives it from `lies` when missing.
   */
  planLies: z.array(ronPlanLieSchema).optional(),
});

export type RonReveal = z.infer<typeof ronRevealSchema>;

/**
 * The frozen reveal-plan input for `reveal`: its own `planLies` when present, otherwise
 * one derived from `lies` (an old snapshot, or a reveal not yet run through `startReveal`).
 */
export function planLiesOf(reveal: {
  lies: readonly RonFooledLie[];
  planLies?: readonly RonPlanLie[];
}): RonPlanLie[] {
  if (reveal.planLies !== undefined) return [...reveal.planLies];
  return reveal.lies.map((lie) => ({
    optionId: lie.optionId,
    fooledCount: lie.fooledIds.length,
  }));
}

export interface RonState {
  phase: RonPhase;
  factIndex: number;
  facts: Fact[];
  /** Current roster (game players minus anyone kicked). */
  playerIds: PlayerId[];
  /** authorId -> cleaned lie text for the current fact. */
  lies: Record<PlayerId, string>;
  /** authorId -> last rejection, cleared when a lie is accepted. */
  lieErrors: Record<PlayerId, RonLieError>;
  /** Built when voting starts; null during write. */
  options: RonOption[] | null;
  /** voterId -> optionId for the current fact. */
  votes: Record<PlayerId, string>;
  /** Set when the vote closes; null before then. */
  reveal: RonReveal | null;
  pointsThisFact: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  finished: boolean;
  /** Epoch ms of the current phase timeout; null once finished. */
  deadline: number | null;
  /**
   * One record per fact whose reveal was left, used to compute end-of-game
   * awards. Optional: snapshots saved before this field existed lack it.
   */
  history?: RonFactRecord[];
}

/** What happened in one fact's reveal, kept for end-of-game awards. */
export interface RonFactRecord {
  foundByIds: PlayerId[];
  /** voterId -> optionId picked, for the fact this record covers. */
  picks: Record<PlayerId, string>;
  lies: Array<{
    optionId: string;
    authorId: PlayerId | null;
    fooledIds: PlayerId[];
  }>;
}

export type RonAction =
  | { type: "lie"; text: string }
  | { type: "pick"; optionId: string };

/** Host-facing option; never carries `isTruth` or `authorId`. */
export const ronHostOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type RonHostOption = z.infer<typeof ronHostOptionSchema>;

/** Player-facing option; `mine` is the only author hint a player ever gets. */
export const ronPlayerOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  mine: z.boolean(),
});

export type RonPlayerOption = z.infer<typeof ronPlayerOptionSchema>;

/** Wire shape of the host view. Parsing at the web boundary strips unknown keys. */
export const ronHostViewSchema = z.object({
  phase: ronPhaseSchema,
  factNumber: z.number(),
  factCount: z.number(),
  prompt: z.string(),
  playerIds: z.array(z.string()),
  submittedIds: z.array(z.string()),
  votedIds: z.array(z.string()),
  totals: z.record(z.string(), z.number()),
  // From vote on, otherwise null.
  options: z.array(ronHostOptionSchema).nullable(),
  // In reveal only, otherwise null.
  reveal: ronRevealSchema.nullable(),
  pointsThisFact: z.record(z.string(), z.number()).nullable(),
});

export type RonHostView = z.infer<typeof ronHostViewSchema>;

/** Wire shape of a player's own view; never reveals anyone else's secrets. */
export const ronPlayerViewSchema = z.object({
  phase: ronPhaseSchema,
  factNumber: z.number(),
  factCount: z.number(),
  prompt: z.string(),
  /** The player's own accepted lie for this fact, or null. */
  myLie: z.string().nullable(),
  lieError: ronLieErrorSchema.nullable(),
  submittedCount: z.number(),
  playerCount: z.number(),
  /** The player's own option pick for this fact, or null. */
  myPick: z.string().nullable(),
  totals: z.record(z.string(), z.number()),
  // From vote on, otherwise null.
  options: z.array(ronPlayerOptionSchema).nullable(),
  // In reveal only, otherwise null.
  reveal: ronRevealSchema.nullable(),
  myPoints: z.number().nullable(),
});

export type RonPlayerView = z.infer<typeof ronPlayerViewSchema>;
