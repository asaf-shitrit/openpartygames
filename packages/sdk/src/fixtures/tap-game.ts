import { z } from "zod";
// Tiny GameDefinition used by the SDK test harness. Three rounds; every player taps
// once per round for +100. A round ends as soon as every *connected* player has tapped,
// or after a 10s deadline. It exists only to exercise RoomCore and runBotPlaythrough.

import type { PlayerId } from "@opg/protocol";
import type { GameDefinition, WordPairContent } from "../types";

export const TAP_ROUNDS = 3;
export const TAP_ROUND_MS = 10_000;
export const TAP_POINTS = 100;

export type TapAction = { type: "tap" };

export interface TapState {
  round: number;
  tapped: PlayerId[];
  scores: Record<PlayerId, number>;
  over: boolean;
  deadline: number | null;
}

export interface TapHostView {
  round: number;
  roundCount: number;
  over: boolean;
  tappedIds: PlayerId[];
  scores: Record<PlayerId, number>;
}

export interface TapPlayerView {
  round: number;
  roundCount: number;
  over: boolean;
  tapped: boolean;
  myScore: number;
}

function advance(state: TapState, now: number): TapState {
  const round = state.round + 1;
  if (round > TAP_ROUNDS) {
    return { ...state, over: true, deadline: null, tapped: [] };
  }
  return { ...state, round, tapped: [], deadline: now + TAP_ROUND_MS };
}

export const tapGame: GameDefinition<
  TapState,
  TapAction,
  TapHostView,
  TapPlayerView,
  WordPairContent
> = {
  id: "tap",
  name: "Tap Test",
  blurb: "A fixture game for SDK tests.",
  minPlayers: 3,
  maxPlayers: 8,
  minutes: 1,
  contentKind: "word-pairs",

  setup(ctx) {
    const scores: Record<PlayerId, number> = {};
    for (const p of ctx.players) scores[p.id] = 0;
    return {
      round: 1,
      tapped: [],
      scores,
      over: false,
      deadline: ctx.now + TAP_ROUND_MS,
    };
  },

  actionSchema: z.object({ type: z.literal("tap") }),

  onAction(state, playerId, action, ctx) {
    if (action.type !== "tap" || state.over) return state;
    if (state.tapped.includes(playerId)) return state;
    const next: TapState = {
      ...state,
      tapped: [...state.tapped, playerId],
      scores: {
        ...state.scores,
        [playerId]: (state.scores[playerId] ?? 0) + TAP_POINTS,
      },
    };
    const allConnectedTapped =
      ctx.connectedIds.length > 0 &&
      ctx.connectedIds.every((id) => next.tapped.includes(id));
    return allConnectedTapped ? advance(next, ctx.now) : next;
  },

  nextDeadline(state) {
    return state.deadline;
  },

  onDeadline(state, ctx) {
    return state.over ? state : advance(state, ctx.now);
  },

  onPlayerRemoved(state, playerId) {
    if (!state.tapped.includes(playerId)) return state;
    return { ...state, tapped: state.tapped.filter((id) => id !== playerId) };
  },

  hostView(state) {
    return {
      round: state.round,
      roundCount: TAP_ROUNDS,
      over: state.over,
      tappedIds: [...state.tapped],
      scores: { ...state.scores },
    };
  },

  playerView(state, playerId) {
    return {
      round: state.round,
      roundCount: TAP_ROUNDS,
      over: state.over,
      tapped: state.tapped.includes(playerId),
      myScore: state.scores[playerId] ?? 0,
    };
  },

  isOver(state) {
    return state.over;
  },

  scores(state) {
    return { ...state.scores };
  },

  bot(view) {
    return view.over || view.tapped ? null : { type: "tap" };
  },
};
