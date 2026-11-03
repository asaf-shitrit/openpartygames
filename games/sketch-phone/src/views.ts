// View builders. A link is never on the wire before its chain's replay has revealed it, so no
// view carries another player's words or drawing early. Each field is its own small helper so
// the two builders stay flat object literals.
import type { PlayerId } from "@opg/protocol";
import {
  chainLinks,
  chainOwner,
  currentChain,
  doneIds,
  favouriteOf,
  inputOf,
  myLinkOf,
  playableChains,
  revealedLinks,
  voteCountsOf,
  votesOn,
} from "./rules";
import type {
  ChainLink,
  SketchHostView,
  SketchInput,
  SketchLinkView,
  SketchPlayerOption,
  SketchPlayerView,
  SketchState,
} from "./state";
import { dealRounds } from "./state";

function linkView(link: ChainLink): SketchLinkView {
  return {
    id: link.id,
    kind: link.kind,
    authorId: link.authorId,
    text: link.kind === "words" ? link.text : null,
    doodle: link.kind === "drawing" ? link.doodle : null,
  };
}

function stageChain(state: SketchState): number | null {
  if (state.phase === "write" || state.phase === "draw" || state.phase === "describe") return null;
  return currentChain(state);
}

function chainCount(state: SketchState): number {
  return playableChains(state).length;
}

function chainNumber(state: SketchState, chain: number | null): number {
  if (chain === null) return 0;
  return playableChains(state).indexOf(chain) + 1;
}

function ownerOf(state: SketchState, chain: number | null): PlayerId | null {
  return chain === null ? null : chainOwner(state, chain);
}

/** The replay reveals its links one at a time; its vote and its favourite show the whole chain. */
function visibleLinks(state: SketchState, chain: number | null): ChainLink[] | null {
  if (chain === null) return null;
  return state.phase === "replay" ? revealedLinks(state) : chainLinks(state, chain);
}

/**
 * What a chain links up to: the links the chain on stage will show, so the presenter's "Link 3 of
 * 4" ends on 4. An empty link — a phone that missed its deadline, a kick — is skipped on stage,
 * so it is not counted here either. Before the replay the deal's count stands in.
 */
function linkCountOf(state: SketchState, chain: number | null): number {
  return chain === null ? dealRounds(state) : chainLinks(state, chain).length;
}

function countsOf(state: SketchState, chain: number | null): Record<string, number> | null {
  if (chain === null) return null;
  if (state.phase !== "vote" && state.phase !== "favourite") return null;
  return voteCountsOf(state, chain);
}

function favouriteIdOf(state: SketchState, chain: number | null): string | null {
  if (state.phase !== "favourite" || chain === null) return null;
  return favouriteOf(state, chain);
}

function votedIdsOf(state: SketchState): PlayerId[] {
  return state.phase === "vote" ? Object.keys(state.votes) : [];
}

export function buildHostView(state: SketchState): SketchHostView {
  const chain = stageChain(state);
  const ownerId = ownerOf(state, chain);
  return {
    phase: state.phase,
    playerIds: [...state.playerIds],
    // Rounds are numbered from the seed, which is round 1 (design/*SketchPhoneDraw: "Round 4 of
    // 7" at seven players), and the deal decides how many there are: a kick cannot shrink the
    // count the way a live-roster length did, nor hide a link the room already played.
    roundNumber: state.round + 1,
    roundCount: dealRounds(state),
    linkCount: linkCountOf(state, chain),
    doneIds: doneIds(state),
    totals: { ...state.scores },
    chainNumber: chainNumber(state, chain),
    chainCount: chainCount(state),
    ownerId,
    presenterId: ownerId,
    links: visibleLinkViews(state, chain),
    revealed: state.revealed,
    votedIds: votedIdsOf(state),
    voteCounts: countsOf(state, chain),
    favouriteId: favouriteIdOf(state, chain),
  };
}

