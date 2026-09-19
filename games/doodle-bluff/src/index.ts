// Doodle Bluff: pure, deterministic GameDefinition. No I/O, no Date.now, no Math.random.
// The write -> vote -> reveal spine is real-or-nah's, almost unchanged (plan/0003-doodle-bluff.md);
// what's new is the draw phase up front, the chunked stroke submit, and the artist's own score.
import type { DrawingPrompt, DrawingPromptContent, GameContext, GameDefinition, Rng } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import { doodleBluffAwards } from "./awards";
import { botDoodle } from "./bot";
import {
  addPoints,
  anonymizeAuthor,
  candidateOrder,
  canVoteOption,
  chunkFits,
  cleanTitle,
  computeReveal,
  isDoneDrawing,
  nextValidDrawing,
  nonArtistIds,
  pointsFor,
  removeDrawing,
  roundRecordOf,
  titleEntriesOf,
  titleErrorOf,
  topUpWithHouseTitles,
  truthEntry,
  withoutKey,
} from "./rules";
import {
  doodleActionSchema,
  drawingIdOf,
  DOODLE_MAX_PLAYERS,
  DOODLE_MIN_PLAYERS,
  DOODLE_MINUTES,
  DRAW_MS,
  emptyDoodle,
  GALLERY_MS,
  REVEAL_MS,
  shownCount as shownCountOf,
  TITLE_MS,
  TITLED_MAX,
  VOTE_MS,
  type DoodleAction,
  type DoodleHostView,
  type DoodleOption,
  type DoodlePhase,
  type DoodlePlayerView,
  type DoodleState,
  type DrawingSlot,
} from "./state";
import { buildHostView, buildPlayerView } from "./views";

export type {
  Doodle,
  DoodleAction,
  DoodleFooledTitle,
  DoodleGalleryEntry,
  DoodleHostOption,
  DoodleHostView,
  DoodleOption,
  DoodlePhase,
  DoodlePlayerOption,
  DoodlePlayerPrompt,
  DoodlePlayerView,
  DoodleReveal,
  DoodleRoundRecord,
  DoodleState,
  DoodleTitleError,
  DrawingSlot,
  Stroke,
} from "./state";
export {
  doodleActionSchema,
  doodleGalleryEntrySchema,
  doodleHostOptionSchema,
  doodleHostViewSchema,
  doodlePlayerOptionSchema,
  doodlePlayerViewSchema,
  doodleRevealSchema,
  doodleSchema,
  doodleTitleErrorSchema,
  drawingIdOf,
  DOODLE_MAX_PLAYERS,
  DOODLE_MIN_PLAYERS,
  DOODLE_MINUTES,
  DRAW_MS,
  GALLERY_MS,
  GRID,
  MIN_OPTIONS,
  MIN_STROKES,
  POINTS_PER_FOOL,
  POINTS_PER_FOUND,
  POINTS_TRUTH,
  REVEAL_MS,
  shownCount,
  strokeSchema,
  TITLE_MAX_LENGTH,
  TITLE_MS,
  TITLED_MAX,
  VOTE_MS,
} from "./state";
export { doodleBluffAwards } from "./awards";
export { botDoodle } from "./bot";

type Ctx = GameContext<DrawingPromptContent>;

// ---------- Setup ----------

function slotFrom(item: DrawingPrompt): Pick<DrawingSlot, "promptId" | "prompt" | "houseTitles"> {
  return { promptId: item.id, prompt: item.prompt, houseTitles: [...item.houseTitles] };
}

function buildDrawings(playerIds: readonly PlayerId[], items: readonly DrawingPrompt[]) {
  const drawings: Record<string, DrawingSlot> = {};
  const drawOrder: string[] = [];
  playerIds.forEach((playerId, i) => {
    ([0, 1] as const).forEach((slot) => {
      const item = items[i * 2 + slot];
      if (item === undefined) return; // unreachable: caller checked items.length
      const drawingId = drawingIdOf(playerId, slot);
      drawings[drawingId] = { artistId: playerId, doodle: emptyDoodle(), done: false, ...slotFrom(item) };
      drawOrder.push(drawingId);
    });
  });
  return { drawings, drawOrder };
}

