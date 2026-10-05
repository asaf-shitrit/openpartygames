// Doodle Bluff: constants, state and view types. Pure JSON, no classes/Map/Set.
//
// Drawings use the canvas capability's stroke model from @opg/sdk, the same one the pad encodes
// with, so the rules validate exactly what a phone can send.
import { z, type ZodType } from "zod";
import type { PlayerId } from "@opg/protocol";
import { doodleSchema, MAX_STROKES_PER_DOODLE, strokeSchema, type Doodle, type Stroke } from "@opg/sdk";

// ---------- Timing constants ----------

export const DRAW_MS = 130000;
export const TITLE_MS = 35000;
export const VOTE_MS = 30000;
/** Fixed for every reveal, one storyboard, like Most Likely To's REVEAL_MS. */
export const REVEAL_MS = 12000;
export const GALLERY_MS = 20000;

export const TITLED_MAX = 10;

export function shownCount(playerCount: number): number {
  return Math.min(2 * playerCount, TITLED_MAX);
}

export const DOODLE_MIN_PLAYERS = 3;
export const DOODLE_MAX_PLAYERS = 8;
export const DOODLE_MINUTES = 15;

export const MIN_STROKES = 1;
export const MIN_OPTIONS = 4;
export const TITLE_MAX_LENGTH = 40;

export const POINTS_TRUTH = 1000;
export const POINTS_PER_FOOL = 500;
export const POINTS_PER_FOUND = 500;

/** Rules-level sanity bound on one "strokes" action; the frame cap is the hard bound. */
export const MAX_POINTS_PER_CHUNK = 400;

/** The two drawing slots a player fills during `draw`, 0 and 1. */
export type DrawingSlot0or1 = 0 | 1;

export function drawingIdOf(playerId: PlayerId, slot: DrawingSlot0or1): string {
  return `${playerId}:${slot}`;
}

// ---------- Phases ----------

export const doodlePhaseSchema = z.enum(["draw", "title", "vote", "reveal", "gallery"]);

export type DoodlePhase = z.infer<typeof doodlePhaseSchema>;

export const doodleTitleErrorSchema = z.enum(["invalid", "truth", "duplicate"]);

export type DoodleTitleError = z.infer<typeof doodleTitleErrorSchema>;

// ---------- Game state ----------

/** One of the 2n drawings made in the game. Stays in state until the gallery, shown or not. */
export interface DrawingSlot {
  artistId: PlayerId;
  promptId: string;
  /** The secret title-to-guess. Never sent to any view before that drawing's reveal. */
  prompt: string;
  houseTitles: string[];
  doodle: Doodle;
  /** Set by the artist's own "doodle-done"; deadline can close the phase without it. */
  done: boolean;
}

export interface DoodleOption {
  /** "o1", "o2", ... in shuffled display order. */
  id: string;
  text: string;
  /** The player whose title this is, or null for the truth and house titles. */
  authorId: PlayerId | null;
  isTruth: boolean;
  /** True for a house title that filled the ballot. */
  isHouse?: boolean;
}

const doodleFooledTitleSchema = z.object({
  optionId: z.string(),
  text: z.string(),
  authorId: z.string().nullable(),
  fooledIds: z.array(z.string()),
  points: z.number(),
});

export type DoodleFooledTitle = z.infer<typeof doodleFooledTitleSchema>;

export const doodleRevealSchema = z.object({
  artistId: z.string(),
  drawingId: z.string(),
  doodle: doodleSchema,
  truthOptionId: z.string(),
  /** The real title, revealed. */
  prompt: z.string(),
  foundByIds: z.array(z.string()),
  titles: z.array(doodleFooledTitleSchema),
  /** POINTS_PER_FOUND * foundByIds.length; 0 when nobody found it, never negative. */
  artistPoints: z.number(),
});

export type DoodleReveal = z.infer<typeof doodleRevealSchema>;

