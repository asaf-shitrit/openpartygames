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
const REVEAL_DEADLINE = SERVER_NOW + 1000;
const LAST_CHANCE_DEADLINE = SERVER_NOW + 12000;
const RESULT_DEADLINE = SERVER_NOW + 7000;

/** A reveal already at its 11s mark, so previews and tests render the settled end state. */
export const REVEAL_PREVIEW_START = SERVER_NOW - 11000;

/** A last-chance already 10s into its 15s countdown, mid-typing. */
const LAST_CHANCE_MID_START = SERVER_NOW - 10000;
const LAST_CHANCE_MID_DEADLINE = LAST_CHANCE_MID_START + 15000;

/** A result already past its settle beat, so previews and tests render the settled end state. */
export const RESULT_PREVIEW_START = SERVER_NOW - 12000;
const RESULT_PREVIEW_DEADLINE = SERVER_NOW + 2000;

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

/** Dov takes the most votes, but the imposter is Priya. */
const WRONG_TALLY = {
  [DOV]: [MAYA, SAM, NOA],
  [LEO]: [DOV, PRIYA],
  [PRIYA]: [LEO],
} satisfies Record<PlayerId, PlayerId[]>;

/** Dov and Priya tie 2-2. */
const TIE_TALLY = {
  [DOV]: [MAYA, SAM],
  [PRIYA]: [DOV, NOA],
  [LEO]: [PRIYA],
  [MAYA]: [LEO],
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
  guessLength: null,
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
  guessLength: null,
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
  guessLength: null,
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
  guessLength: null,
};

const hostLastChance: ImposterHostView = {
  ...hostReveal,
  phase: "last-chance",
  guessLength: 5,
};

/** Dov takes the most votes; Priya, the real imposter, gets away. */
const hostRevealWrong: ImposterHostView = {
  ...hostReveal,
  tally: WRONG_TALLY,
  caught: false,
};

/** Dov and Priya tie; nobody can be caught on a tie. */
const hostRevealTie: ImposterHostView = {
  ...hostReveal,
  tally: TIE_TALLY,
  caught: false,
};

/** Nobody voted at all. */
const hostRevealNoVotes: ImposterHostView = {
  ...hostReveal,
  tally: {},
  caught: false,
};

const hostResult: ImposterHostView = {
  ...hostReveal,
  phase: "result",
  crewWord: CREW_WORD,
  guess: "horse",
  guessCorrect: false,
  pointsThisWord: POINTS_THIS_WORD,
};

/** Priya was caught and missed the guess, a settled render for the result moment. */
const hostResultCaughtNope: ImposterHostView = {
  ...hostReveal,
  phase: "result",
  crewWord: CREW_WORD,
  guess: "HORSE",
  guessCorrect: false,
  pointsThisWord: POINTS_THIS_WORD,
};

const POINTS_THIS_WORD_STOLEN = {
  [MAYA]: 0,
  [DOV]: 0,
  [SAM]: 0,
  [NOA]: 0,
  [PRIYA]: 1000,
  [LEO]: 0,
} satisfies Record<PlayerId, number>;

/** Priya was caught but stole the word back with a correct guess. */
const hostResultCaughtGotIt: ImposterHostView = {
  ...hostReveal,
  phase: "result",
  crewWord: CREW_WORD,
  guess: "GIRAFFE",
  guessCorrect: true,
  pointsThisWord: POINTS_THIS_WORD_STOLEN,
};

const POINTS_THIS_WORD_ESCAPED = {
  [MAYA]: 0,
  [DOV]: 0,
  [SAM]: 0,
  [NOA]: 0,
  [PRIYA]: 1000,
  [LEO]: 0,
} satisfies Record<PlayerId, number>;

/** Priya got away with it: no guess line, straight to points and standings. */
const hostResultEscaped: ImposterHostView = {
  ...hostRevealWrong,
  phase: "result",
  crewWord: CREW_WORD,
  guess: null,
  guessCorrect: null,
  pointsThisWord: POINTS_THIS_WORD_ESCAPED,
};

const PLAYER_BASE = {
  wordNumber: 3,
  wordCount: 6,
  clueOrder: CLUE_ORDER,
  voteCandidates: [MAYA, PRIYA, SAM, NOA, LEO],
  votedCount: VOTED_IDS.length,
  totals: TOTALS,
  turnStartedAt: SERVER_NOW,
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

/** Leo voted for Dov; the crew still caught Priya. */
const phoneLeoReveal: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "reveal",
  word: null,
  myVote: DOV,
  imposterId: PRIYA,
  caught: true,
};