export function setup(ctx: Ctx): DoodleState {
  const playerIds = ctx.players.map((p) => p.id);
  const items = ctx.rng.shuffle(ctx.content.items).slice(0, playerIds.length * 2);
  const empty = items.length < playerIds.length * 2;
  const startingScores: Record<PlayerId, number> = {};
  for (const id of playerIds) startingScores[id] = 0;
  const { drawings, drawOrder } = empty ? { drawings: {}, drawOrder: [] } : buildDrawings(playerIds, items);
  return {
    phase: "draw",
    playerIds,
    drawings,
    drawOrder,
    queueOrder: [],
    queuePos: 0,
    shownCount: 0,
    plannedRounds: 0,
    currentDrawingId: null,
    titles: {},
    titleErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    scores: startingScores,
    finished: empty,
    deadline: empty ? null : ctx.now + DRAW_MS,
    history: [],
  };
}

// ---------- Draw phase ----------

function allConnectedDrawingsDone(state: DoodleState, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) => state.playerIds.includes(id));
  if (connected.length === 0) return false;
  return connected.every((id) => isDoneDrawing(state, id));
}

function applyStrokes(
  state: DoodleState,
  playerId: PlayerId,
  action: Extract<DoodleAction, { type: "strokes" }>,
): DoodleState {
  if (state.phase !== "draw") return state;
  const drawing = state.drawings[action.drawingId];
  if (drawing === undefined || drawing.artistId !== playerId || drawing.done) return state;
  if (action.from !== drawing.doodle.s.length) return state;
  if (!chunkFits(drawing.doodle, action.strokes)) return state;
  const doodle = { v: 1 as const, s: [...drawing.doodle.s, ...action.strokes] };
  return { ...state, drawings: { ...state.drawings, [action.drawingId]: { ...drawing, doodle } } };
}

function applyDoodleDone(state: DoodleState, playerId: PlayerId, drawingId: string, ctx: Ctx): DoodleState {
  if (state.phase !== "draw") return state;
  const drawing = state.drawings[drawingId];
  if (drawing === undefined || drawing.artistId !== playerId || drawing.done) return state;
  const next = { ...state, drawings: { ...state.drawings, [drawingId]: { ...drawing, done: true } } };
  return allConnectedDrawingsDone(next, ctx) ? endDraw(next, ctx) : next;
}

function endDraw(state: DoodleState, ctx: Ctx): DoodleState {
  const queueOrder = candidateOrder(ctx.rng.shuffle(state.playerIds));
  const plannedRounds = shownCountOf(state.playerIds.length);
  return startNextRound({ ...state, queueOrder, queuePos: 0, shownCount: 0, plannedRounds }, ctx);
}

// ---------- Round selection ----------

function startRound(state: DoodleState, found: { drawingId: string; queuePos: number }, ctx: Ctx): DoodleState {
  return {
    ...state,
    phase: "title",
    currentDrawingId: found.drawingId,
    queuePos: found.queuePos,
    shownCount: state.shownCount + 1,
    titles: {},
    titleErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    deadline: ctx.now + TITLE_MS,
  };
}

function startGallery(state: DoodleState, ctx: Ctx): DoodleState {
  return {
    ...state,
    phase: "gallery",
    currentDrawingId: null,
    titles: {},
    titleErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    deadline: ctx.now + GALLERY_MS,
  };
}

function startNextRound(state: DoodleState, ctx: Ctx): DoodleState {
  if (state.shownCount >= TITLED_MAX) return startGallery(state, ctx);
  const found = nextValidDrawing(state);
  if (found === null) return startGallery({ ...state, queuePos: state.queueOrder.length }, ctx);
  return startRound(state, found, ctx);
}

// ---------- Title phase ----------

function mayTitle(state: DoodleState, playerId: PlayerId, drawing: DrawingSlot): boolean {
  return (
    state.phase === "title" &&
    state.playerIds.includes(playerId) &&
    drawing.artistId !== playerId &&
    state.titles[playerId] === undefined
  );
}

function allTitlesSubmitted(state: DoodleState, drawing: DrawingSlot, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) => nonArtistIds(state, drawing.artistId).includes(id));
  if (connected.length === 0) return false;
  return connected.every((id) => state.titles[id] !== undefined);
}

function applyTitle(state: DoodleState, playerId: PlayerId, text: string, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined || !mayTitle(state, playerId, drawing)) return state;
  const cleaned = cleanTitle(text);
  const error = titleErrorOf(drawing.prompt, state.titles, playerId, cleaned);
  if (error !== null) return { ...state, titleErrors: { ...state.titleErrors, [playerId]: error } };
  const titles = { ...state.titles, [playerId]: cleaned };
  const titleErrors = withoutKey(state.titleErrors, playerId);
  const next = { ...state, titles, titleErrors };
  return allTitlesSubmitted(next, drawing, ctx) ? startVote(next, ctx) : next;
}