/** What happened in one shown drawing's reveal, kept for end-of-game awards. */
export interface DoodleRoundRecord {
  drawingId: string;
  artistId: PlayerId;
  foundByIds: PlayerId[];
  titles: Array<{ authorId: PlayerId | null; fooledIds: PlayerId[] }>;
}

export interface DoodleState {
  phase: DoodlePhase;
  /** `ctx.now` at setup. Optional: a game saved before it existed has none. */
  startedAt?: number;
  /** Current roster (game players minus anyone kicked). */
  playerIds: PlayerId[];
  /** Every drawing made in the game, keyed by drawingId, until it is dropped (see rules.ts). */
  drawings: Record<string, DrawingSlot>;
  /** Every drawingId ever created, in player-join order; the gallery's row order. */
  drawOrder: string[];
  /** The round-robin shown-drawing order, built once when `draw` ends. */
  queueOrder: string[];
  /** How far `queueOrder` has been consumed. */
  queuePos: number;
  /** How many rounds have been started (title/vote/reveal), capped at TITLED_MAX. */
  shownCount: number;
  /** shownCount(playerIds.length) at the moment `draw` ended; a display estimate only. */
  plannedRounds: number;
  currentDrawingId: string | null;
  /** authorId -> accepted title, for the drawing currently on stage. */
  titles: Record<PlayerId, string>;
  titleErrors: Record<PlayerId, DoodleTitleError>;
  /** Built when voting starts; null before then. */
  options: DoodleOption[] | null;
  /** voterId -> optionId, for the drawing currently on stage. */
  votes: Record<PlayerId, string>;
  /** Set when the vote closes; frozen (never recomputed) once set, like Most Likely To's reveal. */
  reveal: DoodleReveal | null;
  pointsThisRound: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  finished: boolean;
  /** Epoch ms of the current phase timeout; null once finished. */
  deadline: number | null;
  history: DoodleRoundRecord[];
}

// ---------- Actions ----------

/**
 * "strokes" appends at exactly `from`: the rules take a chunk only when `from` is the drawing's
 * current stroke count, and drop it otherwise. The phone's cursor therefore has to track the
 * room's own count, never the pad's — see `myStrokeCounts` and games/doodle-bluff/src/ui/PhoneDraw.tsx.
 *
 * "truncate" is the shrinking counterpart undo and clear need: it drops the drawing back to `to`
 * strokes, and, like "strokes", only when `from` is exactly the drawing's current stroke count.
 * That CAS check is the whole idempotency story for both action types, and it answers the
 * question that sank the first attempt at this (issue #37): what does a stale duplicate do?
 * Nothing — a replayed "strokes" or "truncate" carries a `from` that no longer matches the room's
 * count (something else landed first, an append or a truncate), so the rules drop it, same as
 * today. Unlike the reverted design, "strokes" never overwrites a suffix — it only ever appends —
 * so a stale `from: 0` chunk can no longer legitimately turn into a rewrite; shrinking is only
 * ever expressed by "truncate", gated by the same exact-count check.
 */
export type DoodleAction =
  | { type: "strokes"; drawingId: string; from: number; strokes: Stroke[] }
  | { type: "truncate"; drawingId: string; from: number; to: number }
  | { type: "doodle-done"; drawingId: string }
  | { type: "title"; text: string }
  | { type: "vote"; optionId: string };

export const doodleActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("strokes"),
    drawingId: z.string().min(1).max(128),
    from: z.int().min(0),
    strokes: z.array(strokeSchema).min(1).max(MAX_STROKES_PER_DOODLE),
  }),
  z.object({
    type: z.literal("truncate"),
    drawingId: z.string().min(1).max(128),
    /** Expected current stroke count; a stale value (anything else landed since) is a no-op. */
    from: z.int().min(0),
    /** The stroke count to drop to. Must be less than `from`: rules.ts rejects anything else. */
    to: z.int().min(0),
  }),
  z.object({ type: z.literal("doodle-done"), drawingId: z.string().min(1).max(128) }),
  z.object({ type: z.literal("title"), text: z.string().max(200) }),
  z.object({ type: z.literal("vote"), optionId: z.string().min(1).max(64) }),
]) satisfies ZodType<DoodleAction>;