/** Priya's last chance to guess the crew word. */
const phoneLastChance: ImposterPlayerView = {
  /** Priya's last chance to guess the crew word. */
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

/** Priya stole the word back with a correct last-chance guess. */
const phoneResultStole: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  role: "imposter",
  word: null,
  myVote: LEO,
  imposterId: PRIYA,
  caught: true,
  crewWord: CREW_WORD,
  guess: "GIRAFFE",
  guessCorrect: true,
  myPoints: 1000,
};

/** Priya was caught and missed the guess. */
const phoneResultNope: ImposterPlayerView = {
  ...phoneResultStole,
  guess: "HORSE",
  guessCorrect: false,
  myPoints: 0,
};

/** Dov voted for Priya and gets the spotter bonus. */
const phoneResultSpotted: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  word: null,
  myVote: PRIYA,
  imposterId: PRIYA,
  caught: true,
  crewWord: CREW_WORD,
  guess: "HORSE",
  guessCorrect: false,
  myPoints: 500,
};

/** Leo did not vote for Priya, so he gets nothing for the catch. */
const phoneResultMissed: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  word: null,
  myVote: DOV,
  imposterId: PRIYA,
  caught: true,
  crewWord: CREW_WORD,
  guess: "HORSE",
  guessCorrect: false,
  myPoints: 0,
};

/** Priya got away with it. */
const phoneResultEscapedImposter: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  role: "imposter",
  word: null,
  myVote: LEO,
  imposterId: PRIYA,
  caught: false,
  crewWord: CREW_WORD,
  guess: null,
  guessCorrect: null,
  myPoints: 1000,
};

/** Dov watches the imposter get away. */
const phoneResultEscapedCrew: ImposterPlayerView = {
  ...phoneCrewCard,
  phase: "result",
  word: null,
  myVote: PRIYA,
  imposterId: PRIYA,
  caught: false,
  crewWord: CREW_WORD,
  guess: null,
  guessCorrect: null,
  myPoints: 0,
};

interface RoomExtras {
  timerStartedAt?: number | null;
  /** The host view a no-TV phone stages alongside `view`; null for a shared-screen preview. */
  stage?: ImposterHostView | null;
  /** The room's cast, when it is not the usual six. */
  players?: PlayerSummary[];
}

function commonRoom(
  view: ImposterHostView | ImposterPlayerView,
  deadline: number | null,
  extras: RoomExtras = {},
) {
  const { timerStartedAt = null, stage = null, players = PLAYERS } = extras;
  return {
    code: "BKTZ",
    sharedScreen: stage === null,
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players,
    vipId: players[0]?.id ?? MAYA,
    locked: false,
    games: [],
    selectedGameId: "imposter",
    packs: [],
    lastResult: null,
    game: { id: "imposter", view, stage, deadline, timerStartedAt },
    serverNow: SERVER_NOW,
    contentLanguage: "en" as const,
  };
}

function hostRoom(
  view: ImposterHostView,
  deadline: number | null,
  timerStartedAt: number | null = null,
  players: PlayerSummary[] = PLAYERS,
): HostRoomView {
  return {
    role: "host",
    ...commonRoom(view, deadline, { timerStartedAt, players }),
  };
}

type PlayerRoomTiming = RoomExtras;

function playerRoom(
  view: ImposterPlayerView,
  you: PlayerId,
  deadline: number | null,
  timing: PlayerRoomTiming = {},
): PlayerRoomView {
  return {
    role: "player",
    you,
    ...commonRoom(view, deadline, timing),
  };
}


// ---------- Worst case ----------
//
// The layout suite measures these, so they carry the most punishing content the game can
// actually serve: the longest word any imposter pack ships, and a full room of players whose
// names all sit at the protocol's limit. scripts/content-stress.test.ts fails when a pack
// ships something longer, so new content re-arms these fixtures instead of slipping past.

/**
 * The longest word in any imposter pack. Pairs swap sides, so either half can be the decoy.
 * `scripts/content-stress.test.ts` holds this against the packs themselves.
 */
export const STRESS_TEXT = "flight attendant";

/** Eight players, the room ceiling, each named at NAME_MAX_LENGTH. */
const STRESS_NAMES = [
  "Wilhelmina A",
  "Wilhelmina B",
  "Wilhelmina C",
  "Wilhelmina D",
  "Wilhelmina E",
  "Wilhelmina F",
  "Wilhelmina G",
  "Wilhelmina H",
];

const STRESS_AVATARS: AvatarId[] = [
  "star",
  "toast",
  "drop",
  "cloud",
  "cat",
  "mushroom",
  "ghost",
  "robot",
];