function buildOptions(state: DoodleState, drawing: DrawingSlot, ctx: Ctx): DoodleOption[] {
  const entries = [truthEntry(drawing), ...titleEntriesOf(state, drawing.artistId)];
  const topped = topUpWithHouseTitles(entries, ctx.rng.shuffle(drawing.houseTitles));
  const options: DoodleOption[] = [];
  for (const entry of ctx.rng.shuffle(topped)) options.push({ id: `o${options.length + 1}`, ...entry });
  return options;
}

/** No titles could arrive (nobody but the artist is connected): the round is abandoned. */
function startVote(state: DoodleState, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined) return startNextRound(state, ctx);
  const others = nonArtistIds(state, drawing.artistId).filter((id) => ctx.connectedIds.includes(id));
  if (others.length === 0) return startNextRound(state, ctx);
  return { ...state, phase: "vote", options: buildOptions(state, drawing, ctx), deadline: ctx.now + VOTE_MS };
}

// ---------- Vote phase ----------

function pickedOption(state: DoodleState, playerId: PlayerId, optionId: string): DoodleOption | undefined {
  const option = (state.options ?? []).find((o) => o.id === optionId);
  if (option === undefined) return undefined;
  return option.authorId === playerId ? undefined : option;
}

function mayVote(state: DoodleState, playerId: PlayerId, drawing: DrawingSlot): boolean {
  return (
    state.phase === "vote" &&
    state.playerIds.includes(playerId) &&
    drawing.artistId !== playerId &&
    state.votes[playerId] === undefined
  );
}

function allVotesSubmitted(state: DoodleState, drawing: DrawingSlot, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) => nonArtistIds(state, drawing.artistId).includes(id));
  if (connected.length === 0) return false;
  return connected.every((id) => !canVoteOption(state.options, id) || state.votes[id] !== undefined);
}

function applyVote(state: DoodleState, playerId: PlayerId, optionId: string, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined || !mayVote(state, playerId, drawing)) return state;
  const option = pickedOption(state, playerId, optionId);
  if (option === undefined) return state;
  const next = { ...state, votes: { ...state.votes, [playerId]: option.id } };
  return allVotesSubmitted(next, drawing, ctx) ? startReveal(next, ctx) : next;
}

function startReveal(state: DoodleState, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined || state.currentDrawingId === null) return startNextRound(state, ctx);
  const reveal = computeReveal({
    drawing,
    drawingId: state.currentDrawingId,
    options: state.options ?? [],
    votes: state.votes,
    playerIds: state.playerIds,
  });
  const pointsThisRound = pointsFor(reveal, state.playerIds);
  return {
    ...state,
    phase: "reveal",
    reveal,
    pointsThisRound,
    scores: addPoints(state.scores, pointsThisRound),
    deadline: ctx.now + REVEAL_MS,
  };
}

function endRound(state: DoodleState, ctx: Ctx): DoodleState {
  const record = roundRecordOf(state);
  const history = record === null ? state.history : [...state.history, record];
  return startNextRound({ ...state, history }, ctx);
}

function endGallery(state: DoodleState): DoodleState {
  return { ...state, finished: true, deadline: null };
}

// ---------- GameDefinition hooks ----------

export function onAction(state: DoodleState, playerId: PlayerId, action: DoodleAction, ctx: Ctx): DoodleState {
  if (state.finished) return state;
  if (action.type === "strokes") return applyStrokes(state, playerId, action);
  if (action.type === "doodle-done") return applyDoodleDone(state, playerId, action.drawingId, ctx);
  if (action.type === "title") return applyTitle(state, playerId, action.text, ctx);
  return applyVote(state, playerId, action.optionId, ctx);
}

export function nextDeadline(state: DoodleState): number | null {
  return state.deadline;
}

type DeadlineHandler = (state: DoodleState, ctx: Ctx) => DoodleState;

const DEADLINE_HANDLERS = {
  draw: endDraw,
  title: startVote,
  vote: startReveal,
  reveal: endRound,
  gallery: (state: DoodleState) => endGallery(state),
} satisfies Record<DoodlePhase, DeadlineHandler>;

export function onDeadline(state: DoodleState, ctx: Ctx): DoodleState {
  if (state.finished) return state;
  return DEADLINE_HANDLERS[state.phase](state, ctx);
}

function advanceDrawIfReady(state: DoodleState, ctx: Ctx): DoodleState {
  return allConnectedDrawingsDone(state, ctx) ? endDraw(state, ctx) : state;
}

