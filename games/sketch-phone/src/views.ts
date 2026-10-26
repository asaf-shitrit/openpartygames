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
    roundNumber: state.round,
    roundCount: Math.max(0, state.playerIds.length - 1),
    doneIds: doneIds(state),
    totals: { ...state.scores },
    chainNumber: chainNumber(state, chain),
    chainCount: chainCount(state),
    ownerId,
    presenterId: ownerId,
    links: visibleLinks(state, chain)?.map(linkView) ?? null,
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

export function buildPlayerView(state: SketchState, playerId: PlayerId): SketchPlayerView {
  const chain = stageChain(state);
  const myLink = state.phase === "vote" || state.phase === "replay" || state.phase === "favourite" ? null : myLinkOf(state, playerId);
  const ownerId = ownerOf(state, chain);
  return {
    phase: state.phase,
    gameStartedAt: state.startedAt,
    playerCount: state.playerIds.length,
    roundNumber: state.round,
    roundCount: Math.max(0, state.playerIds.length - 1),
    doneCount: doneIds(state).length,
    myLinkId: myLink === null ? null : myLink.id,
    myKind: myLink === null ? null : myLink.kind,
    myWords: myLink !== null && myLink.kind === "words" ? myLink.text : null,
    myDone: myLink === null || myLink.done,
    input: inputView(myLink === null ? null : inputOf(state, myLink)),
    myStrokeCount: myLink === null ? 0 : myLink.doodle.s.length,
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
    myChainPoints: state.phase === "favourite" ? (state.pointsThisChain[playerId] ?? 0) : 0,
    totals: { ...state.scores },
  };
}
