// Sketch Phone: constants, state and view types. Pure JSON, no classes, Map or Set.
//
// A chain is one link per player. Round 0 seeds every chain with words; each later round hands
// every chain one seat on, and the link that round fills alternates drawing, words, drawing, …
// The hand-off arithmetic lives in @opg/sdk's chain capability; the assignments are frozen at
// setup so a kick can never change who was meant to fill a link.
import { z, type ZodType } from "zod";
import type { PlayerId } from "@opg/protocol";
import {
  doodleSchema,
  MAX_STROKES_PER_DOODLE,
  stepKind,
  strokeSchema,
  type ChainStepKind,
  type Doodle,
  type Stroke,
} from "@opg/sdk";

// ---------- Timing ----------

export const WRITE_MS = 45_000;
export const DRAW_MS = 75_000;
export const DESCRIBE_MS = 40_000;
/** One link of a replayed chain. "Moves on by itself in 0:08" (design/PhoneNoTvSketchPhoneReplay). */
export const PRESENT_MS = 6_000;
export const VOTE_MS = 25_000;
export const FAVOURITE_MS = 10_000;

export const SKETCH_MIN_PLAYERS = 3;
export const SKETCH_MAX_PLAYERS = 8;
export const SKETCH_MINUTES = 18;

/** The phone shows "21 / 50" (design/PhoneSketchPhoneDescribe.dc.html). */
export const TEXT_MAX_LENGTH = 50;
/** "Each vote is +100" (design/PhoneSketchPhoneVote.dc.html). */
export const POINTS_PER_VOTE = 100;

// ---------- Phases ----------

export const sketchPhaseSchema = z.enum(["write", "draw", "describe", "replay", "vote", "favourite"]);

export type SketchPhase = z.infer<typeof sketchPhaseSchema>;

export const sketchLinkKindSchema = z.enum(["words", "drawing"]);

export type SketchLinkKind = z.infer<typeof sketchLinkKindSchema>;

// ---------- State ----------

/**
 * One link of one chain. Created for every (chain, round) pair at setup, so a player always has
 * a link to fill and a removed player simply leaves their links empty for the rest of the game.
 */
export interface ChainLink {
  /** `c<chain>s<step>`. Unique for the whole game, and what a vote cites. */
  id: string;
  chain: number;
  /** 0 is the seed; also the round that fills it. */
  step: number;
  kind: SketchLinkKind;
  authorId: PlayerId;
  /** The words of a words link; "" on a drawing link. */
  text: string;
  doodle: Doodle;
  /** True once the author handed it in, or the phase deadline closed with whatever was there. */
  done: boolean;
}

export interface SketchState {
  phase: SketchPhase;
  /** `ctx.now` at setup. Optional: a game saved before it existed has none. */
  startedAt?: number;
  /** Seats, in join order. */
  playerIds: PlayerId[];
  /** chain * playerCount + step is not stable once players leave, so links are keyed by id. */
  links: Record<string, ChainLink>;
  /** Every chain index, shuffled once when the replay starts; the order chains are shown in. */
  replayOrder: number[];
  /** Position in `replayOrder` of the chain on stage now. */
  replayPos: number;
  /** How many links of the chain on stage are revealed, 1..length. */
  revealed: number;
  /** 0 is `write`; 1.. are the transfer rounds. */
  round: number;
  /** PlayerId -> the chain they work on in each round, frozen at setup. */
  chainsFor: Record<PlayerId, number>[];
  /** Who has handed in their link for the current round. */
  doneIds: Record<PlayerId, boolean>;
  /** voterId -> linkId, for the chain on stage. */
  votes: Record<PlayerId, string>;
  /** linkId -> voter ids, accumulated over every chain voted on so far. */
  voters: Record<string, PlayerId[]>;
  /** Points earned on the chain on stage, shown on the favourite screen. */
  pointsThisChain: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  finished: boolean;
  /** Epoch ms of the current phase timeout; null once finished. */
  deadline: number | null;
}

export function linkIdOf(chain: number, step: number): string {
  return `c${chain}s${step}`;
}

// ---------- Actions ----------

/**
 * `strokes` and `truncate` name their link, so a chunk built for the round before can never land
 * on the one after it. Both are gated by the link's exact current stroke count (`from`), the same
 * idempotency check Doodle Bluff uses: a duplicate or stale chunk is a no-op, never a rewrite.
 */
export type SketchAction =
  | { type: "words"; text: string }
  | { type: "strokes"; linkId: string; from: number; strokes: Stroke[] }
  | { type: "truncate"; linkId: string; from: number; to: number }
  | { type: "done"; linkId: string }
  | { type: "next-link" }
  | { type: "vote"; linkId: string };

