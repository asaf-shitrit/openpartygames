// Sample Imposter screens for previews and UI tests, driven off a fixed server clock.
import type {
  AvatarId,
  HostRoomView,
  PlayerId,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type { ImposterHostView, ImposterPlayerView } from "../state";

const SERVER_NOW = 1735689600000;

const MAYA = "maya";
const DOV = "dov";
const PRIYA = "priya";
const SAM = "sam";
const NOA = "noa";
const LEO = "leo";

const WORD_CHECK_DEADLINE = SERVER_NOW + 6000;
const CLUES_DEADLINE = SERVER_NOW + 22000;
const VOTE_DEADLINE = SERVER_NOW + 31000;
const REVEAL_DEADLINE = SERVER_NOW + 5000;
const LAST_CHANCE_DEADLINE = SERVER_NOW + 12000;
const RESULT_DEADLINE = SERVER_NOW + 7000;

function player(
  id: PlayerId,
  name: string,
  avatar: AvatarId,
  extra: { crowns?: number; isVip?: boolean } = {},
): PlayerSummary {
  return {
    id,
    name,
    avatar,
    connected: true,
    isVip: extra.isVip ?? false,
    crowns: extra.crowns ?? 0,
    waitingForNextGame: false,
  };
}

const PLAYERS: PlayerSummary[] = [
  player(MAYA, "Maya", "star", { isVip: true }),
  player(DOV, "Dov", "toast", { crowns: 2 }),
  player(PRIYA, "Priya", "drop", { crowns: 1 }),
  player(SAM, "Sam", "cloud"),
  player(NOA, "Noa", "cat"),
  player(LEO, "Leo", "mushroom"),
];

const ALL_IDS = PLAYERS.map((p) => p.id);
const CLUE_ORDER: PlayerId[] = [MAYA, DOV, PRIYA, SAM, NOA, LEO];
const VOTED_IDS: PlayerId[] = [MAYA, DOV, SAM, NOA, LEO];

const CREW_WORD = "GIRAFFE";
const DECOY_WORD = "ZEBRA";

const TOTALS = {
  [MAYA]: 1500,
  [DOV]: 1500,
  [SAM]: 1000,
  [NOA]: 1000,
  [PRIYA]: 1000,
  [LEO]: 500,
} satisfies Record<PlayerId, number>;

const TALLY = {
  [PRIYA]: [MAYA, DOV, SAM, NOA],
  [DOV]: [LEO],
  [LEO]: [PRIYA],
} satisfies Record<PlayerId, PlayerId[]>;

const POINTS_THIS_WORD = {
  [MAYA]: 500,
  [DOV]: 500,
  [SAM]: 500,
  [NOA]: 500,
  [PRIYA]: 0,
  [LEO]: 0,
} satisfies Record<PlayerId, number>;

const HOST_BASE = {
  wordNumber: 3,
  wordCount: 6,
  playerIds: ALL_IDS,
  clueOrder: CLUE_ORDER,
  totals: TOTALS,
};

const hostWordCheck: ImposterHostView = {
  ...HOST_BASE,
  phase: "word-check",
  currentSpeakerId: null,
  doneSpeakerIds: [],
  votedIds: [],
  tally: null,
  imposterId: null,
  caught: null,
  decoyWord: null,
  crewWord: null,
  guess: null,
  guessCorrect: null,
  pointsThisWord: null,
};

const hostClues: ImposterHostView = {
  ...HOST_BASE,
  phase: "clues",
  currentSpeakerId: DOV,
  doneSpeakerIds: [MAYA],
  votedIds: [],
  tally: null,
  imposterId: null,
  caught: null,
  decoyWord: null,
  crewWord: null,
  guess: null,
  guessCorrect: null,
  pointsThisWord: null,
};

const hostVote: ImposterHostView = {
  ...HOST_BASE,
  phase: "vote",
  currentSpeakerId: null,
  doneSpeakerIds: CLUE_ORDER,
  votedIds: VOTED_IDS,
  tally: null,
  imposterId: null,
  caught: null,
  decoyWord: null,
  crewWord: null,
  guess: null,
  guessCorrect: null,
  pointsThisWord: null,
};

const hostReveal: ImposterHostView = {
  ...HOST_BASE,
  phase: "reveal",
  currentSpeakerId: null,
  doneSpeakerIds: CLUE_ORDER,
  votedIds: ALL_IDS,
  tally: TALLY,
  imposterId: PRIYA,
  caught: true,
  decoyWord: DECOY_WORD,
  crewWord: null,
  guess: null,
  guessCorrect: null,
  pointsThisWord: null,
};

const hostLastChance: ImposterHostView = {
  ...hostReveal,
  phase: "last-chance",
};

const hostResult: ImposterHostView = {
  ...hostReveal,
  phase: "result",
  crewWord: CREW_WORD,
  guess: "horse",
  guessCorrect: false,
  pointsThisWord: POINTS_THIS_WORD,
};

const PLAYER_BASE = {
  wordNumber: 3,
  wordCount: 6,
  clueOrder: CLUE_ORDER,
  voteCandidates: [MAYA, PRIYA, SAM, NOA, LEO],
  votedCount: VOTED_IDS.length,
  totals: TOTALS,
};

/** Maya, crew, reading her secret word during word-check. */
const phoneCrewCard: ImposterPlayerView = {
  ...PLAYER_BASE,
  phase: "word-check",
  role: "crew",
  word: CREW_WORD,
  currentSpeakerId: null,
  isMyTurn: false,
  nextSpeakerId: null,
  myVote: null,
  imposterId: null,
  caught: null,
  isMyLastChance: false,
  decoyWord: null,
  myGuess: null,
  crewWord: null,
  guess: null,
  guessCorrect: null,
  myPoints: null,
};

/** Priya, the imposter, reading her decoy word. */
const phoneImposterCard: ImposterPlayerView = {
  ...phoneCrewCard,
  role: "imposter",
  word: DECOY_WORD,
};

/** Dov's turn to give a clue. */
const phoneYourTurn: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "clues",
  word: CREW_WORD,
  currentSpeakerId: DOV,
  isMyTurn: true,
  nextSpeakerId: PRIYA,
};

