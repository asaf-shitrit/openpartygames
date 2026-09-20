import { z, type ZodType } from "zod";
// Imposter: pure, deterministic GameDefinition. No I/O, no Date.now, no Math.random.
import type {
  GameContext,
  GameDefinition,
  Rng,
  WordPairContent,
} from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import { isCaught, normalizeAnswer, scoreWord, tallyVotes } from "./rules";
import {
  IMPOSTER_MAX_PLAYERS,
  IMPOSTER_MIN_PLAYERS,
  IMPOSTER_MINUTES,
  LAST_CHANCE_MS,
  MAX_GUESS_LENGTH,
  REVEAL_MS,
  TYPING_MIN_INTERVAL_MS,
  CLUE_STALL_MS,
  VOTE_MS,
  WORD_CHECK_MS,
  WORDS_PER_GAME,
  resultDurationMs,
  type ImposterAction,
  type ImposterHostView,
  type ImposterPhase,
  type ImposterPlayerView,
  type ImposterState,
  type ImposterWord,
  type ImposterWordRecord,
} from "./state";
import { buildHostView, buildPlayerView } from "./views";
import { imposterAwards } from "./awards";

export type {
  ImposterAction,
  ImposterHostView,
  ImposterPhase,
  ImposterPlayerView,
  ImposterState,
  ImposterWord,
  ImposterWordRecord,
} from "./state";
export { imposterAwards } from "./awards";
export {
  CLUE_STALL_MS,
  IMPOSTER_MAX_PLAYERS,
  IMPOSTER_MIN_PLAYERS,
  IMPOSTER_MINUTES,
  LAST_CHANCE_MS,
  MAX_GUESS_LENGTH,
  POINTS_PER_CORRECT_VOTE,
  POINTS_PER_WORD,
  RESULT_CANCELLED_MS,
  RESULT_CAUGHT_MS,
  RESULT_ESCAPED_MS,
  REVEAL_MS,
  TYPING_MIN_INTERVAL_MS,
  VOTE_MS,
  WORD_CHECK_MS,
  WORDS_PER_GAME,
  resultDurationMs,
  imposterHostViewSchema,
  imposterPlayerViewSchema,
} from "./state";
export { normalizeAnswer } from "./rules";

type Ctx = GameContext<WordPairContent>;

// ---------- Setup ----------

function pickImposter(
  rng: Rng,
  playerIds: readonly PlayerId[],
  avoid: PlayerId | null,
): PlayerId {
  if (avoid !== null && playerIds.length > 1) {
    const eligible = playerIds.filter((id) => id !== avoid);
    return rng.pick(eligible);
  }
  return rng.pick(playerIds);
}

/** Rotates the speaking order by wordIndex and keeps the imposter out of first place. */
export function buildClueOrder(
  playerIds: readonly PlayerId[],
  imposterId: PlayerId,
  wordIndex: number,
): PlayerId[] {
  const n = playerIds.length;
  if (n === 0) return [];
  const start = wordIndex % n;
  const order = [...playerIds.slice(start), ...playerIds.slice(0, start)];
  const first = order[0];
  const second = order[1];
  if (first !== undefined && second !== undefined && first === imposterId) {
    order[0] = second;
    order[1] = first;
  }
  return order;
}

export function setup(ctx: Ctx): ImposterState {
  const playerIds = ctx.players.map((p) => p.id);
  const picks = ctx.rng
    .shuffle(ctx.content.items)
    .slice(0, Math.min(WORDS_PER_GAME, ctx.content.items.length));
  const words: ImposterWord[] = [];
  let previousImposter: PlayerId | null = null;
  for (const pair of picks) {
    const swap = ctx.rng.int(2) === 1;
    const imposterId = pickImposter(ctx.rng, playerIds, previousImposter);
    previousImposter = imposterId;
    words.push({
      crew: swap ? pair.decoy : pair.crew,
      decoy: swap ? pair.crew : pair.decoy,
      imposterId,
    });
  }
  const nextScores: Record<PlayerId, number> = {};
  for (const id of playerIds) nextScores[id] = 0;
  const first = words[0];
  return {
    phase: "word-check",
    wordIndex: 0,
    words,
    playerIds,
    clueOrder:
      first === undefined ? [] : buildClueOrder(playerIds, first.imposterId, 0),
    clueIndex: 0,
    turnStartedAt: 0,
    doneSpeakerIds: [],
    votes: {},
    tally: {},
    caught: null,
    guess: null,
    guessCorrect: null,
    pointsThisWord: {},
    scores: nextScores,
    finished: false,
    deadline: ctx.now + WORD_CHECK_MS,
    guessLength: 0,
    guessLengthAt: null,
  };
}

