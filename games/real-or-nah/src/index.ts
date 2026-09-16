import { z, type ZodType } from "zod";
// Real or Nah: pure, deterministic GameDefinition. No I/O, no Date.now, no Math.random.
import type {
  Fact,
  FactContent,
  GameContext,
  GameDefinition,
  Rng,
} from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  FACTS_PER_GAME,
  LIE_MAX_LENGTH,
  MIN_OPTIONS,
  POINTS_PER_FOOL,
  POINTS_TRUTH,
  RON_MAX_PLAYERS,
  RON_MIN_PLAYERS,
  RON_MINUTES,
  VOTE_MS,
  WRITE_MS,
  type RonAction,
  type RonFactRecord,
  type RonFooledLie,
  type RonHostOption,
  type RonHostView,
  type RonLieError,
  type RonOption,
  type RonPlayerOption,
  type RonPlayerView,
  type RonReveal,
  type RonState,
  planLiesOf,
} from "./types";
import { revealDurationMs } from "./reveal-plan";
import { realOrNahAwards } from "./awards";

export type {
  RonAction,
  RonFactRecord,
  RonFooledLie,
  RonHostOption,
  RonHostView,
  RonLieError,
  RonOption,
  RonPhase,
  RonPlanLie,
  RonPlayerOption,
  RonPlayerView,
  RonReveal,
  RonState,
} from "./types";
export { realOrNahAwards } from "./awards";
export {
  FACTS_PER_GAME,
  LIE_MAX_LENGTH,
  MIN_OPTIONS,
  POINTS_PER_FOOL,
  POINTS_TRUTH,
  RON_MAX_PLAYERS,
  RON_MIN_PLAYERS,
  RON_MINUTES,
  VOTE_MS,
  WRITE_MS,
  planLiesOf,
  ronHostViewSchema,
  ronPlayerViewSchema,
} from "./types";
export {
  revealDurationMs,
  revealPlan,
  RON_REVEAL,
  type RevealSegment,
  type RevealSegmentKind,
} from "./reveal-plan";

type Ctx = GameContext<FactContent>;

// ---------- Text ----------

/**
 * Mirrors the plan's normalize: lowercase, trim, strip punctuation, drop a leading
 * a/an/the, collapse inner whitespace. Kept local so games stay independent of the
 * runtime @opg/sdk build (type imports only).
 */
export function normalizeLie(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:an?|the)\s+/, "")
    .trim();
}

/** Trim + collapse inner spaces. Length is checked against the result. */
function cleanLie(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function isTruthText(fact: Fact, cleaned: string): boolean {
  const normalized = normalizeLie(cleaned);
  if (normalized === normalizeLie(fact.answer)) return true;
  return fact.alternates.some((alt) => normalizeLie(alt) === normalized);
}

// ---------- Setup ----------

export function setup(ctx: Ctx): RonState {
  const playerIds = ctx.players.map((p) => p.id);
  const facts = ctx.rng
    .shuffle(ctx.content.items)
    .slice(0, Math.min(FACTS_PER_GAME, ctx.content.items.length));
  const startScores: Record<PlayerId, number> = {};
  for (const id of playerIds) startScores[id] = 0;
  const empty = facts.length === 0;
  return {
    phase: "write",
    factIndex: 0,
    facts: [...facts],
    playerIds,
    lies: {},
    lieErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisFact: {},
    scores: startScores,
    finished: empty,
    deadline: empty ? null : ctx.now + WRITE_MS,
  };
}

// ---------- Parsing ----------

export const ronActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lie"), text: z.string().max(200) }),
  z.object({ type: z.literal("pick"), optionId: z.string().min(1).max(64) }),
]) satisfies ZodType<RonAction>;

// ---------- Options and reveal ----------

interface OptionEntry {
  text: string;
  authorId: PlayerId | null;
  isTruth: boolean;
  isDecoy?: boolean;
}

function truthEntry(fact: Fact | undefined): OptionEntry[] {
  if (fact === undefined) return [];
  return [{ text: fact.answer, authorId: null, isTruth: true }];
}

function lieEntries(state: RonState): OptionEntry[] {
  return state.playerIds.flatMap((id) => {
    const lie = state.lies[id];
    if (lie === undefined) return [];
    return [{ text: lie, authorId: id, isTruth: false }];
  });
}

