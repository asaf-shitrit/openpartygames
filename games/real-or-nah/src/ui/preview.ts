// Sample states for the Real or Nah screens (design/sample-data driven).
import type {
  AvatarId,
  HostRoomView,
  PlayerId,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type { Fact } from "@opg/sdk";
import { RON_REVEAL } from "../reveal-plan";
import type {
  RonFooledLie,
  RonHostOption,
  RonHostView,
  RonPlayerOption,
  RonPlayerView,
  RonReveal,
} from "../types";

const SERVER_NOW = 1735689600000;
const WRITE_DEADLINE = SERVER_NOW + 38000;
const VOTE_DEADLINE = SERVER_NOW + 19000;

/**
 * Anchor for every settled reveal fixture: far enough in the past that any reveal
 * (up to the 30s cap) lands fully played out, with no live beats and no cues.
 */
export const RON_REVEAL_PREVIEW_START = SERVER_NOW - RON_REVEAL.capMs - 500;

const MAYA = "maya";
const DOV = "dov";
const PRIYA = "priya";
const SAM = "sam";
const NOA = "noa";
const LEO = "leo";

export const RON_PREVIEW_FACT: Fact = {
  id: "emu-war",
  prompt: "In 1932, the Australian army went to war against ____ and lost.",
  answer: "emus",
  alternates: ["emu"],
  decoys: ["kangaroos", "rabbits", "cane toads"],
  source: { title: "Emu War", url: "https://en.wikipedia.org/wiki/Emu_War" },
};

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
const VOTED = [MAYA, LEO, NOA, PRIYA];
const TOTALS = {
  [MAYA]: 1500,
  [DOV]: 1000,
  [PRIYA]: 0,
  [SAM]: 0,
  [NOA]: 500,
  [LEO]: 1000,
} satisfies Record<PlayerId, number>;

const HOST_OPTIONS: RonHostOption[] = [
  { id: "o1", text: "rabbits" },
  { id: "o2", text: "kangaroos" },
  { id: "o3", text: "emus" },
  { id: "o4", text: "cane toads" },
  { id: "o5", text: "koalas" },
  { id: "o6", text: "dingoes" },
  { id: "o7", text: "a swarm of locusts" },
];

const PLAYER_OPTIONS: RonPlayerOption[] = HOST_OPTIONS.map((option) => ({
  ...option,
  mine: option.id === "o4",
}));

const LIES: RonFooledLie[] = [
  {
    optionId: "o4",
    text: "cane toads",
    authorId: DOV,
    fooledIds: [SAM, NOA],
    points: 1000,
  },
  {
    optionId: "o1",
    text: "rabbits",
    authorId: NOA,
    fooledIds: [PRIYA],
    points: 500,
  },
  {
    optionId: "o6",
    text: "dingoes",
    authorId: MAYA,
    fooledIds: [DOV],
    points: 500,
  },
  {
    optionId: "o5",
    text: "koalas",
    authorId: SAM,
    fooledIds: [],
    points: 0,
  },
  {
    optionId: "o7",
    text: "a swarm of locusts",
    authorId: PRIYA,
    fooledIds: [],
    points: 0,
  },
  {
    optionId: "o2",
    text: "kangaroos",
    authorId: LEO,
    fooledIds: [],
    points: 0,
  },
];

const REVEAL: RonReveal = {
  truthOptionId: "o3",
  answer: "emus",
  source: RON_PREVIEW_FACT.source,
  foundByIds: [MAYA, LEO],
  lies: LIES,
};

/** The same lie, but stripped of anyone it fooled (a dud). */
function asDud(lie: RonFooledLie): RonFooledLie {
  return {
    optionId: lie.optionId,
    text: lie.text,
    authorId: lie.authorId,
    fooledIds: [],
    points: 0,
  };
}

/** Dov found the truth and his own lie fooled nobody. */
const REVEAL_DOV_FOUND: RonReveal = {
  ...REVEAL,
  foundByIds: [MAYA, DOV, LEO],
  lies: LIES.map((lie) => (lie.authorId === DOV ? asDud(lie) : lie)),
};

/** Dov never sent a lie before the write deadline. */
const REVEAL_DOV_MISSED: RonReveal = {
  ...REVEAL,
  lies: LIES.filter((lie) => lie.authorId !== DOV),
};

/** A house decoy line nobody wrote, e.g. after a player dropped mid-fact. */
const HOUSE_LIE: RonFooledLie = {
  optionId: "o8",
  text: "a surprisingly large lizard",
  authorId: null,
  fooledIds: [PRIYA],
  points: 0,
};

const REVEAL_WITH_HOUSE_LIE: RonReveal = {
  ...REVEAL,
  lies: [...LIES, HOUSE_LIE],
};

/** Nobody's lie fooled anybody: duds only, no lie beats to play. */
const REVEAL_ALL_DUDS: RonReveal = {
  ...REVEAL,
  lies: LIES.map(asDud),
};

/** Exactly two foolers (Dov and Noa) plus a dud (Maya's dingoes). */
const REVEAL_TWO_FOOLERS: RonReveal = {
  ...REVEAL,
  lies: LIES.map((lie) => (lie.optionId === "o6" ? asDud(lie) : lie)),
};

/**
 * Noa was kicked mid-reveal: their fooling lie ("rabbits") is gone from `lies`
 * (`onPlayerRemoved` anonymizes, then filters, a removed player's own option), but
 * `planLies` stays frozen from the moment the reveal started, so the beat still plays.
 */
const REVEAL_AFTER_KICK: RonReveal = {
  ...REVEAL,
  planLies: LIES.map((lie) => ({
    optionId: lie.optionId,
    fooledCount: lie.fooledIds.length,
  })),
  lies: LIES.filter((lie) => lie.optionId !== "o1"),
};

/** Dov's own lie fooled nobody, but his vote landed on Maya's fooling lie. */
const REVEAL_DOV_WAS_FOOLED: RonReveal = {
  ...REVEAL,
  lies: LIES.map((lie) => (lie.authorId === DOV ? asDud(lie) : lie)),
};

/** Dov's lie fooled two people; Dov himself neither found the truth nor was fooled. */
const REVEAL_DOV_AUTHORED_FOOLING: RonReveal = {
  ...REVEAL,
  foundByIds: [MAYA, LEO],
};

const HOST_BASE = {
  factNumber: 2,
  factCount: 6,
  prompt: RON_PREVIEW_FACT.prompt,
  playerIds: ALL_IDS,
};

const hostWrite: RonHostView = {
  ...HOST_BASE,
  phase: "write",
  submittedIds: [MAYA, DOV, NOA, LEO],
  votedIds: [],
  totals: TOTALS,
  options: null,
  reveal: null,
  pointsThisFact: null,
};

const hostVote: RonHostView = {
  ...HOST_BASE,
  phase: "vote",
  submittedIds: ALL_IDS,
  votedIds: VOTED,
  totals: TOTALS,
  options: HOST_OPTIONS,
  reveal: null,
  pointsThisFact: null,
};

const hostReveal: RonHostView = {
  ...HOST_BASE,
  phase: "reveal",
  submittedIds: ALL_IDS,
  votedIds: ALL_IDS,
  totals: TOTALS,
  options: HOST_OPTIONS,
  reveal: REVEAL,
  pointsThisFact: TOTALS,
};

const hostRevealHouse: RonHostView = {
  ...hostReveal,
  reveal: REVEAL_WITH_HOUSE_LIE,
};

/** 0 foolers: every lie fooled nobody. */
const hostRevealAllDuds: RonHostView = {
  ...hostReveal,
  reveal: REVEAL_ALL_DUDS,
};

/** 2 foolers plus a dud. */
const hostRevealTwoFoolers: RonHostView = {
  ...hostReveal,
  reveal: REVEAL_TWO_FOOLERS,
};

/** A lie's beat still plays after its author was kicked mid-reveal. */
const hostRevealAfterKick: RonHostView = {
  ...hostReveal,
  reveal: REVEAL_AFTER_KICK,
};

const PLAYER_BASE = {
  factNumber: 2,
  factCount: 6,
  prompt: RON_PREVIEW_FACT.prompt,
  playerCount: ALL_IDS.length,
  totals: TOTALS,
};

const phoneWrite: RonPlayerView = {
  ...PLAYER_BASE,
  phase: "write",
  myLie: null,
  lieError: null,
  submittedCount: 4,
  myPick: null,
  options: null,
  reveal: null,
  myPoints: null,
};

const phoneWriteError: RonPlayerView = {
  ...phoneWrite,
  lieError: "truth",
};

const phoneWriteDuplicate: RonPlayerView = {
  ...phoneWrite,
  lieError: "duplicate",
};

const phoneWriteInvalid: RonPlayerView = {
  ...phoneWrite,
  lieError: "invalid",
};

const phoneWriteLocked: RonPlayerView = {
  ...phoneWrite,
  myLie: "cane toads",
};

const phoneVote: RonPlayerView = {
  ...PLAYER_BASE,
  phase: "vote",
  myLie: "cane toads",
  lieError: null,
  submittedCount: ALL_IDS.length,
  myPick: null,
  options: PLAYER_OPTIONS,
  reveal: null,
  myPoints: null,
};

const phoneVoteLocked: RonPlayerView = {
  ...phoneVote,
  myPick: "o6",
};

const phoneReveal: RonPlayerView = {
  ...phoneVote,
  phase: "reveal",
  myPick: "o6",
  reveal: REVEAL,
  myPoints: 1000,
};

const phoneRevealFound: RonPlayerView = {
  ...phoneReveal,
  reveal: REVEAL_DOV_FOUND,
};

const phoneRevealNoLie: RonPlayerView = {
  ...phoneReveal,
  myLie: null,
  reveal: REVEAL_DOV_MISSED,
  myPoints: 0,
};

/** Dov's own lie fooled nobody, but Maya's lie fooled him. */
const phoneRevealWasFooled: RonPlayerView = {
  ...phoneVote,
  phase: "reveal",
  myPick: "o6",
  reveal: REVEAL_DOV_WAS_FOOLED,
  myPoints: 0,
};

/** Dov's own lie fooled two people; he picked a dud and wasn't fooled or right. */
const phoneRevealAuthoredFooling: RonPlayerView = {
  ...phoneVote,
  phase: "reveal",
  myPick: "o1",
  reveal: REVEAL_DOV_AUTHORED_FOOLING,
  myPoints: 1000,
};

function commonRoom(
  view: RonHostView | RonPlayerView,
  deadline: number | null,
  timerStartedAt: number | null = null,
  players: PlayerSummary[] = PLAYERS,
) {
  return {
    code: "BKTZ",
    sharedScreen: true,
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players,
    vipId: players[0]?.id ?? MAYA,
    locked: false,
    games: [
      {
        id: "real-or-nah",
        name: "Real or Nah",
        blurb: "Write fake answers to real facts. Fool your friends.",
        minPlayers: 3,
        maxPlayers: 8,
        minutes: 15,
        noTv: false,
        hasContentInLanguage: true,
      },
    ],
    selectedGameId: "real-or-nah",
    packs: [
      {
        id: "starter-facts",
        name: "Starter facts",
        rating: "family" as const,
        enabled: true,
        itemCount: 6,
      },
    ],
    lastResult: null,
    game: { id: "real-or-nah", view, stage: null, deadline, timerStartedAt },
    serverNow: SERVER_NOW,
    contentLanguage: "en" as const,
  };
}

function hostRoom(
  view: RonHostView,
  deadline: number | null,
  timerStartedAt: number | null = null,
  players: PlayerSummary[] = PLAYERS,
): HostRoomView {
  return {
    role: "host",
    ...commonRoom(view, deadline, timerStartedAt, players),
  };
}

interface PlayerRoomCast {
  you?: PlayerId;
  players?: PlayerSummary[];
}

function playerRoom(
  view: RonPlayerView,
  deadline: number | null,
  timerStartedAt: number | null = null,
  cast: PlayerRoomCast = {},
): PlayerRoomView {
  const { you = DOV, players = PLAYERS } = cast;
  return {
    role: "player",
    you,
    ...commonRoom(view, deadline, timerStartedAt, players),
  };
}

// ---------- Worst case ----------
//
// The layout suite measures these, so they carry the most punishing content the game can
// actually serve: the longest prompt any real-or-nah pack ships, a truth answer and house
// decoy at their longest, a player-written lie at LIE_MAX_LENGTH, and a full room of players
// whose names all sit at the protocol's limit. scripts/content-stress.test.ts fails when a
// pack ships something longer, so new content re-arms these fixtures instead of slipping past.

/** The longest prompt in any real-or-nah pack (starter-facts.json's shortest-war fact). */
export const STRESS_TEXT =
  "The shortest war on record, fought between Britain and Zanzibar in 1896, lasted about ____.";

/** The longest truth answer in any real-or-nah pack. */
const STRESS_ANSWER = "laser pointer";

/** The longest decoy in any real-or-nah pack, used as an authorless house lie. */
const STRESS_DECOY = "Great Wall of China";

/** A player-written lie at LIE_MAX_LENGTH, the longest a player can submit. */
const STRESS_LIE = "a completely made up story about ferrets";

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

const STRESS_IDS = STRESS_PLAYERS.map((each) => each.id);
const STRESS_ME = "stress-1";

const STRESS_TOTALS: Record<PlayerId, number> = Object.fromEntries(
  STRESS_PLAYERS.map((each, index) => [each.id, 1500 - index * 100]),
);

const STRESS_HOST_BASE = {
  factNumber: 2,
  factCount: 6,
  prompt: STRESS_TEXT,
  playerIds: STRESS_IDS,
};

const STRESS_PLAYER_BASE = {
  factNumber: 2,
  factCount: 6,
  prompt: STRESS_TEXT,
  playerCount: STRESS_IDS.length,
  totals: STRESS_TOTALS,
};

const stressHostWrite: RonHostView = {
  ...STRESS_HOST_BASE,
  phase: "write",
  submittedIds: STRESS_IDS.slice(0, 5),
  votedIds: [],
  totals: STRESS_TOTALS,
  options: null,
  reveal: null,
  pointsThisFact: null,
};

const STRESS_HOST_OPTIONS: RonHostOption[] = [
  { id: "o1", text: STRESS_DECOY },
  { id: "o2", text: STRESS_ANSWER },
  { id: "o3", text: STRESS_LIE },
  { id: "o4", text: "cane toads" },
];

const stressHostVote: RonHostView = {
  ...STRESS_HOST_BASE,
  phase: "vote",
  submittedIds: STRESS_IDS,
  votedIds: STRESS_IDS.slice(0, 6),
  totals: STRESS_TOTALS,
  options: STRESS_HOST_OPTIONS,
  reveal: null,
  pointsThisFact: null,
};

const STRESS_LIES: RonFooledLie[] = [
  {
    optionId: "o3",
    text: STRESS_LIE,
    authorId: STRESS_IDS[1] ?? null,
    fooledIds: [STRESS_IDS[2] ?? "stress-2", STRESS_IDS[3] ?? "stress-3"],
    points: 1000,
  },
  {
    optionId: "o1",
    text: STRESS_DECOY,
    authorId: null,
    fooledIds: [STRESS_IDS[4] ?? "stress-4"],
    points: 0,
  },
  {
    optionId: "o4",
    text: "cane toads",
    authorId: STRESS_IDS[5] ?? null,
    fooledIds: [],
    points: 0,
  },
];

const STRESS_REVEAL: RonReveal = {
  truthOptionId: "o2",
  answer: STRESS_ANSWER,
  source: { title: "Shortest war", url: "https://en.wikipedia.org/wiki/Anglo-Zanzibar_War" },
  foundByIds: STRESS_IDS.slice(6),
  lies: STRESS_LIES,
};

const stressHostReveal: RonHostView = {
  ...STRESS_HOST_BASE,
  phase: "reveal",
  submittedIds: STRESS_IDS,
  votedIds: STRESS_IDS,
  totals: STRESS_TOTALS,
  options: STRESS_HOST_OPTIONS,
  reveal: STRESS_REVEAL,
  pointsThisFact: STRESS_TOTALS,
};

const stressPhoneWrite: RonPlayerView = {
  ...STRESS_PLAYER_BASE,
  phase: "write",
  myLie: null,
  lieError: null,
  submittedCount: 5,
  myPick: null,
  options: null,
  reveal: null,
  myPoints: null,
};

const stressPhoneWriteLocked: RonPlayerView = {
  ...stressPhoneWrite,
  myLie: STRESS_LIE,
};

const STRESS_PLAYER_OPTIONS: RonPlayerOption[] = STRESS_HOST_OPTIONS.map((option) => ({
  id: option.id,
  text: option.text,
  mine: option.id === "o3",
}));

const stressPhoneVote: RonPlayerView = {
  ...STRESS_PLAYER_BASE,
  phase: "vote",
  myLie: STRESS_LIE,
  lieError: null,
  submittedCount: STRESS_IDS.length,
  myPick: null,
  options: STRESS_PLAYER_OPTIONS,
  reveal: null,
  myPoints: null,
};

const stressPhoneReveal: RonPlayerView = {
  ...stressPhoneVote,
  phase: "reveal",
  myPick: "o1",
  reveal: STRESS_REVEAL,
  myPoints: 500,
};

export const realOrNahPreviews: Array<{
  label: string;
  surface: "host" | "phone";
  view: RonHostView | RonPlayerView;
  room: HostRoomView | PlayerRoomView;
}> = [
  {
    label: "Host: write",
    surface: "host",
    view: hostWrite,
    room: hostRoom(hostWrite, WRITE_DEADLINE),
  },
  {
    label: "Host: vote",
    surface: "host",
    view: hostVote,
    room: hostRoom(hostVote, VOTE_DEADLINE),
  },
  {
    label: "Host: reveal, 3 foolers",
    surface: "host",
    view: hostReveal,
    room: hostRoom(hostReveal, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal with a house lie",
    surface: "host",
    view: hostRevealHouse,
    room: hostRoom(hostRevealHouse, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal, 0 foolers (duds only)",
    surface: "host",
    view: hostRevealAllDuds,
    room: hostRoom(hostRevealAllDuds, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal, 2 foolers plus a dud",
    surface: "host",
    view: hostRevealTwoFoolers,
    room: hostRoom(hostRevealTwoFoolers, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Host: reveal after a kick",
    surface: "host",
    view: hostRevealAfterKick,
    room: hostRoom(hostRevealAfterKick, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: Dov writing",
    surface: "phone",
    view: phoneWrite,
    room: playerRoom(phoneWrite, WRITE_DEADLINE),
  },
  {
    label: "Phone: lie was the truth",
    surface: "phone",
    view: phoneWriteError,
    room: playerRoom(phoneWriteError, WRITE_DEADLINE),
  },
  {
    label: "Phone: lie already taken",
    surface: "phone",
    view: phoneWriteDuplicate,
    room: playerRoom(phoneWriteDuplicate, WRITE_DEADLINE),
  },
  {
    label: "Phone: lie the wrong length",
    surface: "phone",
    view: phoneWriteInvalid,
    room: playerRoom(phoneWriteInvalid, WRITE_DEADLINE),
  },
  {
    label: "Phone: lie locked in",
    surface: "phone",
    view: phoneWriteLocked,
    room: playerRoom(phoneWriteLocked, WRITE_DEADLINE),
  },
  {
    label: "Phone: Dov voting",
    surface: "phone",
    view: phoneVote,
    room: playerRoom(phoneVote, VOTE_DEADLINE),
  },
  {
    label: "Phone: vote locked in",
    surface: "phone",
    view: phoneVoteLocked,
    room: playerRoom(phoneVoteLocked, VOTE_DEADLINE),
  },
  {
    label: "Phone: reveal",
    surface: "phone",
    view: phoneReveal,
    room: playerRoom(phoneReveal, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: Dov found the truth",
    surface: "phone",
    view: phoneRevealFound,
    room: playerRoom(phoneRevealFound, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: Dov missed a round",
    surface: "phone",
    view: phoneRevealNoLie,
    room: playerRoom(phoneRevealNoLie, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: Dov was fooled",
    surface: "phone",
    view: phoneRevealWasFooled,
    room: playerRoom(phoneRevealWasFooled, null, RON_REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: Dov's lie fooled people",
    surface: "phone",
    view: phoneRevealAuthoredFooling,
    room: playerRoom(
      phoneRevealAuthoredFooling,
      null,
      RON_REVEAL_PREVIEW_START,
    ),
  },
  {
    label: "Phone: worst case, writing a lie (91-char prompt, 8 long names)",
    surface: "phone",
    view: stressPhoneWrite,
    room: playerRoom(stressPhoneWrite, WRITE_DEADLINE, null, {
      you: STRESS_ME,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, lie locked in (40-char lie)",
    surface: "phone",
    view: stressPhoneWriteLocked,
    room: playerRoom(stressPhoneWriteLocked, WRITE_DEADLINE, null, {
      you: STRESS_ME,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, voting (40-char lie, 19-char decoy, 8 long names)",
    surface: "phone",
    view: stressPhoneVote,
    room: playerRoom(stressPhoneVote, VOTE_DEADLINE, null, {
      you: STRESS_ME,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, reveal (91-char prompt, 13-char answer, 8 long names)",
    surface: "phone",
    view: stressPhoneReveal,
    room: playerRoom(stressPhoneReveal, null, RON_REVEAL_PREVIEW_START, {
      you: STRESS_ME,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Host: worst case, write (91-char prompt, 8 long names)",
    surface: "host",
    view: stressHostWrite,
    room: hostRoom(stressHostWrite, WRITE_DEADLINE, null, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, vote (40-char lie, 19-char decoy)",
    surface: "host",
    view: stressHostVote,
    room: hostRoom(stressHostVote, VOTE_DEADLINE, null, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, reveal (40-char lie, 13-char answer, 8 long names)",
    surface: "host",
    view: stressHostReveal,
    room: hostRoom(stressHostReveal, null, RON_REVEAL_PREVIEW_START, STRESS_PLAYERS),
  },
];