/** Dov picking someone to vote for. */
const phoneVoteSelecting: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "vote",
  word: null,
  currentSpeakerId: null,
  myVote: null,
};

/** Dov's vote is locked in on Priya. */
const phoneVoteLocked: ImposterPlayerView = {
  ...phoneVoteSelecting,
  myVote: PRIYA,
};

/** Dov sees who the imposter was. */
const phoneReveal: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "reveal",
  word: null,
  myVote: PRIYA,
  imposterId: PRIYA,
  caught: true,
};

/** Priya's last chance to guess the crew word. */
const phoneLastChance: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "last-chance",
  role: "imposter",
  word: null,
  myVote: LEO,
  imposterId: PRIYA,
  caught: true,
  isMyLastChance: true,
  decoyWord: DECOY_WORD,
  myGuess: null,
};

/** Dov watches Priya guess. */
const phoneWaitingForGuess: ImposterPlayerView = {
  ...phoneLastChance,
  role: "crew",
  isMyLastChance: false,
  decoyWord: null,
};

/** Priya watches Dov's clue, and she is up next. */
const phoneWatchingClue: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "clues",
  role: "imposter",
  word: DECOY_WORD,
  currentSpeakerId: DOV,
  isMyTurn: false,
  nextSpeakerId: PRIYA,
};

/** Sam watches Dov's clue and waits two seats out. */
const phoneWatchingClueLater: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "clues",
  word: CREW_WORD,
  currentSpeakerId: DOV,
  isMyTurn: false,
  nextSpeakerId: PRIYA,
};

/** Priya sees the crew caught her. */
const phoneImposterReveal: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "reveal",
  role: "imposter",
  word: null,
  myVote: LEO,
  imposterId: PRIYA,
  caught: true,
};

/** Priya got away with it. */
const phoneImposterRevealFree: ImposterPlayerView = {
  ...phoneImposterReveal,
  caught: false,
};

/** Priya's result after a last-chance guess that landed. */
const phoneImposterResult: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  role: "imposter",
  word: null,
  myVote: LEO,
  imposterId: PRIYA,
  caught: true,
  crewWord: CREW_WORD,
  guess: "horse",
  guessCorrect: true,
  myPoints: 1000,
};

/** Dov sees the word and his points after the guess. */
const phoneResult: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  word: null,
  myVote: PRIYA,
  imposterId: PRIYA,
  caught: true,
  crewWord: CREW_WORD,
  guess: "horse",
  guessCorrect: false,
  myPoints: 500,
};

function commonRoom(view: ImposterHostView | ImposterPlayerView) {
  return {
    code: "BKTZ",
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players: PLAYERS,
    vipId: MAYA,
    locked: false,
    games: [],
    selectedGameId: "imposter",
    packs: [],
    lastResult: null,
    game: { id: "imposter", view, deadline: null },
    serverNow: SERVER_NOW,
  };
}

