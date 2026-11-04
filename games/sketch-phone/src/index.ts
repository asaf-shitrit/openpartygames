// Sketch Phone's rules: the phases, their deadlines and every state change, as one pure step
// function per action. The chain arithmetic comes from @opg/sdk; helpers that do not need a
// clock or an rng live in rules.ts, and the two views in views.ts.
//
// Timeouts close a phase on whatever the room has. A player who never sent a link leaves an
// empty one behind, and every chain view skips links that hold nothing, so a late phone can
// never break a replay.
import {
  chainHeldBy,
  pullInDeadline,
  type GameContext,
  type GameDefinition,
  type Rng,
  type DrawingPromptContent,
} from "@opg/sdk";
import { emptyDoodle, type Doodle, type Stroke } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  addPoints,
  chainLinks,
  chunkFits,
  cleanWords,
  chainOwner,
  currentChain,
  favouriteOf,
  myLinkOf,
  onlyAbsentLeft,
  pointsOnChain,
  roundComplete,
  votersWithout,
  votableLinks,
  wordsAcceptable,
  withoutKey,
} from "./rules";
import {
  DESCRIBE_MS,
  dealRounds,
  DRAW_MS,
  FAVOURITE_MS,
  kindOfStep,
  linkIdOf,
  POINTS_PER_VOTE,
  PRESENT_MS,
  SKETCH_MAX_PLAYERS,
  SKETCH_MIN_PLAYERS,
  SKETCH_MINUTES,
  sketchActionSchema,
  TEXT_MAX_LENGTH,
  VOTE_MS,
  WRITE_MS,
  type ChainLink,
  type SketchAction,
  type SketchPhase,
  type SketchState,
} from "./state";
import { buildHostView, buildPlayerView } from "./views";
import { sketchPhoneAwards } from "./awards";
import { botDoodle } from "./bot";

type Ctx = GameContext<DrawingPromptContent>;

/** The phase a round is played in. Round 0 is always the seed. */
function phaseOfRound(round: number): SketchPhase {
  if (round === 0) return "write";
  return kindOfStep(round) === "drawing" ? "draw" : "describe";
}

/** The three phases a round is played in, and only those three, are on a clock. */
type TimedPhase = "write" | "draw" | "describe";

const PHASE_MS = {
  write: WRITE_MS,
  draw: DRAW_MS,
  describe: DESCRIBE_MS,
} satisfies Record<TimedPhase, number>;

function timedPhaseOf(round: number): TimedPhase | null {
  const phase = phaseOfRound(round);
  return phase === "replay" || phase === "vote" || phase === "favourite" ? null : phase;
}

function roundDuration(round: number): number {
  const phase = timedPhaseOf(round);
  return phase === null ? 0 : PHASE_MS[phase];
}

// ---------- Setup ----------

function emptyLink(chain: number, step: number, authorId: PlayerId): ChainLink {
  return {
    id: linkIdOf(chain, step),
    chain,
    step,
    kind: kindOfStep(step) === "drawing" ? "drawing" : "words",
    authorId,
    text: "",
    doodle: emptyDoodle(),
    done: false,
  };
}

/** The links of every chain, and who works on which chain each round. */
interface DealtLinks {
  links: Record<string, ChainLink>;
  chainsFor: Record<PlayerId, number>[];
}

/** Every (player, round) pair gets its link at setup, so a kick can never move one. */
function dealLinks(playerIds: readonly PlayerId[]): DealtLinks {
  const links: Record<string, ChainLink> = {};
  const chainsFor: Record<PlayerId, number>[] = [];
  const count = playerIds.length;
  for (let round = 0; round < count; round += 1) {
    const byPlayer: Record<PlayerId, number> = {};
    playerIds.forEach((playerId, seat) => {
      const chain = chainHeldBy(seat, round, count);
      byPlayer[playerId] = chain;
      links[linkIdOf(chain, round)] = emptyLink(chain, round, playerId);
    });
    chainsFor.push(byPlayer);
  }
  return { links, chainsFor };
}