// ---------- Views ----------

export const doodleHostOptionSchema = z.object({ id: z.string(), text: z.string() });

export type DoodleHostOption = z.infer<typeof doodleHostOptionSchema>;

export const doodlePlayerOptionSchema = z.object({ id: z.string(), text: z.string(), mine: z.boolean() });

export type DoodlePlayerOption = z.infer<typeof doodlePlayerOptionSchema>;

export const doodleGalleryEntrySchema = z.object({
  drawingId: z.string(),
  artistId: z.string(),
  doodle: doodleSchema,
  /** The real title. Safe here: the gallery only appears once the game's secrets are all spent. */
  title: z.string(),
  shown: z.boolean(),
  foundByCount: z.number().nullable(),
});

export type DoodleGalleryEntry = z.infer<typeof doodleGalleryEntrySchema>;

/** Wire shape of the host view. Never carries a title's content before the reveal. */
export const doodleHostViewSchema = z.object({
  phase: doodlePhaseSchema,
  playerIds: z.array(z.string()),
  /** Players who have finished both drawings, during `draw`. */
  drawnIds: z.array(z.string()),
  /** Finished drawings per player, 0-2, during `draw`. Empty in every other phase. */
  drawnCounts: z.record(z.string(), z.number()),
  roundNumber: z.number(),
  roundCount: z.number(),
  artistId: z.string().nullable(),
  doodle: doodleSchema.nullable(),
  writtenIds: z.array(z.string()),
  votedIds: z.array(z.string()),
  options: z.array(doodleHostOptionSchema).nullable(),
  reveal: doodleRevealSchema.nullable(),
  pointsThisRound: z.record(z.string(), z.number()).nullable(),
  totals: z.record(z.string(), z.number()),
  gallery: z.array(doodleGalleryEntrySchema).nullable(),
});

export type DoodleHostView = z.infer<typeof doodleHostViewSchema>;

const doodlePlayerPromptSchema = z.object({ drawingId: z.string(), prompt: z.string() });

export type DoodlePlayerPrompt = z.infer<typeof doodlePlayerPromptSchema>;

/** Wire shape of a player's own view: never another player's prompt, title or vote. */
export const doodlePlayerViewSchema = z.object({
  phase: doodlePhaseSchema,
  playerCount: z.number(),
  /**
   * When this game began. It identifies the game, so a phone files its drawing mirror under it:
   * unlike the phase timer's start it is not re-anchored when a phase is pulled in (the
   * left-player grace). Absent in views from before it existed.
   */
  gameStartedAt: z.number().optional(),
  /** The viewer's own two secret prompts, during `draw`. */
  myPrompts: z.array(doodlePlayerPromptSchema),
  /** drawingId -> accepted stroke count, so a reconnecting phone knows where to resume. */
  myStrokeCounts: z.record(z.string(), z.number()),
  myDone: z.record(z.string(), z.boolean()),
  drawnCount: z.number(),
  roundNumber: z.number(),
  roundCount: z.number(),
  currentDrawingId: z.string().nullable(),
  isArtist: z.boolean(),
  doodle: doodleSchema.nullable(),
  myTitle: z.string().nullable(),
  titleError: doodleTitleErrorSchema.nullable(),
  titledCount: z.number(),
  options: z.array(doodlePlayerOptionSchema).nullable(),
  myVote: z.string().nullable(),
  votedCount: z.number(),
  reveal: doodleRevealSchema.nullable(),
  myPoints: z.number().nullable(),
  totals: z.record(z.string(), z.number()),
});

export type DoodlePlayerView = z.infer<typeof doodlePlayerViewSchema>;