const STRESS_PLAYERS: PlayerSummary[] = STRESS_NAMES.map((name, index) =>
  player(`stress-${index}`, name, STRESS_AVATARS[index] ?? "star", {
    crowns: index % 3,
    isVip: index === 0,
  }),
);

const STRESS_IDS: PlayerId[] = STRESS_PLAYERS.map((each) => each.id);
const STRESS_TOTALS: Record<PlayerId, number> = Object.fromEntries(
  STRESS_PLAYERS.map((each, index) => [each.id, 1500 - index * 100]),
);
const STRESS_SPEAKER = "stress-1";
const STRESS_NEXT = "stress-2";

const stressHostClues: ImposterHostView = {
  ...hostClues,
  playerIds: STRESS_IDS,
  clueOrder: STRESS_IDS,
  totals: STRESS_TOTALS,
  currentSpeakerId: STRESS_SPEAKER,
  doneSpeakerIds: ["stress-0"],
};

const stressHostVote: ImposterHostView = {
  ...stressHostClues,
  phase: "vote",
  currentSpeakerId: null,
  doneSpeakerIds: STRESS_IDS,
  votedIds: ["stress-0", "stress-2", "stress-3"],
};

/** The screen from #24: the imposter reading a long decoy word on their own turn. */
const stressPhoneImposterTurn: ImposterPlayerView = {
  ...phoneYourTurn,
  role: "imposter",
  word: STRESS_TEXT,
  clueOrder: STRESS_IDS,
  voteCandidates: STRESS_IDS,
  totals: STRESS_TOTALS,
  currentSpeakerId: STRESS_SPEAKER,
  nextSpeakerId: STRESS_NEXT,
};

const stressPhoneCrewCard: ImposterPlayerView = {
  ...stressPhoneImposterTurn,
  phase: "word-check",
  role: "crew",
  isMyTurn: false,
  currentSpeakerId: null,
  nextSpeakerId: null,
};

