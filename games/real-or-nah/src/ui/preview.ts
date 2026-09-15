// Sample states for the Real or Nah screens (design/sample-data driven).
import type {
  AvatarId,
  HostRoomView,
  PlayerId,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type { Fact } from "@opg/sdk";
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

/** Dov found the truth and his own lie fooled nobody. */
const REVEAL_DOV_FOUND: RonReveal = {
  ...REVEAL,
  foundByIds: [MAYA, DOV, LEO],
  lies: LIES.map((lie) =>
    lie.authorId === DOV ? { ...lie, fooledIds: [], points: 0 } : lie,
  ),
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

function commonRoom(
  view: RonHostView | RonPlayerView,
  deadline: number | null,
) {
  return {
    code: "BKTZ",
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players: PLAYERS,
    vipId: MAYA,
    locked: false,
    games: [
      {
        id: "real-or-nah",
        name: "Real or Nah",
        blurb: "Write fake answers to real facts. Fool your friends.",
        minPlayers: 3,
        maxPlayers: 8,
        minutes: 15,
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
    game: { id: "real-or-nah", view, deadline },
    serverNow: SERVER_NOW,
  };
}

function hostRoom(view: RonHostView, deadline: number | null): HostRoomView {
  return { role: "host", ...commonRoom(view, deadline) };
}

function playerRoom(
  view: RonPlayerView,
  deadline: number | null,
): PlayerRoomView {
  return { role: "player", you: DOV, ...commonRoom(view, deadline) };
}

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
    label: "Host: reveal",
    surface: "host",
    view: hostReveal,
    room: hostRoom(hostReveal, null),
  },
  {
    label: "Host: reveal with a house lie",
    surface: "host",
    view: hostRevealHouse,
    room: hostRoom(hostRevealHouse, null),
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
    room: playerRoom(phoneReveal, null),
  },
  {
    label: "Phone: Dov found the truth",
    surface: "phone",
    view: phoneRevealFound,
    room: playerRoom(phoneRevealFound, null),
  },
  {
    label: "Phone: Dov missed a round",
    surface: "phone",
    view: phoneRevealNoLie,
    room: playerRoom(phoneRevealNoLie, null),
  },
];