/** Tops the list up to MIN_OPTIONS with house decoys nobody has used yet. */
function addDecoys(entries: OptionEntry[], fact: Fact | undefined): void {
  if (fact === undefined) return;
  const seen = entries.map((entry) => normalizeLie(entry.text));
  for (const decoy of fact.decoys) {
    if (entries.length >= MIN_OPTIONS) return;
    const normalized = normalizeLie(decoy);
    if (seen.includes(normalized)) continue;
    seen.push(normalized);
    entries.push({ text: decoy, authorId: null, isTruth: false, isDecoy: true });
  }
}

function buildOptions(state: RonState, ctx: Ctx): RonOption[] {
  const fact = state.facts[state.factIndex];
  const entries = [...truthEntry(fact), ...lieEntries(state)];
  addDecoys(entries, fact);
  const options: RonOption[] = [];
  for (const entry of ctx.rng.shuffle(entries))
    options.push({ id: `o${options.length + 1}`, ...entry });
  return options;
}

function fooledLie(
  option: RonOption,
  votes: Record<PlayerId, string>,
  playerIds: readonly PlayerId[],
): RonFooledLie {
  const fooledIds = playerIds.filter((id) => votes[id] === option.id);
  return {
    optionId: option.id,
    text: option.text,
    authorId: option.authorId,
    fooledIds,
    points: fooledIds.length * POINTS_PER_FOOL,
  };
}

function truthOptionId(options: readonly RonOption[]): string {
  return options.find((o) => o.isTruth)?.id ?? "";
}

function revealAnswer(fact: Fact | undefined): string {
  return fact?.answer ?? "";
}

function revealSource(fact: Fact | undefined): Fact["source"] {
  return fact?.source ?? { title: "", url: "" };
}

/**
 * Every lie worth telling the story of, with the players each one fooled. A house decoy
 * is kept once it fooled someone; a departed player's anonymized lie is not, so it is
 * never mistaken for a decoy.
 */
function revealedLies(
  options: readonly RonOption[],
  votes: Record<PlayerId, string>,
  playerIds: readonly PlayerId[],
): RonFooledLie[] {
  const lies: RonFooledLie[] = [];
  for (const option of options) {
    if (option.isTruth) continue;
    const lie = fooledLie(option, votes, playerIds);
    const decoyFooled = option.isDecoy === true && lie.fooledIds.length > 0;
    if (lie.authorId !== null || decoyFooled) lies.push(lie);
  }
  return lies;
}

function computeReveal(
  options: readonly RonOption[],
  votes: Record<PlayerId, string>,
  playerIds: readonly PlayerId[],
  fact: Fact | undefined,
): RonReveal {
  const truthId = truthOptionId(options);
  return {
    truthOptionId: truthId,
    answer: revealAnswer(fact),
    source: revealSource(fact),
    foundByIds: playerIds.filter((id) => votes[id] === truthId),
    lies: revealedLies(options, votes, playerIds),
  };
}

// ---------- Phase transitions ----------

function startVote(state: RonState, ctx: Ctx): RonState {
  return {
    ...state,
    phase: "vote",
    options: buildOptions(state, ctx),
    deadline: ctx.now + VOTE_MS,
  };
}

function addTruthPoints(
  points: Record<PlayerId, number>,
  foundByIds: readonly PlayerId[],
): void {
  for (const id of foundByIds) points[id] = (points[id] ?? 0) + POINTS_TRUTH;
}

function addLiePoints(
  points: Record<PlayerId, number>,
  lies: readonly RonFooledLie[],
): void {
  for (const lie of lies) {
    const authorId = lie.authorId;
    if (authorId !== null)
      points[authorId] = (points[authorId] ?? 0) + lie.points;
  }
}

function factPoints(reveal: RonReveal, playerIds: readonly PlayerId[]) {
  const points: Record<PlayerId, number> = {};
  for (const id of playerIds) points[id] = 0;
  addTruthPoints(points, reveal.foundByIds);
  addLiePoints(points, reveal.lies);
  return points;
}

function addPoints(
  base: Record<PlayerId, number>,
  gained: Record<PlayerId, number>,
) {
  const totals = { ...base };
  for (const id of Object.keys(gained))
    totals[id] = (totals[id] ?? 0) + (gained[id] ?? 0);
  return totals;
}