const stressPhoneVote: ImposterPlayerView = {
  ...stressPhoneImposterTurn,
  phase: "vote",
  isMyTurn: false,
  currentSpeakerId: null,
  nextSpeakerId: null,
  votedCount: 3,
};

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
    room: hostRoom(hostReveal, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal wrong",
    surface: "host",
    view: hostRevealWrong,
    room: hostRoom(hostRevealWrong, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal tie",
    surface: "host",
    view: hostRevealTie,
    room: hostRoom(hostRevealTie, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal no votes",
    surface: "host",
    view: hostRevealNoVotes,
    room: hostRoom(hostRevealNoVotes, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  },
  {
    label: "Host: last chance",
    surface: "host",
    view: hostLastChance,
    room: hostRoom(hostLastChance, LAST_CHANCE_DEADLINE),
  },
  {
    label: "Host: last chance typing",
    surface: "host",
    view: hostLastChance,
    room: hostRoom(
      hostLastChance,
      LAST_CHANCE_MID_DEADLINE,
      LAST_CHANCE_MID_START,
    ),
  },
  {
    label: "Host: result",
    surface: "host",
    view: hostResult,
    room: hostRoom(hostResult, RESULT_DEADLINE, RESULT_PREVIEW_START),
  },
  {
    label: "Host: result caught nope",
    surface: "host",
    view: hostResultCaughtNope,
    room: hostRoom(
      hostResultCaughtNope,
      RESULT_PREVIEW_DEADLINE,
      RESULT_PREVIEW_START,
    ),
  },
  {
    label: "Host: result caught got it",
    surface: "host",
    view: hostResultCaughtGotIt,
    room: hostRoom(
      hostResultCaughtGotIt,
      RESULT_PREVIEW_DEADLINE,
      RESULT_PREVIEW_START,
    ),
  },
  {
    label: "Host: result escaped",
    surface: "host",
    view: hostResultEscaped,
    room: hostRoom(
      hostResultEscaped,
      RESULT_PREVIEW_DEADLINE,
      RESULT_PREVIEW_START,
    ),
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
    room: playerRoom(phoneReveal, DOV, REVEAL_DEADLINE, { timerStartedAt: REVEAL_PREVIEW_START }),
  },
  {
    label: "Phone: Leo reveal",
    surface: "phone",
    view: phoneLeoReveal,
    room: playerRoom(phoneLeoReveal, LEO, REVEAL_DEADLINE, {
      timerStartedAt: REVEAL_PREVIEW_START,
    }),
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
    room: playerRoom(phoneImposterReveal, PRIYA, REVEAL_DEADLINE, {
      timerStartedAt: REVEAL_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Priya reveal free",
    surface: "phone",
    view: phoneImposterRevealFree,
    room: playerRoom(phoneImposterRevealFree, PRIYA, REVEAL_DEADLINE, {
      timerStartedAt: REVEAL_PREVIEW_START,
    }),
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
  {
    label: "Phone: Priya result stole",
    surface: "phone",
    view: phoneResultStole,
    room: playerRoom(phoneResultStole, PRIYA, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Priya result nope",
    surface: "phone",
    view: phoneResultNope,
    room: playerRoom(phoneResultNope, PRIYA, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Dov result spotted",
    surface: "phone",
    view: phoneResultSpotted,
    room: playerRoom(phoneResultSpotted, DOV, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Leo result missed",
    surface: "phone",
    view: phoneResultMissed,
    room: playerRoom(phoneResultMissed, LEO, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Priya result escaped",
    surface: "phone",
    view: phoneResultEscapedImposter,
    room: playerRoom(phoneResultEscapedImposter, PRIYA, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone: Dov result escaped",
    surface: "phone",
    view: phoneResultEscapedCrew,
    room: playerRoom(phoneResultEscapedCrew, DOV, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
    }),
  },
  {
    label: "Phone (no-TV): Maya crew card",
    surface: "phone",
    view: phoneCrewCard,
    room: playerRoom(phoneCrewCard, MAYA, WORD_CHECK_DEADLINE, {
      stage: hostWordCheck,
    }),
  },
  {
    label: "Phone (no-TV): Dov your turn",
    surface: "phone",
    view: phoneYourTurn,
    room: playerRoom(phoneYourTurn, DOV, CLUES_DEADLINE, { stage: hostClues }),
  },
  {
    label: "Phone (no-TV): Priya watching Dov's clue",
    surface: "phone",
    view: phoneWatchingClue,
    room: playerRoom(phoneWatchingClue, PRIYA, CLUES_DEADLINE, {
      stage: hostClues,
    }),
  },
  {
    label: "Phone (no-TV): Dov vote selecting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, DOV, VOTE_DEADLINE, { stage: hostVote }),
  },
  {
    label: "Phone (no-TV): Dov vote locked in",
    surface: "phone",
    view: phoneVoteLocked,
    room: playerRoom(phoneVoteLocked, DOV, VOTE_DEADLINE, { stage: hostVote }),
  },
  {
    label: "Phone (no-TV): Dov reveal settled",
    surface: "phone",
    view: phoneReveal,
    room: playerRoom(phoneReveal, DOV, REVEAL_DEADLINE, {
      timerStartedAt: REVEAL_PREVIEW_START,
      stage: hostReveal,
    }),
  },
  {
    label: "Phone (no-TV): Priya last chance",
    surface: "phone",
    view: phoneLastChance,
    room: playerRoom(phoneLastChance, PRIYA, LAST_CHANCE_DEADLINE, {
      stage: hostLastChance,
    }),
  },
  {
    label: "Phone (no-TV): Dov waiting for guess",
    surface: "phone",
    view: phoneWaitingForGuess,
    room: playerRoom(phoneWaitingForGuess, DOV, LAST_CHANCE_DEADLINE, {
      stage: hostLastChance,
    }),
  },
  {
    label: "Phone (no-TV): Dov result settled",
    surface: "phone",
    view: phoneResult,
    room: playerRoom(phoneResult, DOV, RESULT_PREVIEW_DEADLINE, {
      timerStartedAt: RESULT_PREVIEW_START,
      stage: hostResultCaughtNope,
    }),
  },
  {
    label: "Phone: worst case, imposter turn (long word, 8 long names)",
    surface: "phone",
    view: stressPhoneImposterTurn,
    room: playerRoom(stressPhoneImposterTurn, STRESS_SPEAKER, CLUES_DEADLINE, {
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, crew card (long word, 8 long names)",
    surface: "phone",
    view: stressPhoneCrewCard,
    room: playerRoom(stressPhoneCrewCard, STRESS_SPEAKER, WORD_CHECK_DEADLINE, {
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, vote (8 long names)",
    surface: "phone",
    view: stressPhoneVote,
    room: playerRoom(stressPhoneVote, STRESS_SPEAKER, VOTE_DEADLINE, {
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Host: worst case, clue turns (8 long names)",
    surface: "host",
    view: stressHostClues,
    room: hostRoom(stressHostClues, CLUES_DEADLINE, null, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, voting (8 long names)",
    surface: "host",
    view: stressHostVote,
    room: hostRoom(stressHostVote, VOTE_DEADLINE, null, STRESS_PLAYERS),
  },
];