function advanceTitleIfReady(state: DoodleState, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined) return state;
  return allTitlesSubmitted(state, drawing, ctx) ? startVote(state, ctx) : state;
}

function advanceVoteIfReady(state: DoodleState, ctx: Ctx): DoodleState {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined) return state;
  return allVotesSubmitted(state, drawing, ctx) ? startReveal(state, ctx) : state;
}

/** After a kick, ends the current phase early once whoever remains is all done. */
function advanceIfReady(state: DoodleState, ctx: Ctx): DoodleState {
  if (state.phase === "draw") return advanceDrawIfReady(state, ctx);
  if (state.phase === "title") return advanceTitleIfReady(state, ctx);
  if (state.phase === "vote") return advanceVoteIfReady(state, ctx);
  return state;
}

export function onPlayerRemoved(state: DoodleState, playerId: PlayerId, ctx: Ctx): DoodleState {
  if (!state.playerIds.includes(playerId)) return state;

  let next: DoodleState = {
    ...state,
    playerIds: state.playerIds.filter((id) => id !== playerId),
    scores: withoutKey(state.scores, playerId),
    pointsThisRound: withoutKey(state.pointsThisRound, playerId),
    titles: withoutKey(state.titles, playerId),
    titleErrors: withoutKey(state.titleErrors, playerId),
  };
  next = removeDrawing(next, drawingIdOf(playerId, 0));
  next = removeDrawing(next, drawingIdOf(playerId, 1));
  if (state.phase === "vote") {
    next = { ...next, options: anonymizeAuthor(next.options, playerId), votes: withoutKey(next.votes, playerId) };
  }
  return advanceIfReady(next, ctx);
}

export function isOver(state: DoodleState): boolean {
  return state.finished;
}

export function scores(state: DoodleState): Record<PlayerId, number> {
  return state.scores;
}

function botTitleAction(view: DoodlePlayerView, rng: Rng): DoodleAction | null {
  if (view.myTitle !== null) return null;
  return { type: "title", text: `bot title ${rng.int(1000000)} ${view.roundNumber}` };
}

function botVoteAction(view: DoodlePlayerView, rng: Rng): DoodleAction | null {
  if (view.myVote !== null || view.options === null) return null;
  const pickable = view.options.filter((o) => !o.mine);
  return pickable.length > 0 ? { type: "vote", optionId: rng.pick(pickable).id } : null;
}

function botTitleOrVote(view: DoodlePlayerView, rng: Rng): DoodleAction | null {
  if (view.isArtist) return null;
  if (view.phase === "title") return botTitleAction(view, rng);
  if (view.phase === "vote") return botVoteAction(view, rng);
  return null;
}

function botDrawAction(view: DoodlePlayerView, rng: Rng): DoodleAction | null {
  for (const p of view.myPrompts) {
    if (view.myDone[p.drawingId] === true) continue;
    const count = view.myStrokeCounts[p.drawingId] ?? 0;
    if (count === 0) return { type: "strokes", drawingId: p.drawingId, from: 0, strokes: botDoodle(rng) };
    return { type: "doodle-done", drawingId: p.drawingId };
  }
  return null;
}

export function bot(view: DoodlePlayerView, rng: Rng): DoodleAction | null {
  if (view.phase === "draw") return botDrawAction(view, rng);
  return botTitleOrVote(view, rng);
}

export const doodleBluff: GameDefinition<
  DoodleState,
  DoodleAction,
  DoodleHostView,
  DoodlePlayerView,
  DrawingPromptContent
> = {
  id: "doodle-bluff",
  name: "Doodle Bluff",
  blurb: "Draw the secret prompt, write a lie for everyone else's, and hunt for the truth.",
  minPlayers: DOODLE_MIN_PLAYERS,
  maxPlayers: DOODLE_MAX_PLAYERS,
  minutes: DOODLE_MINUTES,
  contentKind: "drawing-prompts",
  setup,
  actionSchema: doodleActionSchema,
  onAction,
  nextDeadline,
  onDeadline,
  onPlayerRemoved,
  hostView: (state) => buildHostView(state),
  playerView: (state, playerId) => buildPlayerView(state, playerId),
  isOver,
  scores,
  bot,
  awards: doodleBluffAwards,
  // A drawing is data every phone already renders — the pad, the read-only view and the TV all
  // call the same paintDoodle — so nothing here needs a big screen to carry it. The reveal is a
  // weaker moment on eight separate screens than on one; that is a presentation cost, not a
  // blocker. See "## No-TV mode" in plan/0003-doodle-bluff.md.
  noTv: true,
};
