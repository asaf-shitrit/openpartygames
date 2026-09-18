// Imposter game: constants, state and view types. Pure JSON, no classes/Map/Set.
import { z } from "zod";
import type { PlayerId } from "@opg/protocol";

// Timing constants (the UI imports these).
export const WORDS_PER_GAME = 6;
export const WORD_CHECK_MS = 8000;
export const VOTE_MS = 45000;
export const REVEAL_MS = 12000;
export const LAST_CHANCE_MS = 15000;
export const RESULT_CAUGHT_MS = 14000;
export const RESULT_ESCAPED_MS = 9000;
export const RESULT_CANCELLED_MS = 6000;

/**
 * Result phase length. `caught` picks the caught/escaped duration; `null`
 * (a cancelled word, imposter kicked mid-word) picks the shortest one.
 */
export function resultDurationMs(caught: boolean | null): number {
 if (caught === true) return RESULT_CAUGHT_MS;
 if (caught === false) return RESULT_ESCAPED_MS;
 return RESULT_CANCELLED_MS;
}

export const TYPING_MIN_INTERVAL_MS = 150;

export const IMPOSTER_MIN_PLAYERS = 3;
export const IMPOSTER_MAX_PLAYERS = 8;
export const IMPOSTER_MINUTES = 15;
export const MAX_GUESS_LENGTH = 40;

export const POINTS_PER_WORD = 1000;
export const POINTS_PER_CORRECT_VOTE = 500;

export const imposterPhaseSchema = z.enum([
 "word-check",
 "clues",
 "vote",
 "reveal",
 "last-chance",
 "result",
]);

export type ImposterPhase = z.infer<typeof imposterPhaseSchema>;

export interface ImposterWord {
 /** Word the crew sees. */
 crew: string;
 /** Word the imposter sees. */
 decoy: string;
 imposterId: PlayerId;
}

export interface ImposterState {
 phase: ImposterPhase;
 wordIndex: number;
 words: ImposterWord[];
 /** Current roster (game players minus anyone kicked). */
 playerIds: PlayerId[];
 /** Speaking order for the current word, built at word start. */
 clueOrder: PlayerId[];
 /** Index into clueOrder of the speaker whose turn it is. */
 clueIndex: number;
  /**
   * Epoch ms the current clue turn began. The clue phase has no deadline, so this is what
   * tells a phone a turn is fresh rather than one it reconnected into mid-way.
   */
  turnStartedAt: number;
 doneSpeakerIds: PlayerId[];
 /** voterId -> targetId for the current word. */
 votes: Record<PlayerId, PlayerId>;
 /** targetId -> voterIds, filled when the vote closes. */
 tally: Record<PlayerId, PlayerId[]>;
 /** null before the reveal for the current word. */
 caught: boolean | null;
 /** Raw trimmed guess text from the imposter, null when they did not guess. */
 guess: string | null;
 guessCorrect: boolean | null;
 pointsThisWord: Record<PlayerId, number>;
 scores: Record<PlayerId, number>;
 finished: boolean;
 /** Epoch ms of the current phase timeout; null once finished. */
 deadline: number | null;
 /**
  * The roster the current reveal was built for, frozen when the votes closed so a kick
  * mid-reveal cannot reshuffle the ceremony. Absent outside a reveal and on older saves.
  */
 revealPlayerIds?: PlayerId[];
 /**
  * Length of the imposter's in-progress guess during last-chance, so the TV
  * can grow/shrink a row of blank tiles without ever seeing the letters.
  * Optional: snapshots saved before this field existed lack it.
  */
 guessLength?: number;
 /** `ctx.now` of the last accepted `typing` update, or null/undefined. */
 guessLengthAt?: number | null;
 /**
  * One record per word whose points were scored (never a cancelled word), used to
  * compute end-of-game awards. Optional: snapshots saved before this field existed
  * lack it.
  */
 history?: ImposterWordRecord[];
}

/** What happened in one scored word, kept for end-of-game awards. */
export interface ImposterWordRecord {
 playerIds: PlayerId[];
 imposterId: PlayerId;
 votes: Record<PlayerId, PlayerId>;
 caught: boolean;
 guessCorrect: boolean;
}

export type ImposterAction =
 | { type: "done" }
 | { type: "vote"; target: PlayerId }
 | { type: "guess"; text: string }
 | { type: "typing"; length: number };

/** Wire shape of the host view. Parsing at the web boundary strips unknown keys. */
export const imposterHostViewSchema = z.object({
 phase: imposterPhaseSchema,
 wordNumber: z.number(),
 wordCount: z.number(),
 playerIds: z.array(z.string()),
 clueOrder: z.array(z.string()),
 currentSpeakerId: z.string().nullable(),
 doneSpeakerIds: z.array(z.string()),
 votedIds: z.array(z.string()),
 totals: z.record(z.string(), z.number()),
 // From reveal on, otherwise null.
 tally: z.record(z.string(), z.array(z.string())).nullable(),
 /** The roster the reveal was built for; null outside the reveal and on older payloads. */
 revealPlayerIds: z.array(z.string()).nullable().optional(),
 imposterId: z.string().nullable(),
 caught: z.boolean().nullable(),
 decoyWord: z.string().nullable(),
 // In result only, otherwise null.
 crewWord: z.string().nullable(),
 guess: z.string().nullable(),
 guessCorrect: z.boolean().nullable(),
 pointsThisWord: z.record(z.string(), z.number()).nullable(),
 // The guess LENGTH only, during last-chance; never the letters. Null otherwise.
 guessLength: z.number().nullable(),
});

export type ImposterHostView = z.infer<typeof imposterHostViewSchema>;

/** Wire shape of a player's own view; never reveals anyone else's secrets. */
export const imposterPlayerViewSchema = z.object({
 phase: imposterPhaseSchema,
 wordNumber: z.number(),
 wordCount: z.number(),
 /** The player's own role. Never reveals anyone else's role. */
 role: z.enum(["crew", "imposter"]),
 /** The player's own word (decoy for the imposter). */
 word: z.string().nullable(),
 clueOrder: z.array(z.string()),
 currentSpeakerId: z.string().nullable(),
 isMyTurn: z.boolean(),
 /** Epoch ms this clue turn began, so a phone can tell a fresh turn from a reconnect. */
 turnStartedAt: z.number(),
 nextSpeakerId: z.string().nullable(),
 myVote: z.string().nullable(),
 voteCandidates: z.array(z.string()),
 votedCount: z.number(),
 totals: z.record(z.string(), z.number()),
 // From reveal on, otherwise null.
 imposterId: z.string().nullable(),
 caught: z.boolean().nullable(),
 // During last-chance, otherwise null.
 isMyLastChance: z.boolean(),
 decoyWord: z.string().nullable(),
 myGuess: z.string().nullable(),
 // In result only, otherwise null.
 crewWord: z.string().nullable(),
 guess: z.string().nullable(),
 guessCorrect: z.boolean().nullable(),
 myPoints: z.number().nullable(),
});

export type ImposterPlayerView = z.infer<typeof imposterPlayerViewSchema>;