function startReveal(state: RonState, ctx: Ctx): RonState {
  const computed = computeReveal(
    state.options ?? [],
    state.votes,
    state.playerIds,
    state.facts[state.factIndex],
  );
  // Freeze the plan input now: a later kick recomputes `lies`/`foundByIds`, but the
  // timeline (segment order, duration, and deadline) must not move underneath it.
  const planLies = planLiesOf(computed);
  const reveal: RonReveal = { ...computed, planLies };
  const pointsThisFact = factPoints(reveal, state.playerIds);
  return {
    ...state,
    phase: "reveal",
    reveal,
    pointsThisFact,
    scores: addPoints(state.scores, pointsThisFact),
    deadline: ctx.now + revealDurationMs({ lies: planLies }),
  };
}

/** The reveal being left, kept for end-of-game awards. Null when there is nothing to record. */
function factRecord(state: RonState): RonFactRecord | null {
  const reveal = state.reveal;
  if (reveal === null) return null;
  return {
    foundByIds: [...reveal.foundByIds],
    picks: { ...state.votes },
    lies: reveal.lies.map((lie) => ({
      optionId: lie.optionId,
      authorId: lie.authorId,
      fooledIds: [...lie.fooledIds],
    })),
  };
}

function appendFactHistory(state: RonState): RonFactRecord[] {
  const record = factRecord(state);
  const history = state.history ?? [];
  return record === null ? history : [...history, record];
}

function startNextFact(state: RonState, ctx: Ctx): RonState {
  const history = appendFactHistory(state);
  const next = state.factIndex + 1;
  if (next >= state.facts.length)
    return { ...state, finished: true, deadline: null, history };
  return {
    ...state,
    phase: "write",
    factIndex: next,
    lies: {},
    lieErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisFact: {},
    deadline: ctx.now + WRITE_MS,
    history,
  };
}

function rejectLie(
  state: RonState,
  playerId: PlayerId,
  error: RonLieError,
): RonState {
  return { ...state, lieErrors: { ...state.lieErrors, [playerId]: error } };
}

/** Connected game players who have an accepted lie for this fact. */
function allSubmitted(state: RonState, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) =>
    state.playerIds.includes(id),
  );
  if (connected.length === 0) return false;
  return connected.every((id) => state.lies[id] !== undefined);
}

function canPick(state: RonState, playerId: PlayerId): boolean {
  return (state.options ?? []).some((option) => option.authorId !== playerId);
}

/**
 * Every connected player who has something to pick has picked. A connected player
 * with no pickable option (all options are theirs) does not block the phase.
 */
function allPicked(state: RonState, ctx: Ctx): boolean {
  const connected = ctx.connectedIds.filter((id) =>
    state.playerIds.includes(id),
  );
  if (connected.length === 0) return false;
  return connected.every(
    (id) => !canPick(state, id) || state.votes[id] !== undefined,
  );
}

// ---------- Actions ----------

function hasLied(state: RonState, playerId: PlayerId): boolean {
  return state.lies[playerId] !== undefined;
}

function mayWrite(state: RonState, playerId: PlayerId): boolean {
  return (
    state.phase === "write" &&
    state.playerIds.includes(playerId) &&
    !hasLied(state, playerId)
  );
}

function mayVote(state: RonState, playerId: PlayerId): boolean {
  return (
    state.phase === "vote" &&
    state.playerIds.includes(playerId) &&
    state.votes[playerId] === undefined
  );
}

/** Same lie as someone else's once both sides are normalized. */
function isDuplicateLie(
  state: RonState,
  playerId: PlayerId,
  cleaned: string,
): boolean {
  const normalized = normalizeLie(cleaned);
  return Object.keys(state.lies).some((otherId) => {
    if (otherId === playerId) return false;
    const other = state.lies[otherId];
    return other !== undefined && normalizeLie(other) === normalized;
  });
}

/** The first reason this cleaned lie is rejected, or null when it is acceptable. */
function lieError(
  state: RonState,
  playerId: PlayerId,
  cleaned: string,
): RonLieError | null {
  if (cleaned.length === 0 || cleaned.length > LIE_MAX_LENGTH) return "invalid";
  const fact = state.facts[state.factIndex];
  if (fact !== undefined && isTruthText(fact, cleaned)) return "truth";
  if (isDuplicateLie(state, playerId, cleaned)) return "duplicate";
  return null;
}