function shuffledChains(rng: Rng, count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const at = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = at;
  }
  return order;
}

/** Phrase chips the write screen offers, so a player who is stuck has something to tap. */
const SUGGESTIONS_PER_PLAYER = 3;

/**
 * The phrases each phone offers, dealt from the room's own drawing prompts: the packs are the
 * content, and a player who cannot think of a phrase taps one of theirs instead. Each player gets
 * a different window onto the shuffled prompts, so a table does not write the same phrase twice.
 */
function dealSuggestions(rng: Rng, content: DrawingPromptContent, playerIds: readonly PlayerId[]) {
  const prompts = rng.shuffle(content.items.map((item) => item.prompt));
  const count = Math.min(SUGGESTIONS_PER_PLAYER, prompts.length);
  return Object.fromEntries(playerIds.map((playerId, seat) => [playerId, promptsFor(prompts, seat, count)]));
}

/** One phone's window onto the shuffled prompts: `count` of them from its seat's offset. */
function promptsFor(prompts: readonly string[], seat: number, count: number): string[] {
  const mine: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const prompt = prompts[(seat * SUGGESTIONS_PER_PLAYER + index) % prompts.length];
    if (prompt !== undefined) mine.push(prompt);
  }
  return mine;
}

export function setup(ctx: Ctx): SketchState {
  const playerIds = ctx.players.map((player) => player.id);
  const { links, chainsFor } = dealLinks(playerIds);
  const scores: Record<PlayerId, number> = {};
  for (const id of playerIds) scores[id] = 0;
  return {
    phase: "write",
    startedAt: ctx.now,
    playerIds,
    links,
    replayOrder: shuffledChains(ctx.rng, playerIds.length),
    replayPos: 0,
    revealed: 0,
    round: 0,
    chainsFor,
    suggestions: dealSuggestions(ctx.rng, ctx.content, playerIds),
    doneIds: {},
    votes: {},
    voters: {},
    pointsThisChain: {},
    scores,
    finished: false,
    deadline: ctx.now + WRITE_MS,
  };
}

// ---------- Rounds ----------

function startRound(state: SketchState, ctx: Ctx, round: number): SketchState {
  return {
    ...state,
    phase: phaseOfRound(round),
    round,
    doneIds: {},
    deadline: ctx.now + roundDuration(round),
  };
}

/** Whatever every player has, on the round's links, is handed in. */
function handInEverything(state: SketchState): SketchState {
  const links = { ...state.links };
  for (const playerId of state.playerIds) {
    const chain = state.chainsFor[state.round]?.[playerId];
    if (chain === undefined) continue;
    const key = linkIdOf(chain, state.round);
    const link = links[key];
    if (link !== undefined && !link.done) links[key] = { ...link, done: true };
  }
  return { ...state, links };
}

function firstPlayableFrom(state: SketchState, from: number): number {
  for (let pos = from; pos < state.replayOrder.length; pos += 1) {
    const chain = state.replayOrder[pos];
    if (chain !== undefined && chainLinks(state, chain).length > 0) return pos;
  }
  return -1;
}

function finish(state: SketchState): SketchState {
  return { ...state, phase: "favourite", finished: true, deadline: null };
}

function startReplayAt(state: SketchState, ctx: Ctx, pos: number): SketchState {
  return {
    ...state,
    phase: "replay",
    replayPos: pos,
    revealed: 1,
    votes: {},
    pointsThisChain: {},
    deadline: ctx.now + PRESENT_MS,
  };
}

function startNextChain(state: SketchState, ctx: Ctx): SketchState {
  const pos = firstPlayableFrom(state, state.replayPos + 1);
  return pos < 0 ? finish(state) : startReplayAt(state, ctx, pos);
}

function beginReplay(state: SketchState, ctx: Ctx): SketchState {
  const pos = firstPlayableFrom(state, 0);
  return pos < 0 ? finish(state) : startReplayAt(state, ctx, pos);
}

