// Pure helpers for Doodle Bluff: none of these touch GameContext, so they are unit-testable
// without a clock or an rng. Phase transitions that need `ctx` live in index.ts and call these.
import type { PlayerId } from "@opg/protocol";
import {
  drawingIdOf,
  MAX_POINTS_PER_CHUNK,
  MAX_POINTS_PER_DOODLE,
  MAX_STROKES_PER_DOODLE,
  MIN_OPTIONS,
  MIN_STROKES,
  POINTS_PER_FOOL,
  POINTS_PER_FOUND,
  POINTS_TRUTH,
  TITLE_MAX_LENGTH,
  type Doodle,
  type DoodleFooledTitle,
  type DoodleGalleryEntry,
  type DoodleOption,
  type DoodleReveal,
  type DoodleRoundRecord,
  type DoodleState,
  type DoodleTitleError,
  type DrawingSlot,
  type Stroke,
} from "./state";

// ---------- Text ----------

/**
 * Mirrors packages/sdk/src/text.ts's normalizeAnswer: lowercase, trim, strip punctuation, drop a
 * leading a/an/the, collapse inner whitespace. Kept local so this game stays independent of the
 * runtime @opg/sdk build (type imports only), the same choice real-or-nah's normalizeLie makes.
 */
export function normalizeTitle(text: string): string {
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
export function cleanTitle(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function isTruthTitle(promptText: string, cleaned: string): boolean {
  return normalizeTitle(cleaned) === normalizeTitle(promptText);
}

function isDuplicateTitle(existing: Record<PlayerId, string>, playerId: PlayerId, cleaned: string): boolean {
  const normalized = normalizeTitle(cleaned);
  return Object.keys(existing).some((otherId) => {
    if (otherId === playerId) return false;
    const other = existing[otherId];
    return other !== undefined && normalizeTitle(other) === normalized;
  });
}

/** The first reason this cleaned title is rejected, or null when it is acceptable. */
export function titleErrorOf(
  promptText: string,
  existing: Record<PlayerId, string>,
  playerId: PlayerId,
  cleaned: string,
): DoodleTitleError | null {
  if (cleaned.length === 0 || cleaned.length > TITLE_MAX_LENGTH) return "invalid";
  if (isTruthTitle(promptText, cleaned)) return "truth";
  if (isDuplicateTitle(existing, playerId, cleaned)) return "duplicate";
  return null;
}

// ---------- Draw phase ----------

function isSlotDone(state: DoodleState, drawingId: string): boolean {
  return state.drawings[drawingId]?.done === true;
}

export function isDoneDrawing(state: DoodleState, playerId: PlayerId): boolean {
  return isSlotDone(state, drawingIdOf(playerId, 0)) && isSlotDone(state, drawingIdOf(playerId, 1));
}

export function doneDrawingIds(state: DoodleState): PlayerId[] {
  return state.playerIds.filter((id) => isDoneDrawing(state, id));
}

/** How many of a player's two drawings are finished. The TV shows this for the whole draw phase. */
export function doneDrawingCount(state: DoodleState, playerId: PlayerId): number {
  return ([0, 1] as const).filter((slot) => isSlotDone(state, drawingIdOf(playerId, slot))).length;
}

export function totalPoints(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.p.length / 2, 0);
}

/** Whether appending `chunk` to `existing` stays within every doodle cap. */
export function chunkFits(existing: Doodle, chunk: readonly Stroke[]): boolean {
  if (totalPoints(chunk) > MAX_POINTS_PER_CHUNK) return false;
  if (existing.s.length + chunk.length > MAX_STROKES_PER_DOODLE) return false;
  if (totalPoints(existing.s) + totalPoints(chunk) > MAX_POINTS_PER_DOODLE) return false;
  return true;
}

// ---------- Shown-drawing queue ----------

/** Round-robin candidate order: every player's first drawing, then every player's second. */
export function candidateOrder(shuffledPlayerIds: readonly PlayerId[]): string[] {
  return [
    ...shuffledPlayerIds.map((id) => drawingIdOf(id, 0)),
    ...shuffledPlayerIds.map((id) => drawingIdOf(id, 1)),
  ];
}

function isValidDrawing(drawing: DrawingSlot | undefined): drawing is DrawingSlot {
  return drawing !== undefined && drawing.doodle.s.length >= MIN_STROKES;
}

/**
 * The next showable drawing from `state.queueOrder`, starting at `state.queuePos`. Skips a slot
 * that never arrived (blank) or was dropped by a kick, so a later candidate fills in automatically
 * and the shown count holds without any separate "refill" step.
 */
export function nextValidDrawing(state: DoodleState): { drawingId: string; queuePos: number } | null {
  for (let i = state.queuePos; i < state.queueOrder.length; i += 1) {
    const id = state.queueOrder[i];
    if (id === undefined) continue;
    if (isValidDrawing(state.drawings[id])) return { drawingId: id, queuePos: i + 1 };
  }
  return null;
}

// ---------- Removing a player ----------

export function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

/** Drops a drawing that is not the one currently on stage (that one stays frozen). */
export function removeDrawing(state: DoodleState, drawingId: string): DoodleState {
  if (drawingId === state.currentDrawingId) return state;
  if (state.drawings[drawingId] === undefined) return state;
  const drawings = { ...state.drawings };
  delete drawings[drawingId];
  return { ...state, drawings, drawOrder: state.drawOrder.filter((id) => id !== drawingId) };
}

/** Their title stays pickable for everyone else but pays no author points. */
export function anonymizeAuthor(options: DoodleOption[] | null, playerId: PlayerId): DoodleOption[] | null {
  if (options === null) return null;
  return options.map((o) => (o.authorId === playerId ? { ...o, authorId: null } : o));
}

// ---------- Non-artist eligibility ----------

export function nonArtistIds(state: DoodleState, artistId: PlayerId): PlayerId[] {
  return state.playerIds.filter((id) => id !== artistId);
}

/** Whether `playerId` has at least one option on the ballot that is not their own. */
export function canVoteOption(options: readonly DoodleOption[] | null, playerId: PlayerId): boolean {
  return (options ?? []).some((o) => o.authorId !== playerId);
}

// ---------- Ballot building ----------

export interface OptionEntry {
  text: string;
  authorId: PlayerId | null;
  isTruth: boolean;
  isHouse?: boolean;
}

export function truthEntry(drawing: DrawingSlot): OptionEntry {
  return { text: drawing.prompt, authorId: null, isTruth: true };
}

export function titleEntriesOf(state: DoodleState, artistId: PlayerId): OptionEntry[] {
  return nonArtistIds(state, artistId).flatMap((id) => {
    const title = state.titles[id];
    return title === undefined ? [] : [{ text: title, authorId: id, isTruth: false }];
  });
}

/** Tops `entries` up to MIN_OPTIONS with house titles nobody has used yet. */
export function topUpWithHouseTitles(
  entries: readonly OptionEntry[],
  shuffledHouseTitles: readonly string[],
): OptionEntry[] {
  const out = [...entries];
  const seen = out.map((e) => normalizeTitle(e.text));
  for (const house of shuffledHouseTitles) {
    if (out.length >= MIN_OPTIONS) break;
    const normalized = normalizeTitle(house);
    if (seen.includes(normalized)) continue;
    seen.push(normalized);
    out.push({ text: house, authorId: null, isTruth: false, isHouse: true });
  }
  return out;
}

// ---------- Reveal and scoring ----------

function fooledTitleOf(
  option: DoodleOption,
  votes: Record<PlayerId, string>,
  playerIds: readonly PlayerId[],
): DoodleFooledTitle {
  const fooledIds = playerIds.filter((id) => votes[id] === option.id);
  return {
    optionId: option.id,
    text: option.text,
    authorId: option.authorId,
    fooledIds,
    points: fooledIds.length * POINTS_PER_FOOL,
  };
}

/** Every fake title worth telling the story of: an authored one, or a house title that fooled someone. */
function revealedTitlesOf(
  options: readonly DoodleOption[],
  votes: Record<PlayerId, string>,
  playerIds: readonly PlayerId[],
): DoodleFooledTitle[] {
  const out: DoodleFooledTitle[] = [];
  for (const option of options) {
    if (option.isTruth) continue;
    const title = fooledTitleOf(option, votes, playerIds);
    const houseFooled = option.isHouse === true && title.fooledIds.length > 0;
    if (title.authorId !== null || houseFooled) out.push(title);
  }
  return out;
}

export interface Ballot {
  drawingId: string;
  drawing: DrawingSlot;
  options: readonly DoodleOption[];
  votes: Record<PlayerId, string>;
  playerIds: readonly PlayerId[];
}

export function computeReveal(ballot: Ballot): DoodleReveal {
  const { drawing, drawingId, options, votes, playerIds } = ballot;
  const truthId = options.find((o) => o.isTruth)?.id ?? "";
  const foundByIds = playerIds.filter((id) => votes[id] === truthId);
  return {
    artistId: drawing.artistId,
    drawingId,
    doodle: drawing.doodle,
    truthOptionId: truthId,
    prompt: drawing.prompt,
    foundByIds,
    titles: revealedTitlesOf(options, votes, playerIds),
    artistPoints: foundByIds.length * POINTS_PER_FOUND,
  };
}

/** Adds `amount` to `points[id]` only when `id` already has an entry (a still-rostered player). */
function credit(points: Record<PlayerId, number>, id: PlayerId | null, amount: number): void {
  if (id === null) return;
  const current = points[id];
  if (current !== undefined) points[id] = current + amount;
}

function addTruthPoints(points: Record<PlayerId, number>, foundByIds: readonly PlayerId[]): void {
  for (const id of foundByIds) credit(points, id, POINTS_TRUTH);
}

function addTitlePoints(points: Record<PlayerId, number>, titles: readonly DoodleFooledTitle[]): void {
  for (const title of titles) credit(points, title.authorId, title.points);
}

/**
 * Every vote pays exactly 500 to someone (the artist, or a fake title's author) or to nobody (a
 * house title); a voter who found the truth also earns 1000 for themselves. The artist earns
 * nothing when nobody finds it — not a penalty, just no reward.
 */
export function pointsFor(reveal: DoodleReveal, playerIds: readonly PlayerId[]) {
  const points: Record<PlayerId, number> = {};
  for (const id of playerIds) points[id] = 0;
  addTruthPoints(points, reveal.foundByIds);
  addTitlePoints(points, reveal.titles);
  credit(points, reveal.artistId, reveal.artistPoints);
  return points;
}

export function addPoints(scores: Record<PlayerId, number>, gained: Record<PlayerId, number>) {
  const next = { ...scores };
  for (const id of Object.keys(gained)) {
    if (next[id] === undefined) continue;
    next[id] = (next[id] ?? 0) + (gained[id] ?? 0);
  }
  return next;
}

// ---------- History and gallery ----------

export function roundRecordOf(state: DoodleState): DoodleRoundRecord | null {
  const reveal = state.reveal;
  if (reveal === null) return null;
  return {
    drawingId: reveal.drawingId,
    artistId: reveal.artistId,
    foundByIds: [...reveal.foundByIds],
    titles: reveal.titles.map((t) => ({ authorId: t.authorId, fooledIds: [...t.fooledIds] })),
  };
}

function foundCountsByDrawing(history: readonly DoodleRoundRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of history) counts.set(record.drawingId, record.foundByIds.length);
  return counts;
}

/** Every drawing still in state, gallery order, with its artist, its title, and whether it was shown. */
export function galleryEntries(state: DoodleState): DoodleGalleryEntry[] {
  const found = foundCountsByDrawing(state.history);
  return state.drawOrder.flatMap((id) => {
    const drawing = state.drawings[id];
    if (drawing === undefined) return [];
    const foundByCount = found.get(id) ?? null;
    return [
      {
        drawingId: id,
        artistId: drawing.artistId,
        doodle: drawing.doodle,
        title: drawing.prompt,
        shown: foundByCount !== null,
        foundByCount,
      },
    ];
  });
}