// ---------- Parsing ----------

export const imposterActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("vote"), target: z.string().min(1).max(128) }),
  z.object({
    type: z.literal("guess"),
    text: z.string().trim().min(1).max(MAX_GUESS_LENGTH),
  }),
  z.object({
    type: z.literal("typing"),
    length: z.number().int().min(0).max(MAX_GUESS_LENGTH),
  }),
]) satisfies ZodType<ImposterAction>;

// ---------- Phase transitions ----------

function startClues(state: ImposterState, ctx: Ctx): ImposterState {
  let index = 0;
  while (index < state.clueOrder.length) {
    const id = state.clueOrder[index];
    if (id !== undefined && ctx.connectedIds.includes(id)) break;
    index += 1;
  }
  if (index >= state.clueOrder.length) return startVote(state, ctx);
  return {
    ...state,
    phase: "clues",
    clueIndex: index,
    doneSpeakerIds: [],
    turnStartedAt: ctx.now,
    // The table sets the pace: no countdown is shown, and a turn normally ends on "I'm done",
    // a VIP skip, or the speaker disconnecting (see onPlayersChanged). The deadline is only a
    // backstop for a tap that never lands — see CLUE_STALL_MS.
    deadline: ctx.now + CLUE_STALL_MS,
  };
}

function startVote(state: ImposterState, ctx: Ctx): ImposterState {
  return { ...state, phase: "vote", deadline: ctx.now + VOTE_MS };
}

function startReveal(state: ImposterState, ctx: Ctx): ImposterState {
  const word = state.words[state.wordIndex];
  const tally = tallyVotes(state.votes);
  const caught =
    word === undefined
      ? false
      : isCaught(tally, word.imposterId, state.playerIds);
  return {
    ...state,
    phase: "reveal",
    tally,
    caught,
    revealPlayerIds: [...state.playerIds],
    deadline: ctx.now + REVEAL_MS,
  };
}

function startLastChance(state: ImposterState, ctx: Ctx): ImposterState {
  return {
    ...state,
    phase: "last-chance",
    deadline: ctx.now + LAST_CHANCE_MS,
    guessLength: 0,
    guessLengthAt: null,
  };
}

function resultWithoutWord(state: ImposterState, ctx: Ctx): ImposterState {
  return {
    ...state,
    phase: "result",
    pointsThisWord: {},
    deadline: ctx.now + resultDurationMs(state.caught),
  };
}

/** Records what happened for this scored word, for end-of-game awards. */
function recordWordHistory(
  state: ImposterState,
  word: ImposterWord,
): ImposterWordRecord[] {
  const record: ImposterWordRecord = {
    playerIds: [...state.playerIds],
    imposterId: word.imposterId,
    votes: { ...state.votes },
    caught: state.caught === true,
    guessCorrect: state.guessCorrect === true,
  };
  return [...(state.history ?? []), record];
}

function addWordPoints(
  state: ImposterState,
  ctx: Ctx,
  word: ImposterWord,
): ImposterState {
  const points = scoreWord(
    word,
    { caught: state.caught, guessCorrect: state.guessCorrect },
    state.tally,
    state.playerIds,
  );
  const nextScores = { ...state.scores };
  for (const id of Object.keys(points)) {
    nextScores[id] = (nextScores[id] ?? 0) + (points[id] ?? 0);
  }
  return {
    ...state,
    phase: "result",
    pointsThisWord: points,
    scores: nextScores,
    deadline: ctx.now + resultDurationMs(state.caught),
    history: recordWordHistory(state, word),
  };
}

function startResult(state: ImposterState, ctx: Ctx): ImposterState {
  const word = state.words[state.wordIndex];
  if (word === undefined) return resultWithoutWord(state, ctx);
  return addWordPoints(state, ctx, word);
}

function startNextWord(state: ImposterState, ctx: Ctx): ImposterState {
  const words = repairNextWordImposter(state, ctx);
  const nextIndex = state.wordIndex + 1;
  const word = words[nextIndex];
  if (word === undefined) return { ...state, finished: true, deadline: null };
  return {
    ...state,
    words,
    phase: "word-check",
    wordIndex: nextIndex,
    clueOrder: buildClueOrder(state.playerIds, word.imposterId, nextIndex),
    clueIndex: 0,
    turnStartedAt: 0,
    doneSpeakerIds: [],
    votes: {},
    tally: {},
    caught: null,
    guess: null,
    guessCorrect: null,
    pointsThisWord: {},
    deadline: ctx.now + WORD_CHECK_MS,
    guessLength: 0,
    guessLengthAt: null,
    revealPlayerIds: undefined,
  };
}

