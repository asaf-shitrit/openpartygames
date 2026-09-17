// Most Likely To: pure, deterministic GameDefinition. No I/O, no Date.now, no Math.random.
import { z, type ZodType } from "zod";
import type { GameContext, GameDefinition, Rng, SuperlativeContent } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import { addPoints, matchedVoters, revealOutcome, roundPoints, tallyVotes } from "./rules";
import {
  MLT_MAX_PLAYERS,
  MLT_MIN_PLAYERS,
  MLT_MINUTES,
  REVEAL_MS,
  ROUNDS_PER_GAME,
  VOTE_MS,
  type MltAction,
  type MltHostView,
  type MltPhase,
  type MltPlayerView,
  type MltRoundRecord,
  type MltState,
} from "./state";
import { buildHostView, buildPlayerView } from "./views";
import { mostLikelyToAwards } from "./awards";

export type {
  MltAction,
  MltHostView,
  MltOutcome,
  MltPhase,
  MltPlayerView,
  MltReveal,
  MltRoundRecord,
  MltState,
} from "./state";
export {
  MIN_VOTES_FOR_PICK,
  MLT_MAX_PLAYERS,
  MLT_MIN_PLAYERS,
  MLT_MINUTES,
  POINTS_PER_MATCH,
  REVEAL_MS,
  ROUNDS_PER_GAME,
  VOTE_MS,
  mltHostViewSchema,
  mltOutcomeSchema,
  mltPhaseSchema,
  mltPlayerViewSchema,
  mltRevealSchema,
} from "./state";
export { mostLikelyToAwards } from "./awards";

type Ctx = GameContext<SuperlativeContent>;

// ---------- Setup ----------

export function setup(ctx: Ctx): MltState {
  const playerIds = ctx.players.map((p) => p.id);
  const prompts = ctx.rng
    .shuffle(ctx.content.items)
    .slice(0, ROUNDS_PER_GAME);
  const initialScores: Record<PlayerId, number> = {};
  for (const id of playerIds) initialScores[id] = 0;
  const finished = prompts.length === 0;
  return {
    phase: "vote",
    roundIndex: 0,
    prompts,
    playerIds,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    scores: initialScores,
    finished,
    deadline: finished ? null : ctx.now + VOTE_MS,
    history: [],
  };
}

// ---------- Parsing ----------

export const mltActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vote"), target: z.string().min(1).max(128) }),
]) satisfies ZodType<MltAction>;

// ---------- Phase transitions ----------

function allConnectedVoted(state: MltState, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) =>
    state.playerIds.includes(id),
  );
  if (connected.length === 0) return false;
  return connected.every((id) => state.votes[id] !== undefined);
}

export function startReveal(state: MltState, ctx: Ctx): MltState {
  const tally = tallyVotes(state.votes, state.playerIds);
  const outcome = revealOutcome(tally, state.playerIds);
  const matchedIds = matchedVoters(state.votes, outcome, state.playerIds);
  const points = roundPoints(state.playerIds, matchedIds);
  return {
    ...state,
    phase: "reveal",
    reveal: {
      playerIds: [...state.playerIds],
      tally,
      outcome,
      matchedIds,
    },
    pointsThisRound: points,
    scores: addPoints(state.scores, points),
    deadline: ctx.now + REVEAL_MS,
  };
}

function endRound(state: MltState, ctx: Ctx): MltState {
  const history: MltRoundRecord[] = [
    ...state.history,
    { votes: { ...state.votes }, matchedIds: [...(state.reveal?.matchedIds ?? [])] },
  ];
  const nextIndex = state.roundIndex + 1;
  if (nextIndex >= state.prompts.length) {
    return { ...state, history, finished: true, deadline: null };
  }
  return {
    ...state,
    history,
    roundIndex: nextIndex,
    phase: "vote",
    votes: {},
    reveal: null,
    pointsThisRound: {},
    deadline: ctx.now + VOTE_MS,
  };
}

// ---------- GameDefinition hooks ----------

function applyVote(
  state: MltState,
  playerId: PlayerId,
  target: PlayerId,
  ctx: Ctx,
): MltState {
  if (state.phase !== "vote") return state;
  if (!state.playerIds.includes(playerId)) return state;
  if (state.votes[playerId] !== undefined) return state; // one vote only
  if (!state.playerIds.includes(target)) return state;
  const votes = { ...state.votes, [playerId]: target };
  const next = { ...state, votes };
  return allConnectedVoted(next, ctx) ? startReveal(next, ctx) : next;
}

export function onAction(
  state: MltState,
  playerId: PlayerId,
  action: MltAction,
  ctx: Ctx,
): MltState {
  if (state.finished) return state;
  return applyVote(state, playerId, action.target, ctx);
}

export function nextDeadline(state: MltState): number | null {
  return state.deadline;
}

type DeadlineHandler = (state: MltState, ctx: Ctx) => MltState;

const DEADLINE_HANDLERS = {
  vote: startReveal,
  reveal: endRound,
} satisfies Record<MltPhase, DeadlineHandler>;

export function onDeadline(state: MltState, ctx: Ctx): MltState {
  if (state.finished) return state;
  return DEADLINE_HANDLERS[state.phase](state, ctx);
}

/** Votes that survive a removal: the kicked player's own vote and votes for them. */
function survivingVotes(state: MltState, playerId: PlayerId) {
  const votes: Record<PlayerId, PlayerId> = {};
  for (const voter of Object.keys(state.votes)) {
    const target = state.votes[voter];
    if (target === undefined) continue;
    if (voter === playerId || target === playerId) continue;
    votes[voter] = target;
  }
  return votes;
}

export function onPlayerRemoved(
  state: MltState,
  playerId: PlayerId,
  ctx: Ctx,
): MltState {
  if (!state.playerIds.includes(playerId)) return state;

  const playerIds = state.playerIds.filter((id) => id !== playerId);
  const nextScores = { ...state.scores };
  delete nextScores[playerId];
  const pointsThisRound = { ...state.pointsThisRound };
  delete pointsThisRound[playerId];

  const base: MltState = {
    ...state,
    playerIds,
    scores: nextScores,
    pointsThisRound,
  };

  if (state.phase !== "vote") return base;

  const votes = survivingVotes(state, playerId);
  const next = { ...base, votes };
  return allConnectedVoted(next, ctx) ? startReveal(next, ctx) : next;
}

export function isOver(state: MltState): boolean {
  return state.finished;
}

export function scores(state: MltState): Record<PlayerId, number> {
  return state.scores;
}

export function bot(view: MltPlayerView, rng: Rng): MltAction | null {
  if (
    view.phase === "vote" &&
    view.myVote === null &&
    view.voteCandidates.length > 0
  ) {
    return { type: "vote", target: rng.pick(view.voteCandidates) };
  }
  return null;
}

export const mostLikelyTo: GameDefinition<
  MltState,
  MltAction,
  MltHostView,
  MltPlayerView,
  SuperlativeContent
> = {
  id: "most-likely-to",
  name: "Most Likely To",
  blurb: "Vote on who fits the prompt. Score by reading the room.",
  minPlayers: MLT_MIN_PLAYERS,
  maxPlayers: MLT_MAX_PLAYERS,
  minutes: MLT_MINUTES,
  contentKind: "superlatives",
  setup,
  actionSchema: mltActionSchema,
  onAction,
  nextDeadline,
  onDeadline,
  onPlayerRemoved,
  hostView: (state) => buildHostView(state),
  playerView: (state, playerId) => buildPlayerView(state, playerId),
  isOver,
  scores,
  bot,
  awards: mostLikelyToAwards,
};