function nextRound(state: SketchState, ctx: Ctx): SketchState {
  const handed = handInEverything(state);
  // The deal decides how many rounds there are: a kick must not end the game a round early.
  if (handed.round + 1 >= dealRounds(handed)) return beginReplay(handed, ctx);
  return startRound(handed, ctx, handed.round + 1);
}

function settleRound(state: SketchState, ctx: Ctx): SketchState {
  if (roundComplete(state)) return nextRound(state, ctx);
  return onlyAbsentLeft(state, ctx.connectedIds) ? pullInDeadline(state, ctx.now) : state;
}

// ---------- Replay, vote and favourite ----------

function advanceReplay(state: SketchState, ctx: Ctx): SketchState {
  const chain = currentChain(state);
  if (chain === null) return finish(state);
  if (state.revealed < chainLinks(state, chain).length) {
    return { ...state, revealed: state.revealed + 1, deadline: ctx.now + PRESENT_MS };
  }
  return { ...state, phase: "vote", votes: {}, deadline: ctx.now + VOTE_MS };
}

function mayVote(state: SketchState, playerId: PlayerId): boolean {
  return votableLinks(state, playerId).length > 0;
}

function allVoted(state: SketchState, ids: readonly PlayerId[]): boolean {
  return ids.every((id) => !mayVote(state, id) || state.votes[id] !== undefined);
}

function closeVote(state: SketchState, ctx: Ctx): SketchState {
  const chain = currentChain(state);
  if (chain === null) return finish(state);
  const gained = pointsOnChain(state, chain, POINTS_PER_VOTE);
  const scored: SketchState = {
    ...state,
    pointsThisChain: gained,
    scores: addPoints(state.scores, gained),
  };
  if (favouriteOf(scored, chain) === null) return startNextChain(scored, ctx);
  return { ...scored, phase: "favourite", deadline: ctx.now + FAVOURITE_MS };
}

function settleVote(state: SketchState, ctx: Ctx): SketchState {
  if (allVoted(state, state.playerIds)) return closeVote(state, ctx);
  const connected = state.playerIds.filter((id) => ctx.connectedIds.includes(id));
  return allVoted(state, connected) ? pullInDeadline(state, ctx.now) : state;
}

/** Records a vote and closes the vote when the room is done. */
function applyVote(state: SketchState, playerId: PlayerId, votedFor: string, ctx: Ctx): SketchState {
  if (state.phase !== "vote" || state.votes[playerId] !== undefined) return state;
  if (!votableLinks(state, playerId).some((link) => link.id === votedFor)) return state;
  const voters = state.voters[votedFor] ?? [];
  const next: SketchState = {
    ...state,
    votes: { ...state.votes, [playerId]: votedFor },
    voters: { ...state.voters, [votedFor]: [...voters, playerId] },
  };
  return settleVote(next, ctx);
}

// ---------- Filling a link ----------

function applyWords(state: SketchState, playerId: PlayerId, text: string, ctx: Ctx): SketchState {
  if (state.phase !== "write" && state.phase !== "describe") return state;
  const link = myLinkOf(state, playerId);
  if (link === null || link.done || link.kind !== "words") return state;
  const cleaned = cleanWords(text);
  if (!wordsAcceptable(cleaned)) return state;
  const next: SketchState = {
    ...state,
    links: { ...state.links, [link.id]: { ...link, text: cleaned, done: true } },
    doneIds: { ...state.doneIds, [playerId]: true },
  };
  return settleRound(next, ctx);
}

function appendStrokes(doodle: Doodle, strokes: readonly Stroke[]): Doodle {
  return { v: 1, s: [...doodle.s, ...strokes] };
}

function applyStrokes(
  state: SketchState,
  playerId: PlayerId,
  action: { linkId: string; from: number; strokes: Stroke[] },
): SketchState {
  if (state.phase !== "draw") return state;
  const link = myLinkOf(state, playerId);
  if (link === null || link.done || link.id !== action.linkId) return state;
  if (action.from !== link.doodle.s.length || !chunkFits(link.doodle, action.strokes)) return state;
  return { ...state, links: { ...state.links, [link.id]: { ...link, doodle: appendStrokes(link.doodle, action.strokes) } } };
}