function inputView(link: ChainLink | null): SketchInput | null {
  if (link === null) return null;
  return {
    authorId: link.authorId,
    kind: link.kind,
    text: link.kind === "words" ? link.text : null,
    doodle: link.kind === "drawing" ? link.doodle : null,
  };
}

function optionsOf(state: SketchState, playerId: PlayerId): SketchPlayerOption[] | null {
  if (state.phase !== "vote") return null;
  const chain = currentChain(state);
  if (chain === null) return null;
  return chainLinks(state, chain).map((link) => ({
    id: link.id,
    kind: link.kind,
    authorId: link.authorId,
    text: link.kind === "words" ? link.text : null,
    doodle: link.kind === "drawing" ? link.doodle : null,
    mine: link.authorId === playerId,
  }));
}

function myLinkVotes(state: SketchState, playerId: PlayerId, chain: number | null): number {
  if (chain === null) return 0;
  const mine = chainLinks(state, chain).find((link) => link.authorId === playerId);
  return mine === undefined ? 0 : votesOn(state, mine.id);
}

/** The link a player may fill this phase; none at all while the room replays or votes. */
function workingLink(state: SketchState, playerId: PlayerId): ChainLink | null {
  if (state.phase === "replay" || state.phase === "vote" || state.phase === "favourite") return null;
  return myLinkOf(state, playerId);
}

function wordsOf(link: ChainLink | null): string | null {
  if (link === null || link.kind !== "words") return null;
  return link.text;
}

function strokeCountOf(link: ChainLink | null): number {
  return link === null ? 0 : link.doodle.s.length;
}

function doneOf(link: ChainLink | null): boolean {
  return link === null || link.done;
}

/** The chain on stage's showable links as wire objects, or null while nothing is revealed. */
function visibleLinkViews(state: SketchState, chain: number | null) {
  const links = visibleLinks(state, chain);
  return links === null ? null : links.map(linkView);
}

/** What this chain has paid the player so far, once the room is on the favourite screen. */
function chainPointsOf(state: SketchState, playerId: PlayerId): number {
  if (state.phase !== "favourite") return 0;
  return state.pointsThisChain[playerId] ?? 0;
}

function inputViewOf(state: SketchState, link: ChainLink | null) {
  return inputView(link === null ? null : inputOf(state, link));
}

export function buildPlayerView(state: SketchState, playerId: PlayerId): SketchPlayerView {
  const chain = stageChain(state);
  const myLink = workingLink(state, playerId);
  const ownerId = ownerOf(state, chain);
  return {
    phase: state.phase,
    gameStartedAt: state.startedAt,
    playerCount: state.playerIds.length,
    // Rounds are numbered from the seed, which is round 1 (design/*SketchPhoneDraw: "Round 4 of
    // 7" at seven players), and the deal decides how many there are: a kick cannot shrink the
    // count the way a live-roster length did, nor hide a link the room already played.
    roundNumber: state.round + 1,
    roundCount: dealRounds(state),
    linkCount: linkCountOf(state, chain),
    doneCount: doneIds(state).length,
    mySuggestions: state.suggestions[playerId] ?? [],
    myLinkId: myLink === null ? null : myLink.id,
    myKind: myLink === null ? null : myLink.kind,
    myWords: wordsOf(myLink),
    myDone: doneOf(myLink),
    input: inputViewOf(state, myLink),
    myStrokeCount: strokeCountOf(myLink),
    chainNumber: chainNumber(state, chain),
    chainCount: chainCount(state),
    ownerId,
    presenterId: ownerId,
    isPresenter: ownerId !== null && ownerId === playerId,
    links: visibleLinks(state, chain)?.map(linkView) ?? null,
    options: optionsOf(state, playerId),
    myVote: state.votes[playerId] ?? null,
    votedCount: Object.keys(state.votes).length,
    voteCounts: countsOf(state, chain),
    favouriteId: favouriteIdOf(state, chain),
    myLinkVotes: myLinkVotes(state, playerId, chain),
    myChainPoints: chainPointsOf(state, playerId),
    totals: { ...state.scores },
  };
}
