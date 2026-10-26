// Pure helpers for Sketch Phone. Nothing here touches GameContext, so the phase arithmetic is
// unit-testable without a clock or an rng; transitions that need `ctx` live in index.ts.
import type { PlayerId } from "@opg/protocol";
import { MAX_POINTS_PER_DOODLE, MAX_STROKES_PER_DOODLE, type Doodle, type Stroke } from "@opg/sdk";
import type { ChainLink, SketchState } from "./state";
import { linkIdOf, TEXT_MAX_LENGTH } from "./state";

/**
 * Rules-level bound on the points in one "strokes" action, the same one Doodle Bluff uses: the
 * pad splits chunks by their serialized frame too, so this only turns a chunk that would not fit
 * anyway into a no-op instead of a blown cap.
 */
export const MAX_POINTS_PER_CHUNK = 400;

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

// ---------- Words ----------

/** Trim and collapse inner spaces; the length is checked against the result. */
export function cleanWords(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Whether a cleaned phrase can be a link: one character, and no longer than the cap. */
export function wordsAcceptable(cleaned: string): boolean {
  return cleaned.length > 0 && cleaned.length <= TEXT_MAX_LENGTH;
}

// ---------- Links ----------

export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** A link is showable once it was handed in and actually holds something. */
export function hasContent(link: ChainLink | undefined): link is ChainLink {
  if (link === undefined || !link.done) return false;
  return link.kind === "words" ? link.text.length > 0 : link.doodle.s.length > 0;
}

/** The chain `playerId` may work on this round, or null when they have no link at all. */
export function chainFor(state: SketchState, playerId: PlayerId): number | null {
  return state.chainsFor[state.round]?.[playerId] ?? null;
}

/** The link `playerId` fills this round, or null when there is none for them. */
export function myLinkOf(state: SketchState, playerId: PlayerId): ChainLink | null {
  const chain = chainFor(state, playerId);
  if (chain === null) return null;
  const link = state.links[linkIdOf(chain, state.round)];
  return link !== undefined && link.authorId === playerId ? link : null;
}

/**
 * What a link was made from: the nearest earlier link in the same chain that holds the opposite
 * kind — a drawing is made from words, and words from a drawing. A kick or an empty deadline can
 * leave a hole, so it walks back over anything with no content, and a words link with no drawing
 * behind it at all falls back to the nearest words: the chain gets shorter instead of stopping.
 * A null input means the player has nothing to work from, and cannot act this round.
 */
export function inputOf(state: SketchState, link: ChainLink): ChainLink | null {
  let fallback: ChainLink | null = null;
  for (let step = link.step - 1; step >= 0; step -= 1) {
    const candidate = state.links[linkIdOf(link.chain, step)];
    if (!hasContent(candidate)) continue;
    if (candidate.kind !== link.kind) return candidate;
    fallback ??= candidate;
  }
  return fallback;
}

/** Whether the player has something they can do this round. */
export function canWork(state: SketchState, playerId: PlayerId): boolean {
  const link = myLinkOf(state, playerId);
  if (link === null || link.done) return false;
  return link.step === 0 || inputOf(state, link) !== null;
}

/** Everyone who is done: handed in, or nothing left to hand in. */
export function doneIds(state: SketchState): PlayerId[] {
  return state.playerIds.filter((id) => state.doneIds[id] === true || !canWork(state, id));
}

/** Every player has finished the current round. */
export function roundComplete(state: SketchState): boolean {
  return state.playerIds.every((id) => state.doneIds[id] === true || !canWork(state, id));
}

/** Whether only players who are not connected are still holding the round up. */
export function onlyAbsentLeft(state: SketchState, connectedIds: readonly PlayerId[]): boolean {
  const connected = state.playerIds.filter((id) => connectedIds.includes(id));
  return connected.length > 0 && connected.every((id) => state.doneIds[id] === true || !canWork(state, id));
}

// ---------- A chain and its replay ----------

/** The chain on stage: being replayed, voted on or celebrated. Null before the replay starts. */
export function currentChain(state: SketchState): number | null {
  return state.replayOrder[state.replayPos] ?? null;
}

/** A chain's showable links, in step order. */
export function chainLinks(state: SketchState, chain: number): ChainLink[] {
  const links: ChainLink[] = [];
  for (const link of Object.values(state.links)) {
    if (link.chain === chain && hasContent(link)) links.push(link);
  }
  return links.sort((a, b) => a.step - b.step);
}

/** The chain's own author: whoever wrote its seed. Null when the seed never arrived. */
export function chainOwner(state: SketchState, chain: number): PlayerId | null {
  const seed = state.links[linkIdOf(chain, 0)];
  return seed === undefined ? null : seed.authorId;
}

/** The links of the chain on stage that may be on screen now. */
export function revealedLinks(state: SketchState): ChainLink[] {
  const chain = currentChain(state);
  if (chain === null) return [];
  return chainLinks(state, chain).slice(0, state.revealed);
}

/** Chains that hold at least one link; the rest are skipped rather than replayed empty. */
export function playableChains(state: SketchState): number[] {
  return state.replayOrder.filter((chain) => chainLinks(state, chain).length > 0);
}

// ---------- Voting ----------

/** Voters on a link who are still in the room. */
export function votesOn(state: SketchState, linkId: string): number {
  const voters = state.voters[linkId] ?? [];
  return voters.filter((id) => state.playerIds.includes(id)).length;
}

/** Every link on the chain on stage, keyed by id, with the votes it collected. */
export function voteCountsOf(state: SketchState, chain: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const link of chainLinks(state, chain)) counts[link.id] = votesOn(state, link.id);
  return counts;
}

/** The links `playerId` may vote for: everything on the chain but their own. */
export function votableLinks(state: SketchState, playerId: PlayerId): ChainLink[] {
  const chain = currentChain(state);
  if (chain === null) return [];
  return chainLinks(state, chain).filter((link) => link.authorId !== playerId);
}

/**
 * The chain's favourite: the most-voted link, earliest step first on a tie, or null when nobody
 * voted. Every vote pays the link's author; nothing else pays anybody.
 */
export function favouriteOf(state: SketchState, chain: number): string | null {
  let best: string | null = null;
  let bestVotes = 0;
  for (const link of chainLinks(state, chain)) {
    const votes = votesOn(state, link.id);
    if (votes > bestVotes) {
      best = link.id;
      bestVotes = votes;
    }
  }
  return best;
}

/** Points the chain on stage pays out: POINTS_PER_VOTE for every vote a still-rostered author got. */
export function pointsOnChain(state: SketchState, chain: number, perVote: number): Record<PlayerId, number> {
  const points: Record<PlayerId, number> = {};
  for (const id of state.playerIds) points[id] = 0;
  for (const link of chainLinks(state, chain)) {
    const current = points[link.authorId];
    if (current === undefined) continue;
    points[link.authorId] = current + votesOn(state, link.id) * perVote;
  }
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

// ---------- Removing a player ----------

/** Drops a player's votes from every link, roster bookkeeping aside. */
export function votersWithout(state: SketchState, playerId: PlayerId): Record<string, PlayerId[]> {
  const voters: Record<string, PlayerId[]> = {};
  for (const [linkId, ids] of Object.entries(state.voters)) {
    const kept = ids.filter((id) => id !== playerId);
    if (kept.length > 0) voters[linkId] = kept;
  }
  return voters;
}