/** Records the lie and clears any earlier rejection for this player. */
function acceptLie(
  state: RonState,
  playerId: PlayerId,
  cleaned: string,
): RonState {
  const lies = { ...state.lies, [playerId]: cleaned };
  const lieErrors = { ...state.lieErrors };
  delete lieErrors[playerId];
  return { ...state, lies, lieErrors };
}

function applyLie(
  state: RonState,
  playerId: PlayerId,
  text: string,
  ctx: Ctx,
): RonState {
  if (!mayWrite(state, playerId)) return state;
  const cleaned = cleanLie(text);
  const error = lieError(state, playerId, cleaned);
  if (error !== null) return rejectLie(state, playerId, error);
  const next = acceptLie(state, playerId, cleaned);
  return allSubmitted(next, ctx) ? startVote(next, ctx) : next;
}

/** The chosen option, when it exists and is not the player's own lie. */
function pickedOption(
  state: RonState,
  playerId: PlayerId,
  optionId: string,
): RonOption | undefined {
  const option = (state.options ?? []).find((o) => o.id === optionId);
  if (option === undefined) return undefined;
  return option.authorId === playerId ? undefined : option;
}

function applyPick(
  state: RonState,
  playerId: PlayerId,
  optionId: string,
  ctx: Ctx,
): RonState {
  if (!mayVote(state, playerId)) return state;
  const option = pickedOption(state, playerId, optionId);
  if (option === undefined) return state;
  const next: RonState = {
    ...state,
    votes: { ...state.votes, [playerId]: option.id },
  };
  return allPicked(next, ctx) ? startReveal(next, ctx) : next;
}

// ---------- GameDefinition hooks ----------

export function onAction(
  state: RonState,
  playerId: PlayerId,
  action: RonAction,
  ctx: Ctx,
): RonState {
  if (state.finished) return state;
  if (action.type === "lie") return applyLie(state, playerId, action.text, ctx);
  return applyPick(state, playerId, action.optionId, ctx);
}

export function nextDeadline(state: RonState): number | null {
  return state.deadline;
}

export function onDeadline(state: RonState, ctx: Ctx): RonState {
  if (state.finished) return state;
  if (state.phase === "write") return startVote(state, ctx);
  if (state.phase === "vote") return startReveal(state, ctx);
  return startNextFact(state, ctx);
}

/** Copies a per-player map without one player's entry. */
function withoutPlayer<T>(record: Record<PlayerId, T>, playerId: PlayerId) {
  const next = { ...record };
  delete next[playerId];
  return next;
}

/** Their lie stays pickable for everyone else but pays no author points. */
function anonymizeOptions(
  options: RonOption[] | null,
  playerId: PlayerId,
): RonOption[] | null {
  if (options === null) return null;
  const next: RonOption[] = [];
  for (const option of options)
    next.push(
      option.authorId === playerId ? { ...option, authorId: null } : option,
    );
  return next;
}

/** Ends the current phase early once the remaining players are all done. */
function advanceIfReady(state: RonState, ctx: Ctx): RonState {
  if (state.phase === "write" && allSubmitted(state, ctx))
    return startVote(state, ctx);
  if (state.phase === "vote" && allPicked(state, ctx))
    return startReveal(state, ctx);
  return state;
}

export function onPlayerRemoved(
  state: RonState,
  playerId: PlayerId,
  ctx: Ctx,
): RonState {
  if (!state.playerIds.includes(playerId)) return state;

  const playerIds = state.playerIds.filter((id) => id !== playerId);
  const votes = withoutPlayer(state.votes, playerId);
  const options = anonymizeOptions(state.options, playerId);
  const next: RonState = {
    ...state,
    playerIds,
    lies: withoutPlayer(state.lies, playerId),
    lieErrors: withoutPlayer(state.lieErrors, playerId),
    votes,
    options,
    pointsThisFact: withoutPlayer(state.pointsThisFact, playerId),
    scores: withoutPlayer(state.scores, playerId),
    // `planLies` stays frozen: a kick can shrink or reorder `lies`, but must never
    // move the reveal's beat timing (see startReveal).
    reveal:
      state.reveal === null
        ? null
        : {
            ...computeReveal(
              options ?? [],
              votes,
              playerIds,
              state.facts[state.factIndex],
            ),
            planLies: planLiesOf(state.reveal),
          },
  };
  return advanceIfReady(next, ctx);
}

