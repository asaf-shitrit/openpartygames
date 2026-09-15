// View builders. A crew member's view must never carry the decoy word or the
// imposter's id before the reveal, and the imposter never sees the crew word
// before the result.
import type { PlayerId } from "@opg/protocol";
import type {
  ImposterHostView,
  ImposterPlayerView,
  ImposterState,
  ImposterWord,
} from "./state";

function currentWord(state: ImposterState): ImposterWord | null {
  return state.words[state.wordIndex] ?? null;
}

function isRevealed(state: ImposterState): boolean {
  return (
    state.phase === "reveal" ||
    state.phase === "last-chance" ||
    state.phase === "result"
  );
}

function currentSpeakerId(state: ImposterState): PlayerId | null {
  if (state.phase !== "clues") return null;
  return state.clueOrder[state.clueIndex] ?? null;
}

/** The in-progress guess LENGTH only, during last-chance; never the letters. */
function hostGuessLength(state: ImposterState): number | null {
  if (state.phase !== "last-chance") return null;
  return state.guessLength ?? 0;
}

function wordNumber(state: ImposterState): number {
  return Math.min(state.wordIndex + 1, state.words.length);
}

function revealedImposterId(word: ImposterWord | null): PlayerId | null {
  if (word === null) return null;
  return word.imposterId;
}

function revealedDecoyWord(word: ImposterWord | null): string | null {
  if (word === null) return null;
  return word.decoy;
}

/** Everything the host may see once the votes are in. */
function hostRevealedFields(state: ImposterState, word: ImposterWord | null) {
  if (!isRevealed(state)) {
    return { tally: null, imposterId: null, caught: null, decoyWord: null };
  }
  return {
    tally: { ...state.tally },
    imposterId: revealedImposterId(word),
    caught: state.caught,
    decoyWord: revealedDecoyWord(word),
  };
}

/** The crew word and guess are only public in the result. */
function hostResultFields(state: ImposterState, word: ImposterWord | null) {
  const result = state.phase === "result";
  return {
    crewWord: result ? (word?.crew ?? null) : null,
    guess: result ? state.guess : null,
    guessCorrect: result ? state.guessCorrect : null,
    pointsThisWord: result ? { ...state.pointsThisWord } : null,
  };
}

export function buildHostView(state: ImposterState): ImposterHostView {
  const word = currentWord(state);
  return {
    phase: state.phase,
    wordNumber: wordNumber(state),
    wordCount: state.words.length,
    playerIds: [...state.playerIds],
    clueOrder: [...state.clueOrder],
    currentSpeakerId: currentSpeakerId(state),
    doneSpeakerIds: [...state.doneSpeakerIds],
    votedIds: Object.keys(state.votes),
    totals: { ...state.scores },
    guessLength: hostGuessLength(state),
    ...hostRevealedFields(state, word),
    ...hostResultFields(state, word),
  };
}

function ownRole(isImposter: boolean): "crew" | "imposter" {
  return isImposter ? "imposter" : "crew";
}

/** The player's own word: the decoy for the imposter, the crew word otherwise. */
function ownWord(
  word: ImposterWord | null,
  isImposter: boolean,
): string | null {
  if (word === null) return null;
  return isImposter ? word.decoy : word.crew;
}

function nextSpeakerId(
  state: ImposterState,
  speaker: PlayerId | null,
): PlayerId | null {
  if (state.phase !== "clues" || speaker === null) return null;
  return state.clueOrder[state.clueIndex + 1] ?? null;
}

/** Who the imposter is, once everyone is allowed to know. */
function playerRevealSecrets(state: ImposterState, word: ImposterWord | null) {
  if (!isRevealed(state)) return { imposterId: null, caught: null };
  return { imposterId: word?.imposterId ?? null, caught: state.caught };
}

/** The imposter gets their decoy word back for the last-chance guess. */
function playerLastChance(
  state: ImposterState,
  word: ImposterWord | null,
  isImposter: boolean,
) {
  if (state.phase !== "last-chance" || !isImposter) {
    return { isMyLastChance: false, decoyWord: null, myGuess: null };
  }
  return {
    isMyLastChance: true,
    decoyWord: word?.decoy ?? null,
    myGuess: state.guess,
  };
}

function playerResultFields(
  state: ImposterState,
  word: ImposterWord | null,
  playerId: PlayerId,
) {
  if (state.phase !== "result") {
    return { crewWord: null, guess: null, guessCorrect: null, myPoints: null };
  }
  return {
    crewWord: word?.crew ?? null,
    guess: state.guess,
    guessCorrect: state.guessCorrect,
    myPoints: state.pointsThisWord[playerId] ?? 0,
  };
}

export function buildPlayerView(
  state: ImposterState,
  playerId: PlayerId,
): ImposterPlayerView {
  const word = currentWord(state);
  const imposterId = word?.imposterId ?? null;
  const isImposter = imposterId !== null && imposterId === playerId;
  const speaker = currentSpeakerId(state);
  return {
    phase: state.phase,
    wordNumber: wordNumber(state),
    wordCount: state.words.length,
    role: ownRole(isImposter),
    word: ownWord(word, isImposter),
    clueOrder: [...state.clueOrder],
    currentSpeakerId: speaker,
    isMyTurn: speaker === playerId,
    nextSpeakerId: nextSpeakerId(state, speaker),
    myVote: state.votes[playerId] ?? null,
    voteCandidates: state.playerIds.filter((id) => id !== playerId),
    votedCount: Object.keys(state.votes).length,
    totals: { ...state.scores },
    ...playerRevealSecrets(state, word),
    ...playerLastChance(state, word, isImposter),
    ...playerResultFields(state, word, playerId),
  };
}