export const sketchActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("words"), text: z.string().max(200) }),
  z.object({
    type: z.literal("strokes"),
    linkId: z.string().min(1).max(64),
    from: z.int().min(0),
    strokes: z.array(strokeSchema).min(1).max(MAX_STROKES_PER_DOODLE),
  }),
  z.object({
    type: z.literal("truncate"),
    linkId: z.string().min(1).max(64),
    from: z.int().min(0),
    to: z.int().min(0),
  }),
  z.object({ type: z.literal("done"), linkId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("next-link") }),
  z.object({ type: z.literal("vote"), linkId: z.string().min(1).max(64) }),
]) satisfies ZodType<SketchAction>;

// ---------- Views ----------

/** One link as everybody may see it once it has been revealed. */
export const sketchLinkViewSchema = z.object({
  id: z.string(),
  kind: sketchLinkKindSchema,
  authorId: z.string(),
  text: z.string().nullable(),
  doodle: doodleSchema.nullable(),
});

export type SketchLinkView = z.infer<typeof sketchLinkViewSchema>;

export const sketchHostVoteSchema = z.object({
  linkId: z.string(),
  votes: z.number(),
  mine: z.literal(false).optional(),
});

export const sketchHostViewSchema = z.object({
  phase: sketchPhaseSchema,
  playerIds: z.array(z.string()),
  /** The transfer round on stage, 1..roundCount; 0 during `write`. */
  roundNumber: z.number(),
  roundCount: z.number(),
  doneIds: z.array(z.string()),
  totals: z.record(z.string(), z.number()),
  /** 1-based position of the chain on stage in the replay order; 0 before the replay. */
  chainNumber: z.number(),
  chainCount: z.number(),
  ownerId: z.string().nullable(),
  presenterId: z.string().nullable(),
  /** The links of the chain on stage that may be shown now; null outside the replay and its vote. */
  links: z.array(sketchLinkViewSchema).nullable(),
  /** How many links of the chain on stage are revealed. */
  revealed: z.number(),
  votedIds: z.array(z.string()),
  /** linkId -> votes, during `vote` and `favourite`. */
  voteCounts: z.record(z.string(), z.number()).nullable(),
  /** The chain's winning link, during `favourite`. */
  favouriteId: z.string().nullable(),
});

export type SketchHostView = z.infer<typeof sketchHostViewSchema>;

export const sketchInputSchema = z.object({
  authorId: z.string(),
  kind: sketchLinkKindSchema,
  text: z.string().nullable(),
  doodle: doodleSchema.nullable(),
});

export type SketchInput = z.infer<typeof sketchInputSchema>;

export const sketchPlayerOptionSchema = z.object({
  id: z.string(),
  kind: sketchLinkKindSchema,
  authorId: z.string(),
  text: z.string().nullable(),
  doodle: doodleSchema.nullable(),
  mine: z.boolean(),
});

export type SketchPlayerOption = z.infer<typeof sketchPlayerOptionSchema>;

export const sketchPlayerViewSchema = z.object({
  phase: sketchPhaseSchema,
  playerCount: z.number(),
  /**
   * When this game began: identifies it, so a phone files its drawing mirror under it. Not
   * re-anchored when a phase is pulled in (the left-player grace).
   */
  gameStartedAt: z.number().optional(),
  roundNumber: z.number(),
  roundCount: z.number(),
  doneCount: z.number(),
  /** The link this player may fill now; null when the round has nothing for them. */
  myLinkId: z.string().nullable(),
  myKind: sketchLinkKindSchema.nullable(),
  /** What this player handed in for that link: their words, or "" for a drawing. */
  myWords: z.string().nullable(),
  myDone: z.boolean(),
  /** The link they were handed, and what they must draw or describe. Null for the seed. */
  input: sketchInputSchema.nullable(),
  /** How many strokes of their own drawing the room holds, for a reconnecting pad. */
  myStrokeCount: z.number(),
  chainNumber: z.number(),
  chainCount: z.number(),
  ownerId: z.string().nullable(),
  presenterId: z.string().nullable(),
  isPresenter: z.boolean(),
  /** The revealed links of the chain on stage; null outside the replay, its vote and its favourite. */
  links: z.array(sketchLinkViewSchema).nullable(),
  options: z.array(sketchPlayerOptionSchema).nullable(),
  myVote: z.string().nullable(),
  votedCount: z.number(),
  voteCounts: z.record(z.string(), z.number()).nullable(),
  favouriteId: z.string().nullable(),
  /** Votes on this player's own link in the chain on stage. */
  myLinkVotes: z.number(),
  /** Points this player earned on the chain on stage. */
  myChainPoints: z.number(),
  totals: z.record(z.string(), z.number()),
});

export type SketchPlayerView = z.infer<typeof sketchPlayerViewSchema>;

/** The kind of the link a round fills: the chain capability's alternation, typed for the game. */
export function kindOfStep(step: number): ChainStepKind {
  return stepKind(step);
}