export function isOver(state: RonState): boolean {
  return state.finished;
}

export function scores(state: RonState): Record<PlayerId, number> {
  return state.scores;
}

export function bot(view: RonPlayerView, rng: Rng): RonAction | null {
  if (view.phase === "write" && view.myLie === null) {
    // rng gives each bot a distinct id so their lies do not collide as duplicates.
    return {
      type: "lie",
      text: `bot lie ${rng.int(1000000)} ${view.factNumber}`,
    };
  }
  if (view.phase === "vote" && view.myPick === null && view.options !== null) {
    const pickable = view.options.filter((o) => !o.mine);
    if (pickable.length > 0)
      return { type: "pick", optionId: rng.pick(pickable).id };
  }
  return null;
}

// ---------- Views ----------

/** Options become public once writing ends. */
function optionsVisible(state: RonState): boolean {
  return state.phase !== "write";
}

/** The prompt plus which fact of how many, shared by both views. */
function factMeta(state: RonState) {
  const fact = state.facts[state.factIndex];
  return {
    factNumber: Math.min(state.factIndex + 1, state.facts.length),
    factCount: state.facts.length,
    prompt: fact?.prompt ?? "",
  };
}

function hostOptions(state: RonState): RonHostOption[] | null {
  if (!optionsVisible(state) || state.options === null) return null;
  return state.options.map((o) => ({ id: o.id, text: o.text }));
}

function playerOptions(
  state: RonState,
  playerId: PlayerId,
): RonPlayerOption[] | null {
  if (!optionsVisible(state) || state.options === null) return null;
  return state.options.map((o) => ({
    id: o.id,
    text: o.text,
    mine: o.authorId === playerId,
  }));
}

function submittedIds(state: RonState): PlayerId[] {
  return state.playerIds.filter((id) => state.lies[id] !== undefined);
}

/** Always carries `planLies`, defaulted from `lies` for a reveal saved before it existed. */
function revealInPlay(state: RonState): RonReveal | null {
  if (state.phase !== "reveal" || state.reveal === null) return null;
  return { ...state.reveal, planLies: planLiesOf(state.reveal) };
}

function revealPoints(state: RonState, playerId: PlayerId): number | null {
  if (state.phase !== "reveal") return null;
  return state.pointsThisFact[playerId] ?? 0;
}

export function buildHostView(state: RonState): RonHostView {
  return {
    phase: state.phase,
    ...factMeta(state),
    playerIds: [...state.playerIds],
    submittedIds: submittedIds(state),
    votedIds: Object.keys(state.votes),
    totals: { ...state.scores },
    options: hostOptions(state),
    reveal: revealInPlay(state),
    pointsThisFact:
      state.phase === "reveal" ? { ...state.pointsThisFact } : null,
  };
}

export function buildPlayerView(
  state: RonState,
  playerId: PlayerId,
): RonPlayerView {
  return {
    phase: state.phase,
    ...factMeta(state),
    myLie: state.lies[playerId] ?? null,
    lieError: state.lieErrors[playerId] ?? null,
    submittedCount: submittedIds(state).length,
    playerCount: state.playerIds.length,
    myPick: state.votes[playerId] ?? null,
    totals: { ...state.scores },
    options: playerOptions(state, playerId),
    reveal: revealInPlay(state),
    myPoints: revealPoints(state, playerId),
  };
}

export const realOrNah: GameDefinition<
  RonState,
  RonAction,
  RonHostView,
  RonPlayerView,
  FactContent
> = {
  id: "real-or-nah",
  name: "Real or Nah",
  blurb: "Write fake answers to real facts. Fool your friends, find the truth.",
  minPlayers: RON_MIN_PLAYERS,
  maxPlayers: RON_MAX_PLAYERS,
  minutes: RON_MINUTES,
  contentKind: "facts",
  setup,
  actionSchema: ronActionSchema,
  onAction,
  nextDeadline,
  onDeadline,
  onPlayerRemoved,
  hostView: (state) => buildHostView(state),
  playerView: (state, playerId) => buildPlayerView(state, playerId),
  isOver,
  scores,
  bot,
  awards: realOrNahAwards,
};
