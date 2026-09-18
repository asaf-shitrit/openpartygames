// View builders. Before a drawing's reveal, no view carries its real title, and a player's own
// view never carries another player's prompt, title or vote. Each field is its own small helper
// so buildHostView/buildPlayerView stay a flat object literal with no branching of their own.
import type { PlayerId } from "@opg/protocol";
import { doneDrawingIds, galleryEntries } from "./rules";
import {
  drawingIdOf,
  type DoodleHostOption,
  type DoodleHostView,
  type DoodlePlayerOption,
  type DoodlePlayerPrompt,
  type DoodlePlayerView,
  type DoodleState,
  type DrawingSlot,
} from "./state";

function currentDrawing(state: DoodleState): DrawingSlot | null {
  if (state.currentDrawingId === null) return null;
  return state.drawings[state.currentDrawingId] ?? null;
}

function optionsVisible(state: DoodleState): boolean {
  return state.phase === "vote" || state.phase === "reveal";
}

function hostOptions(state: DoodleState): DoodleHostOption[] | null {
  if (!optionsVisible(state)) return null;
  return (state.options ?? []).map((o) => ({ id: o.id, text: o.text }));
}

function writtenIdsFor(state: DoodleState): PlayerId[] {
  return state.phase === "title" ? Object.keys(state.titles) : [];
}

function votedIdsFor(state: DoodleState): PlayerId[] {
  return state.phase === "vote" ? Object.keys(state.votes) : [];
}

function revealFor(state: DoodleState) {
  return state.phase === "reveal" ? state.reveal : null;
}

function pointsThisRoundFor(state: DoodleState) {
  return state.phase === "reveal" ? { ...state.pointsThisRound } : null;
}

function galleryFor(state: DoodleState) {
  return state.phase === "gallery" ? galleryEntries(state) : null;
}

export function buildHostView(state: DoodleState): DoodleHostView {
  const drawing = currentDrawing(state);
  return {
    phase: state.phase,
    playerIds: [...state.playerIds],
    drawnIds: doneDrawingIds(state),
    roundNumber: state.shownCount,
    roundCount: state.plannedRounds,
    artistId: drawing === null ? null : drawing.artistId,
    doodle: drawing === null ? null : drawing.doodle,
    writtenIds: writtenIdsFor(state),
    votedIds: votedIdsFor(state),
    options: hostOptions(state),
    reveal: revealFor(state),
    pointsThisRound: pointsThisRoundFor(state),
    totals: { ...state.scores },
    gallery: galleryFor(state),
  };
}

function myPromptsOf(state: DoodleState, playerId: PlayerId): DoodlePlayerPrompt[] {
  if (state.phase !== "draw") return [];
  return ([0, 1] as const).flatMap((slot) => {
    const id = drawingIdOf(playerId, slot);
    const drawing = state.drawings[id];
    return drawing === undefined ? [] : [{ drawingId: id, prompt: drawing.prompt }];
  });
}

function myStrokeCountsOf(state: DoodleState, playerId: PlayerId) {
  const counts: Record<string, number> = {};
  for (const slot of [0, 1] as const) {
    const id = drawingIdOf(playerId, slot);
    const drawing = state.drawings[id];
    if (drawing !== undefined) counts[id] = drawing.doodle.s.length;
  }
  return counts;
}

function myDoneOf(state: DoodleState, playerId: PlayerId) {
  const done: Record<string, boolean> = {};
  for (const slot of [0, 1] as const) {
    const id = drawingIdOf(playerId, slot);
    const drawing = state.drawings[id];
    if (drawing !== undefined) done[id] = drawing.done;
  }
  return done;
}

function playerOptions(state: DoodleState, playerId: PlayerId): DoodlePlayerOption[] | null {
  if (!optionsVisible(state)) return null;
  return (state.options ?? []).map((o) => ({ id: o.id, text: o.text, mine: o.authorId === playerId }));
}

function myTitleFor(state: DoodleState, playerId: PlayerId): string | null {
  return state.titles[playerId] ?? null;
}

function titleErrorFor(state: DoodleState, playerId: PlayerId) {
  return state.titleErrors[playerId] ?? null;
}

function myVoteFor(state: DoodleState, playerId: PlayerId): string | null {
  return state.votes[playerId] ?? null;
}

function myPointsFor(state: DoodleState, playerId: PlayerId): number | null {
  return state.phase === "reveal" ? (state.pointsThisRound[playerId] ?? 0) : null;
}

export function buildPlayerView(state: DoodleState, playerId: PlayerId): DoodlePlayerView {
  const drawing = currentDrawing(state);
  return {
    phase: state.phase,
    playerCount: state.playerIds.length,
    myPrompts: myPromptsOf(state, playerId),
    myStrokeCounts: myStrokeCountsOf(state, playerId),
    myDone: myDoneOf(state, playerId),
    drawnCount: doneDrawingIds(state).length,
    roundNumber: state.shownCount,
    roundCount: state.plannedRounds,
    currentDrawingId: state.currentDrawingId,
    isArtist: drawing !== null && drawing.artistId === playerId,
    doodle: drawing === null ? null : drawing.doodle,
    myTitle: myTitleFor(state, playerId),
    titleError: titleErrorFor(state, playerId),
    titledCount: Object.keys(state.titles).length,
    options: playerOptions(state, playerId),
    myVote: myVoteFor(state, playerId),
    votedCount: Object.keys(state.votes).length,
    reveal: revealFor(state),
    myPoints: myPointsFor(state, playerId),
    totals: { ...state.scores },
  };
}
