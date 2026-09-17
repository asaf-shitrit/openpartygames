// View builders. During the vote phase nobody's view may say who voted for whom.
import type { PlayerId } from "@opg/protocol";
import type { MltHostView, MltPlayerView, MltState } from "./state";

function roundNumber(state: MltState): number {
  return Math.min(state.roundIndex, state.prompts.length - 1) + 1;
}

function promptOf(state: MltState): string {
  return state.prompts[state.roundIndex]?.prompt ?? "";
}

export function buildHostView(state: MltState): MltHostView {
  return {
    phase: state.phase,
    roundNumber: roundNumber(state),
    roundCount: state.prompts.length,
    prompt: promptOf(state),
    playerIds: [...state.playerIds],
    votedIds:
      state.phase === "vote"
        ? state.playerIds.filter((id) => state.votes[id] !== undefined)
        : [],
    totals: { ...state.scores },
    reveal: state.reveal,
    pointsThisRound: state.phase === "reveal" ? { ...state.pointsThisRound } : null,
  };
}

export function buildPlayerView(
  state: MltState,
  playerId: PlayerId,
): MltPlayerView {
  return {
    phase: state.phase,
    roundNumber: roundNumber(state),
    roundCount: state.prompts.length,
    prompt: promptOf(state),
    voteCandidates: [...state.playerIds],
    myVote: state.votes[playerId] ?? null,
    votedCount: Object.keys(state.votes).length,
    playerCount: state.playerIds.length,
    totals: { ...state.scores },
    reveal: state.reveal,
    myPoints:
      state.phase === "reveal" ? (state.pointsThisRound[playerId] ?? 0) : null,
  };
}