/**
 * The next word, with its imposter re-picked when that player has left: a departed
 * imposter would leave the word with nobody holding the decoy.
 */
function repairNextWordImposter(
  state: ImposterState,
  ctx: Ctx,
): ImposterWord[] {
  const index = state.wordIndex + 1;
  const word = state.words[index];
  if (word === undefined) return state.words;
  if (state.playerIds.includes(word.imposterId)) return state.words;
  if (state.playerIds.length === 0) return state.words;
  const previous = state.words[index - 1]?.imposterId ?? null;
  const imposterId = pickImposter(ctx.rng, state.playerIds, previous);
  return state.words.map((entry, at) =>
    at === index ? { ...entry, imposterId } : entry,
  );
}

/** Next connected, not-yet-done speaker at or after startIndex, or -1. */
function findSpeaker(
  state: ImposterState,
  ctx: Ctx,
  startIndex: number,
): number {
  for (let i = startIndex; i < state.clueOrder.length; i += 1) {
    const id = state.clueOrder[i];
    if (
      id !== undefined &&
      ctx.connectedIds.includes(id) &&
      !state.doneSpeakerIds.includes(id)
    )
      return i;
  }
  return -1;
}

/** Ends the current speaker's turn (timeout counts as done) and moves on. */
function advanceSpeaker(state: ImposterState, ctx: Ctx): ImposterState {
  const speaker = state.clueOrder[state.clueIndex];
  const doneSpeakerIds =
    speaker === undefined || state.doneSpeakerIds.includes(speaker)
      ? state.doneSpeakerIds
      : [...state.doneSpeakerIds, speaker];
  const next = findSpeaker(
    { ...state, doneSpeakerIds },
    ctx,
    state.clueIndex + 1,
  );
  if (next === -1) return startVote({ ...state, doneSpeakerIds }, ctx);
  return {
    ...state,
    clueIndex: next,
    doneSpeakerIds,
    turnStartedAt: ctx.now,
    deadline: ctx.now + CLUE_STALL_MS,
  };
}

function allConnectedVoted(state: ImposterState, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) =>
    state.playerIds.includes(id),
  );
  if (connected.length === 0) return false;
  return connected.every((id) => state.votes[id] !== undefined);
}

// ---------- GameDefinition hooks ----------

function applyDone(
  state: ImposterState,
  playerId: PlayerId,
  ctx: Ctx,
): ImposterState {
  if (state.phase !== "clues") return state;
  if (state.clueOrder[state.clueIndex] !== playerId) return state;
  return advanceSpeaker(state, ctx);
}

function applyVote(
  state: ImposterState,
  playerId: PlayerId,
  target: PlayerId,
  ctx: Ctx,
): ImposterState {
  if (state.phase !== "vote") return state;
  if (!state.playerIds.includes(playerId)) return state;
  if (state.votes[playerId] !== undefined) return state; // one vote only
  if (target === playerId) return state;
  if (!state.playerIds.includes(target)) return state;
  const votes = { ...state.votes, [playerId]: target };
  const next = { ...state, votes };
  return allConnectedVoted(next, ctx) ? startReveal(next, ctx) : next;
}

function applyGuess(
  state: ImposterState,
  playerId: PlayerId,
  text: string,
  ctx: Ctx,
): ImposterState {
  if (state.phase !== "last-chance") return state;
  const word = state.words[state.wordIndex];
  if (word === undefined || word.imposterId !== playerId) return state;
  if (state.guess !== null) return state; // one guess only
  const guessCorrect = normalizeAnswer(text) === normalizeAnswer(word.crew);
  return startResult({ ...state, guess: text, guessCorrect }, ctx);
}

/** True once enough time has passed since the last accepted typing update. */
function typingIntervalElapsed(state: ImposterState, ctx: Ctx): boolean {
  const at = state.guessLengthAt;
  if (at === null || at === undefined) return true;
  return ctx.now - at >= TYPING_MIN_INTERVAL_MS;
}