function hostRoom(
  view: ImposterHostView,
  deadline: number | null,
): HostRoomView {
  return {
    role: "host",
    ...commonRoom(view),
    game: { id: "imposter", view, deadline },
  };
}

function playerRoom(
  view: ImposterPlayerView,
  you: PlayerId,
  deadline: number | null,
): PlayerRoomView {
  return {
    role: "player",
    you,
    ...commonRoom(view),
    game: { id: "imposter", view, deadline },
  };
}

export const imposterPreviews: Array<{
  label: string;
  surface: "host" | "phone";
  view: ImposterHostView | ImposterPlayerView;
  room: HostRoomView | PlayerRoomView;
}> = [
  {
    label: "Host: check your phones",
    surface: "host",
    view: hostWordCheck,
    room: hostRoom(hostWordCheck, WORD_CHECK_DEADLINE),
  },
  {
    label: "Host: clues",
    surface: "host",
    view: hostClues,
    room: hostRoom(hostClues, CLUES_DEADLINE),
  },
  {
    label: "Host: vote",
    surface: "host",
    view: hostVote,
    room: hostRoom(hostVote, VOTE_DEADLINE),
  },
  {
    label: "Host: reveal",
    surface: "host",
    view: hostReveal,
    room: hostRoom(hostReveal, REVEAL_DEADLINE),
  },
  {
    label: "Host: last chance",
    surface: "host",
    view: hostLastChance,
    room: hostRoom(hostLastChance, LAST_CHANCE_DEADLINE),
  },
  {
    label: "Host: result",
    surface: "host",
    view: hostResult,
    room: hostRoom(hostResult, RESULT_DEADLINE),
  },
  {
    label: "Phone: Maya crew card",
    surface: "phone",
    view: phoneCrewCard,
    room: playerRoom(phoneCrewCard, MAYA, WORD_CHECK_DEADLINE),
  },
  {
    label: "Phone: Priya imposter card",
    surface: "phone",
    view: phoneImposterCard,
    room: playerRoom(phoneImposterCard, PRIYA, WORD_CHECK_DEADLINE),
  },
  {
    label: "Phone: Dov your turn",
    surface: "phone",
    view: phoneYourTurn,
    room: playerRoom(phoneYourTurn, DOV, CLUES_DEADLINE),
  },
  {
    label: "Phone: Dov vote selecting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, DOV, VOTE_DEADLINE),
  },
  {
    label: "Phone: Dov vote locked in",
    surface: "phone",
    view: phoneVoteLocked,
    room: playerRoom(phoneVoteLocked, DOV, VOTE_DEADLINE),
  },
  {
    label: "Phone: Dov reveal",
    surface: "phone",
    view: phoneReveal,
    room: playerRoom(phoneReveal, DOV, REVEAL_DEADLINE),
  },
  {
    label: "Phone: Priya last chance",
    surface: "phone",
    view: phoneLastChance,
    room: playerRoom(phoneLastChance, PRIYA, LAST_CHANCE_DEADLINE),
  },
  {
    label: "Phone: Dov waiting for guess",
    surface: "phone",
    view: phoneWaitingForGuess,
    room: playerRoom(phoneWaitingForGuess, DOV, LAST_CHANCE_DEADLINE),
  },
  {
    label: "Phone: Priya watching Dov's clue",
    surface: "phone",
    view: phoneWatchingClue,
    room: playerRoom(phoneWatchingClue, PRIYA, CLUES_DEADLINE),
  },
  {
    label: "Phone: Sam watching Dov's clue",
    surface: "phone",
    view: phoneWatchingClueLater,
    room: playerRoom(phoneWatchingClueLater, SAM, CLUES_DEADLINE),
  },
  {
    label: "Phone: Priya reveal caught",
    surface: "phone",
    view: phoneImposterReveal,
    room: playerRoom(phoneImposterReveal, PRIYA, REVEAL_DEADLINE),
  },
  {
    label: "Phone: Priya reveal free",
    surface: "phone",
    view: phoneImposterRevealFree,
    room: playerRoom(phoneImposterRevealFree, PRIYA, REVEAL_DEADLINE),
  },
  {
    label: "Phone: Priya result",
    surface: "phone",
    view: phoneImposterResult,
    room: playerRoom(phoneImposterResult, PRIYA, RESULT_DEADLINE),
  },
  {
    label: "Phone: Dov result",
    surface: "phone",
    view: phoneResult,
    room: playerRoom(phoneResult, DOV, RESULT_DEADLINE),
  },
];
