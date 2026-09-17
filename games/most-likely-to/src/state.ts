// Most Likely To: constants, state and view types. Pure JSON, no classes/Map/Set.
import { z } from "zod";
import type { PlayerId } from "@opg/protocol";
import type { Superlative } from "@opg/sdk";

// Timing constants (the UI imports these).
export const ROUNDS_PER_GAME = 20;
export const VOTE_MS = 30000;
/** The same for every outcome, so the TV and phones anchor one fixed storyboard. */
export const REVEAL_MS = 12000;

export const MLT_MIN_PLAYERS = 3;
export const MLT_MAX_PLAYERS = 8;
export const MLT_MINUTES = 12;

export const POINTS_PER_MATCH = 500;
/**
 * A player needs at least this many votes to be a top pick, so an all-different
 * round pays nobody.
 */
export const MIN_VOTES_FOR_PICK = 2;

export const mltPhaseSchema = z.enum(["vote", "reveal"]);

export type MltPhase = z.infer<typeof mltPhaseSchema>;

/**
 * How a round's vote landed.
 * picked: one player has the most votes (at least MIN_VOTES_FOR_PICK).
 * tie: several players share the most votes (at least MIN_VOTES_FOR_PICK), in roster order.
 * split: votes were cast, but nobody reached MIN_VOTES_FOR_PICK.
 * no-votes: nobody voted.
 */
export const mltOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("picked"), pickedId: z.string() }),
  z.object({ kind: z.literal("tie"), tiedIds: z.array(z.string()) }),
  z.object({ kind: z.literal("split") }),
  z.object({ kind: z.literal("no-votes") }),
]);

export type MltOutcome = z.infer<typeof mltOutcomeSchema>;

/**
 * The reveal, frozen when the vote closes. A kick mid-reveal never changes it, so the
 * ceremony keeps its tiles and beats; UI falls back to "Someone" for a kicked player.
 */
export const mltRevealSchema = z.object({
  /** The roster when the vote closed, in join order. */
  playerIds: z.array(z.string()),
  /** targetId -> voterIds (voters in roster order). Only targets with votes appear. */
  tally: z.record(z.string(), z.array(z.string())),
  outcome: mltOutcomeSchema,
  /** Voters whose vote matched a top pick, in roster order. */
  matchedIds: z.array(z.string()),
});

export type MltReveal = z.infer<typeof mltRevealSchema>;

/** What happened in one round, kept for end-of-game awards. */
export interface MltRoundRecord {
  /** voterId -> targetId. */
  votes: Record<PlayerId, PlayerId>;
  matchedIds: PlayerId[];
}

export interface MltState {
  phase: MltPhase;
  roundIndex: number;
  prompts: Superlative[];
  /** Current roster (game players minus anyone kicked). */
  playerIds: PlayerId[];
  /** voterId -> targetId for the current round. Self-votes are allowed. */
  votes: Record<PlayerId, PlayerId>;
  /** Set when the vote closes; null during the vote. */
  reveal: MltReveal | null;
  pointsThisRound: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  finished: boolean;
  /** Epoch ms of the current phase timeout; null once finished. */
  deadline: number | null;
  /** One record per completed round, appended when its reveal ends. */
  history: MltRoundRecord[];
}

export type MltAction = { type: "vote"; target: PlayerId };

/** Wire shape of the host view. Never says who voted for whom until the reveal. */
export const mltHostViewSchema = z.object({
  phase: mltPhaseSchema,
  roundNumber: z.number(),
  roundCount: z.number(),
  /** Completes "Who's most likely to …?", e.g. "adopt a dozen cats". */
  prompt: z.string(),
  playerIds: z.array(z.string()),
  /** Who has voted (never whom), during the vote. */
  votedIds: z.array(z.string()),
  totals: z.record(z.string(), z.number()),
  // During the reveal, otherwise null.
  reveal: mltRevealSchema.nullable(),
  pointsThisRound: z.record(z.string(), z.number()).nullable(),
});

export type MltHostView = z.infer<typeof mltHostViewSchema>;

/** Wire shape of a player's own view: their own vote only, until the reveal. */
export const mltPlayerViewSchema = z.object({
  phase: mltPhaseSchema,
  roundNumber: z.number(),
  roundCount: z.number(),
  prompt: z.string(),
  /** Every player in the roster, the viewer included (self-votes are allowed). */
  voteCandidates: z.array(z.string()),
  myVote: z.string().nullable(),
  votedCount: z.number(),
  playerCount: z.number(),
  totals: z.record(z.string(), z.number()),
  // During the reveal, otherwise null.
  reveal: mltRevealSchema.nullable(),
  myPoints: z.number().nullable(),
});

export type MltPlayerView = z.infer<typeof mltPlayerViewSchema>;
