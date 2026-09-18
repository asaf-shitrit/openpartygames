// Doodle Bluff: constants, state and view types. Pure JSON, no classes/Map/Set.
//
// A stroke is numbers, never an ImageData, a Path2D or a canvas-produced data URL, matching the
// `canvas` capability's data model at packages/ui/src/doodle/types.ts. The constants below mirror
// that file's values; they are kept local (not imported from @opg/ui) so this package stays a pure
// server-side game with no React in its dependency graph (plan/0003-doodle-bluff.md).
import { z, type ZodType } from "zod";
import type { PlayerId } from "@opg/protocol";

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

// ---------- The stroke model (mirrors packages/ui/src/doodle/types.ts) ----------

export const GRID = 1024;
export const STROKE_MS_CAP = 3000;
export const GAP_MS_CAP = 1000;
export const MAX_INK_INDEX = 31;

export const MAX_STROKES_PER_DOODLE = 64;
export const MAX_POINTS_PER_STROKE = 128;
export const MAX_POINTS_PER_DOODLE = 1200;
/** Rules-level sanity bound on one "strokes" action; the frame cap is the hard bound. */
export const MAX_POINTS_PER_CHUNK = 400;

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

/** [x0, y0, dx1, dy1, ...]: the first point is absolute, on the grid; later points are deltas. */
const strokePointsSchema = z
  .array(z.int())
  .min(2)
  .max(MAX_POINTS_PER_STROKE * 2)
  .refine((p) => p.length % 2 === 0, "odd-length point array")
  .refine(
    (p) => inRange(p[0] ?? Number.NaN, 0, GRID - 1) && inRange(p[1] ?? Number.NaN, 0, GRID - 1),
    "first point out of grid bounds",
  )
  .refine((p) => p.slice(2).every((n) => inRange(n, -(GRID - 1), GRID - 1)), "delta out of grid bounds");

export const strokeSchema = z.object({
  /** Palette index. Decoration only: no rule reads it. */
  c: z.int().min(0).max(MAX_INK_INDEX),
  /** Stroke duration in TICK_MS units, capped at STROKE_MS_CAP. */
  d: z.int().min(0).max(STROKE_MS_CAP),
  /** Pause before this stroke, in TICK_MS units, capped at GAP_MS_CAP. */
  g: z.int().min(0).max(GAP_MS_CAP),
  p: strokePointsSchema,
});

export type Stroke = z.infer<typeof strokeSchema>;

export const doodleSchema = z.object({
  v: z.literal(1),
  s: z.array(strokeSchema).max(MAX_STROKES_PER_DOODLE),
});

export type Doodle = z.infer<typeof doodleSchema>;

export function emptyDoodle(): Doodle {
  return { v: 1, s: [] };
}

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

export type DoodleAction =
  | { type: "strokes"; drawingId: string; from: number; strokes: Stroke[] }
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