/**
 * Records the imposter's in-progress guess LENGTH only, throttled to at most
 * one accepted update per `TYPING_MIN_INTERVAL_MS`. Never touches letters.
 */
function applyTyping(
  state: ImposterState,
  playerId: PlayerId,
  length: number,
  ctx: Ctx,
): ImposterState {
  if (state.phase !== "last-chance") return state;
  const word = state.words[state.wordIndex];
  if (word === undefined || word.imposterId !== playerId) return state;
  if (state.guess !== null) return state;
  if (length === (state.guessLength ?? 0)) return state;
  if (!typingIntervalElapsed(state, ctx)) return state;
  return { ...state, guessLength: length, guessLengthAt: ctx.now };
}

export function onAction(
  state: ImposterState,
  playerId: PlayerId,
  action: ImposterAction,
  ctx: Ctx,
): ImposterState {
  if (state.finished) return state;
  if (action.type === "done") return applyDone(state, playerId, ctx);
  if (action.type === "vote")
    return applyVote(state, playerId, action.target, ctx);
  if (action.type === "typing")
    return applyTyping(state, playerId, action.length, ctx);
  return applyGuess(state, playerId, action.text, ctx);
}

export function nextDeadline(state: ImposterState): number | null {
  return state.deadline;
}

function resumeAfterReveal(state: ImposterState, ctx: Ctx): ImposterState {
  return state.caught === true
    ? startLastChance(state, ctx)
    : startResult(state, ctx);
}

function resolveLastChance(state: ImposterState, ctx: Ctx): ImposterState {
  // A missing guess counts as wrong.
  return startResult(
    { ...state, guessCorrect: state.guessCorrect ?? false },
    ctx,
  );
}

type DeadlineHandler = (state: ImposterState, ctx: Ctx) => ImposterState;

const DEADLINE_HANDLERS = {
  "word-check": startClues,
  clues: advanceSpeaker,
  vote: startReveal,
  reveal: resumeAfterReveal,
  "last-chance": resolveLastChance,
  result: startNextWord,
} satisfies Record<ImposterPhase, DeadlineHandler>;

export function onDeadline(state: ImposterState, ctx: Ctx): ImposterState {
  if (state.finished) return state;
  return DEADLINE_HANDLERS[state.phase](state, ctx);
}

/** Votes that survive a removal: the kicked player's own vote and votes for them. */
function survivingVotes(state: ImposterState, playerId: PlayerId) {
  const votes: Record<PlayerId, PlayerId> = {};
  for (const voter of Object.keys(state.votes)) {
    const target = state.votes[voter];
    if (target === undefined) continue;
    if (voter === playerId || target === playerId) continue;
    votes[voter] = target;
  }
  return votes;
}

/**
 * Keep reveal/result tallies consistent with the surviving votes. `caught` stays
 * frozen at the reveal so a kick cannot retroactively change the outcome.
 */
function survivingTally(
  state: ImposterState,
  votes: Record<PlayerId, PlayerId>,
) {
  if (
    state.phase !== "reveal" &&
    state.phase !== "last-chance" &&
    state.phase !== "result"
  ) {
    return {};
  }
  return tallyVotes(votes);
}

/** No imposter means the word cannot be played out: result with no points. */
function cancelWord(base: ImposterState, ctx: Ctx): ImposterState {
  const zero: Record<PlayerId, number> = {};
  for (const id of base.playerIds) zero[id] = 0;
  return {
    ...base,
    phase: "result",
    tally: {},
    caught: null,
    guess: null,
    guessCorrect: null,
    pointsThisWord: zero,
    deadline: ctx.now + resultDurationMs(null),
  };
}

/** Re-anchors the clue turn after a roster change. */
function resumeClues(
  base: ImposterState,
  state: ImposterState,
  playerId: PlayerId,
  ctx: Ctx,
): ImposterState {
  const speaker = state.clueOrder[state.clueIndex];
  if (speaker !== undefined && playerId !== speaker) {
    const index = base.clueOrder.indexOf(speaker);
    return index === -1 ? base : { ...base, clueIndex: index };
  }
  // The speaker was kicked: resume from where they sat.
  const startIndex = state.clueOrder
    .slice(0, state.clueIndex)
    .filter((id) => id !== playerId).length;
  const next = findSpeaker(base, ctx, startIndex);
  if (next === -1) return startVote(base, ctx);
  return { ...base, clueIndex: next, turnStartedAt: ctx.now, deadline: ctx.now + CLUE_STALL_MS };
}