function applyTruncate(
  state: SketchState,
  playerId: PlayerId,
  action: { linkId: string; from: number; to: number },
): SketchState {
  if (state.phase !== "draw") return state;
  const link = myLinkOf(state, playerId);
  if (link === null || link.done || link.id !== action.linkId) return state;
  if (action.from !== link.doodle.s.length || action.to >= action.from) return state;
  return {
    ...state,
    links: { ...state.links, [link.id]: { ...link, doodle: { v: 1, s: link.doodle.s.slice(0, action.to) } } },
  };
}

function applyDone(state: SketchState, playerId: PlayerId, linkId: string, ctx: Ctx): SketchState {
  if (state.phase !== "draw") return state;
  const link = myLinkOf(state, playerId);
  if (link === null || link.done || link.id !== linkId) return state;
  const next: SketchState = {
    ...state,
    links: { ...state.links, [link.id]: { ...link, done: true } },
    doneIds: { ...state.doneIds, [playerId]: true },
  };
  return settleRound(next, ctx);
}

// ---------- Deadline and removals ----------

function timeout(state: SketchState, ctx: Ctx): SketchState {
  switch (state.phase) {
    case "write":
    case "draw":
    case "describe":
      return nextRound(state, ctx);
    case "replay":
      return advanceReplay(state, ctx);
    case "vote":
      return closeVote(state, ctx);
    case "favourite":
      return startNextChain(state, ctx);
    default:
      return state;
  }
}

function dropUnfinished(state: SketchState, playerId: PlayerId): SketchState {
  const links: Record<string, ChainLink> = {};
  for (const [id, link] of Object.entries(state.links)) {
    if (link.authorId === playerId && !link.done) continue;
    links[id] = link;
  }
  return { ...state, links };
}

/** The state without the player, their votes and their unfinished work. */
function kickOut(state: SketchState, playerId: PlayerId): SketchState {
  return dropUnfinished(
    {
      ...state,
      playerIds: state.playerIds.filter((id) => id !== playerId),
      doneIds: withoutKey(state.doneIds, playerId),
      votes: withoutKey(state.votes, playerId),
      pointsThisChain: withoutKey(state.pointsThisChain, playerId),
      scores: withoutKey(state.scores, playerId),
      voters: votersWithout(state, playerId),
    },
    playerId,
  );
}

/** True when the chain on stage has nothing left to show, so it should be skipped. */
function chainEmptied(state: SketchState): boolean {
  const chain = currentChain(state);
  return chain !== null && chainLinks(state, chain).length === 0;
}

/** A player left (kicked or timed out): their unfinished work goes with them. */
export function onPlayerRemoved(state: SketchState, playerId: PlayerId, ctx: Ctx): SketchState {
  if (!state.playerIds.includes(playerId)) return state;
  const next = kickOut(state, playerId);
  if (next.phase === "vote") return settleVote(next, ctx);
  if (next.phase === "write" || next.phase === "draw" || next.phase === "describe") {
    return settleRound(next, ctx);
  }
  // A chain on stage may have lost its only links with that player; skip it rather than replay
  // an empty one.
  return chainEmptied(next) ? startNextChain(next, ctx) : next;
}

// ---------- Bots ----------

const BOT_PHRASES = [
  "a cat in a tiny hat",
  "my first driving lesson",
  "the world's worst haircut",
  "a pigeon on the bus",
  "grandma at a rave",
  "a very confused ghost",
  "the last slice of pizza",
  "two ducks in a trench coat",
];

type PlayerView = ReturnType<typeof buildPlayerView>;

/** A phrase to write, or null once this bot has nothing left to add. */
function botWords(view: PlayerView, rng: Rng): SketchAction | null {
  if (view.myDone || view.myLinkId === null) return null;
  if (view.myWords !== null && view.myWords.length > 0) return null;
  const phrase = BOT_PHRASES[rng.int(BOT_PHRASES.length)] ?? BOT_PHRASES[0] ?? "something";
  return { type: "words", text: `${phrase} ${view.roundNumber}`.slice(0, TEXT_MAX_LENGTH) };
}