function continueAfterRemoval(
  base: ImposterState,
  state: ImposterState,
  playerId: PlayerId,
  ctx: Ctx,
): ImposterState {
  if (state.phase === "clues") return resumeClues(base, state, playerId, ctx);
  if (state.phase === "vote" && allConnectedVoted(base, ctx))
    return startReveal(base, ctx);
  return base;
}

export function onPlayerRemoved(
  state: ImposterState,
  playerId: PlayerId,
  ctx: Ctx,
): ImposterState {
  if (!state.playerIds.includes(playerId)) return state;

  const votes = survivingVotes(state, playerId);
  const nextScores = { ...state.scores };
  delete nextScores[playerId];
  const nextPoints = { ...state.pointsThisWord };
  delete nextPoints[playerId];

  const base: ImposterState = {
    ...state,
    playerIds: state.playerIds.filter((id) => id !== playerId),
    clueOrder: state.clueOrder.filter((id) => id !== playerId),
    doneSpeakerIds: state.doneSpeakerIds.filter((id) => id !== playerId),
    votes,
    // Once the votes are public the tally is part of the ceremony: it stays as the
    // audience saw it, and a departed voter simply stops scoring (scoreWord skips them).
    tally: isCeremony(state.phase) ? state.tally : survivingTally(state, votes),
    scores: nextScores,
    pointsThisWord: nextPoints,
  };

  const word = state.words[state.wordIndex];
  const imposterRemoved = word !== undefined && word.imposterId === playerId;
  const midWord = state.phase !== "result" && !state.finished;
  if (imposterRemoved && midWord) return cancelWord(base, ctx);
  return continueAfterRemoval(base, state, playerId, ctx);
}

/**
 * A locked phone or a backgrounded tab must not hold the room: if the current speaker just
 * disconnected, their turn passes the same way a timeout used to. Anyone else's connection
 * flipping, or a reconnect, is a no-op here — findSpeaker already skips disconnected
 * players once their turn comes up.
 */
export function onPlayersChanged(state: ImposterState, ctx: Ctx): ImposterState {
  if (state.finished || state.phase !== "clues") return state;
  const speaker = state.clueOrder[state.clueIndex];
  if (speaker === undefined || ctx.connectedIds.includes(speaker)) return state;
  return advanceSpeaker(state, ctx);
}

export function isOver(state: ImposterState): boolean {
  return state.finished;
}

/** True once the votes are public: reveal, last-chance or result. */
function isCeremony(phase: ImposterPhase): boolean {
  return phase === "reveal" || phase === "last-chance" || phase === "result";
}

export function scores(state: ImposterState): Record<PlayerId, number> {
  return state.scores;
}

function clueBot(view: ImposterPlayerView): ImposterAction | null {
  if (view.phase === "clues" && view.isMyTurn) return { type: "done" };
  return null;
}

function voteBot(view: ImposterPlayerView, rng: Rng): ImposterAction | null {
  if (
    view.phase === "vote" &&
    view.myVote === null &&
    view.voteCandidates.length > 0
  ) {
    return { type: "vote", target: rng.pick(view.voteCandidates) };
  }
  return null;
}

function lastChanceBot(view: ImposterPlayerView): ImposterAction | null {
  if (view.phase !== "last-chance" || !view.isMyLastChance) return null;
  if (view.myGuess !== null || view.decoyWord === null) return null;
  return { type: "guess", text: view.decoyWord };
}

export function bot(view: ImposterPlayerView, rng: Rng): ImposterAction | null {
  return clueBot(view) ?? voteBot(view, rng) ?? lastChanceBot(view);
}

export const imposter: GameDefinition<
  ImposterState,
  ImposterAction,
  ImposterHostView,
  ImposterPlayerView,
  WordPairContent
> = {
  id: "imposter",
  name: "Imposter",
  blurb: "One of you has a decoy word. Talk it out, vote them out.",
  noTv: true,
  minPlayers: IMPOSTER_MIN_PLAYERS,
  maxPlayers: IMPOSTER_MAX_PLAYERS,
  minutes: IMPOSTER_MINUTES,
  contentKind: "word-pairs",
  setup,
  actionSchema: imposterActionSchema,
  onAction,
  nextDeadline,
  onDeadline,
  onPlayerRemoved,
  onPlayersChanged,
  hostView: (state) => buildHostView(state),
  playerView: (state, playerId) => buildPlayerView(state, playerId),
  isOver,
  scores,
  bot,
  awards: imposterAwards,
};