/** A squiggle the first time round, and "done" once it is on the pad. */
function botDrawing(view: PlayerView, rng: Rng): SketchAction | null {
  if (view.myDone || view.myLinkId === null) return null;
  if (view.myStrokeCount > 0) return { type: "done", linkId: view.myLinkId };
  return { type: "strokes", linkId: view.myLinkId, from: 0, strokes: botDoodle(rng) };
}

/** A vote for somebody else's link, or null once this bot has voted. */
function botVote(view: PlayerView, rng: Rng): SketchAction | null {
  if (view.myVote !== null) return null;
  const choices = (view.options ?? []).filter((option) => !option.mine);
  const chosen = choices[rng.int(choices.length)];
  return chosen === undefined ? null : { type: "vote", linkId: chosen.id };
}

function botAction(view: PlayerView, rng: Rng): SketchAction | null {
  switch (view.phase) {
    case "write":
    case "describe":
      return botWords(view, rng);
    case "draw":
      return botDrawing(view, rng);
    case "replay":
      return view.isPresenter ? { type: "next-link" } : null;
    case "vote":
      return botVote(view, rng);
    case "favourite":
    default:
      return null;
  }
}

// ---------- The game ----------

/** The chain's owner alone walks their own replay on; anyone else's tap does nothing. */
function applyNextLink(state: SketchState, playerId: PlayerId, ctx: Ctx): SketchState {
  if (state.phase !== "replay") return state;
  const chain = currentChain(state);
  return chain !== null && chainOwner(state, chain) === playerId ? advanceReplay(state, ctx) : state;
}

/** One action, from any player, at any moment. Returns the same state when it is not allowed. */
export function onAction(
  state: SketchState,
  playerId: PlayerId,
  action: SketchAction,
  ctx: Ctx,
): SketchState {
  switch (action.type) {
    case "words":
      return applyWords(state, playerId, action.text, ctx);
    case "strokes":
      return applyStrokes(state, playerId, action);
    case "truncate":
      return applyTruncate(state, playerId, action);
    case "done":
      return applyDone(state, playerId, action.linkId, ctx);
    case "next-link":
      return applyNextLink(state, playerId, ctx);
    case "vote":
      return applyVote(state, playerId, action.linkId, ctx);
    default:
      return state;
  }
}

/** A phase timed out (or the VIP skipped it). */
export function onDeadline(state: SketchState, ctx: Ctx): SketchState {
  return timeout(state, ctx);
}

export const sketchPhone: GameDefinition<
  SketchState,
  SketchAction,
  ReturnType<typeof buildHostView>,
  ReturnType<typeof buildPlayerView>,
  DrawingPromptContent
> = {
  id: "sketch-phone",
  name: "Sketch Phone",
  blurb: "Write it, draw it, describe it. Watch a phrase turn into nonsense.",
  minPlayers: SKETCH_MIN_PLAYERS,
  maxPlayers: SKETCH_MAX_PLAYERS,
  minutes: SKETCH_MINUTES,
  contentKind: "drawing-prompts",
  noTv: true,
  setup,
  actionSchema: sketchActionSchema,
  onAction,
  onDeadline,
  nextDeadline: (state) => state.deadline,
  onPlayerRemoved,
  onPlayersChanged(state, ctx) {
    if (state.phase === "vote") return settleVote(state, ctx);
    if (state.phase === "write" || state.phase === "draw" || state.phase === "describe") {
      return onlyAbsentLeft(state, ctx.connectedIds) ? pullInDeadline(state, ctx.now) : state;
    }
    return state;
  },
  hostView: buildHostView,
  playerView: buildPlayerView,
  isOver: (state) => state.finished,
  scores: (state) => ({ ...state.scores }),
  bot: botAction,
  awards: sketchPhoneAwards,
};

export type { SketchState, SketchAction, SketchPhase };
