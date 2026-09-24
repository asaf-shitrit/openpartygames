// Sample Most Likely To screens for previews and UI tests, driven off a fixed server clock.
import type {
  AvatarId,
  HostRoomView,
  PlayerId,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type {
  MltHostView,
  MltPlayerView,
  MltReveal,
} from "../state";

const SERVER_NOW = 1735689600000;

const MAYA = "maya";
const DOV = "dov";
const PRIYA = "priya";
const SAM = "sam";
const NOA = "noa";
const LEO = "leo";
/** A player who was kicked mid-reveal: in the frozen reveal, gone from the room. */
const ZED = "zed";

const VOTE_DEADLINE = SERVER_NOW + 18000;
const REVEAL_DEADLINE = SERVER_NOW + 1000;

/** A reveal already at its 11s mark, so previews and tests render the settled end state. */
export const REVEAL_PREVIEW_START = SERVER_NOW - 11000;

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
const PROMPT = "forget their own birthday party";

const TOTALS = {
  [MAYA]: 2000,
  [DOV]: 1500,
  [PRIYA]: 1500,
  [SAM]: 1000,
  [NOA]: 1000,
  [LEO]: 500,
} satisfies Record<PlayerId, number>;

/** Dov takes 4 votes; Leo voted for Maya and Dov voted for Leo. */
const PICKED_REVEAL: MltReveal = {
  playerIds: ALL_IDS,
  tally: {
    [DOV]: [MAYA, PRIYA, SAM, NOA],
    [LEO]: [DOV],
    [MAYA]: [LEO],
  },
  outcome: { kind: "picked", pickedId: DOV },
  matchedIds: [MAYA, PRIYA, SAM, NOA],
};

/** Dov and Priya tie 2-2. */
const TIE_REVEAL: MltReveal = {
  playerIds: ALL_IDS,
  tally: {
    [DOV]: [MAYA, SAM],
    [PRIYA]: [DOV, NOA],
    [LEO]: [PRIYA],
    [MAYA]: [LEO],
  },
  outcome: { kind: "tie", tiedIds: [DOV, PRIYA] },
  matchedIds: [MAYA, DOV, SAM, NOA],
};

/** Every vote went somewhere different. */
const SPLIT_REVEAL: MltReveal = {
  playerIds: ALL_IDS,
  tally: {
    [MAYA]: [LEO],
    [DOV]: [MAYA],
    [PRIYA]: [DOV],
    [SAM]: [PRIYA],
    [NOA]: [SAM],
    [LEO]: [NOA],
  },
  outcome: { kind: "split" },
  matchedIds: [],
};

const NO_VOTES_REVEAL: MltReveal = {
  playerIds: ALL_IDS,
  tally: {},
  outcome: { kind: "no-votes" },
  matchedIds: [],
};

/** Zed was the pick, then got kicked mid-reveal: the frozen reveal still shows the tile. */
const KICKED_REVEAL: MltReveal = {
  playerIds: [...ALL_IDS, ZED],
  tally: {
    [ZED]: [MAYA, DOV, PRIYA],
    [SAM]: [NOA, LEO],
    [NOA]: [SAM],
  },
  outcome: { kind: "picked", pickedId: ZED },
  matchedIds: [MAYA, DOV, PRIYA],
};

/** Points for the matched voters of a reveal. */
function pointsFor(reveal: MltReveal): Record<PlayerId, number> {
  return Object.fromEntries(
    ALL_IDS.map((id) => [id, reveal.matchedIds.includes(id) ? 500 : 0]),
  );
}

const HOST_BASE = {
  roundNumber: 7,
  roundCount: 20,
  prompt: PROMPT,
  playerIds: ALL_IDS,
  totals: TOTALS,
};

const hostVote: MltHostView = {
  ...HOST_BASE,
  phase: "vote",
  votedIds: [MAYA, DOV, SAM, LEO],
  reveal: null,
  pointsThisRound: null,
};

function hostReveal(reveal: MltReveal): MltHostView {
  return {
    ...HOST_BASE,
    phase: "reveal",
    votedIds: [],
    reveal,
    pointsThisRound: pointsFor(reveal),
  };
}

const PHONE_BASE = {
  roundNumber: 7,
  roundCount: 20,
  prompt: PROMPT,
  voteCandidates: ALL_IDS,
  playerCount: ALL_IDS.length,
  totals: TOTALS,
};

const phoneVoteSelecting: MltPlayerView = {
  ...PHONE_BASE,
  phase: "vote",
  myVote: null,
  votedCount: 3,
  reveal: null,
  myPoints: null,
};

const phoneVoteLocked: MltPlayerView = {
  ...phoneVoteSelecting,
  myVote: PRIYA,
  votedCount: 4,
};

function phoneReveal(
  reveal: MltReveal,
  myVote: PlayerId | null,
  myPoints: number,
): MltPlayerView {
  return {
    ...PHONE_BASE,
    phase: "reveal",
    myVote,
    votedCount: 0,
    reveal,
    myPoints,
  };
}

interface RoomTiming {
  deadline: number | null;
  timerStartedAt?: number | null;
  /** The host view a no-TV phone stages, or null for a shared-screen room. */
  stage?: MltHostView | null;
}

function commonRoom(view: MltHostView | MltPlayerView, timing: RoomTiming) {
  const { deadline, timerStartedAt = null, stage = null } = timing;
  return {
    code: "BKTZ",
    sharedScreen: stage === null,
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players: PLAYERS,
    vipId: MAYA,
    locked: false,
    games: [],
    selectedGameId: "most-likely-to",
    packs: [],
    lastResult: null,
    game: { id: "most-likely-to", view, deadline, timerStartedAt, stage },
    serverNow: SERVER_NOW,
    contentLanguage: "en" as const,
  };
}

function hostRoom(
  view: MltHostView,
  deadline: number | null,
  timerStartedAt: number | null = null,
): HostRoomView {
  return { role: "host", ...commonRoom(view, { deadline, timerStartedAt }) };
}

function playerRoom(
  view: MltPlayerView,
  you: PlayerId,
  timing: RoomTiming,
): PlayerRoomView {
  return { role: "player", you, ...commonRoom(view, timing) };
}

// ---------- Worst case ----------
//
// The layout suite measures these, so they carry the most punishing content the game can
// actually serve: the longest prompt any Most Likely To pack ships, and a full room of players
// whose names all sit at the protocol's limit. The ballot and the reveal are lists of names, so
// this matters most here. A guard test compares STRESS_TEXT against the packs so new content
// re-arms this fixture instead of slipping past.

/** The longest prompt in any Most Likely To pack (most-likely-friends.json). */
export const STRESS_TEXT = "vanish from the group chat then flood it with memes";

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
  STRESS_PLAYERS.map((each, index) => [each.id, 2000 - index * 200]),
);

const STRESS_HOST_BASE = {
  roundNumber: 7,
  roundCount: 20,
  prompt: STRESS_TEXT,
  playerIds: STRESS_IDS,
  totals: STRESS_TOTALS,
};

const stressHostVote: MltHostView = {
  ...STRESS_HOST_BASE,
  phase: "vote",
  votedIds: ["stress-0", "stress-2", "stress-3", "stress-6"],
  reveal: null,
  pointsThisRound: null,
};

/** Every player voted; the top pick took votes from most of the room. */
const STRESS_REVEAL: MltReveal = {
  playerIds: STRESS_IDS,
  tally: {
    "stress-1": ["stress-0", "stress-2", "stress-3", "stress-4", "stress-5"],
    "stress-6": ["stress-1", "stress-7"],
    "stress-0": ["stress-6"],
  },
  outcome: { kind: "picked", pickedId: "stress-1" },
  matchedIds: ["stress-0", "stress-2", "stress-3", "stress-4", "stress-5"],
};

function stressPointsFor(reveal: MltReveal): Record<PlayerId, number> {
  return Object.fromEntries(
    STRESS_IDS.map((id) => [id, reveal.matchedIds.includes(id) ? 500 : 0]),
  );
}

const stressHostReveal: MltHostView = {
  ...STRESS_HOST_BASE,
  phase: "reveal",
  votedIds: [],
  reveal: STRESS_REVEAL,
  pointsThisRound: stressPointsFor(STRESS_REVEAL),
};

const STRESS_PHONE_BASE = {
  roundNumber: 7,
  roundCount: 20,
  prompt: STRESS_TEXT,
  voteCandidates: STRESS_IDS,
  playerCount: STRESS_IDS.length,
  totals: STRESS_TOTALS,
};

const stressPhoneVoteSelecting: MltPlayerView = {
  ...STRESS_PHONE_BASE,
  phase: "vote",
  myVote: null,
  votedCount: 4,
  reveal: null,
  myPoints: null,
};

const stressPhoneReveal: MltPlayerView = {
  ...STRESS_PHONE_BASE,
  phase: "reveal",
  myVote: "stress-1",
  votedCount: 0,
  reveal: STRESS_REVEAL,
  myPoints: 500,
};

export interface MltPreview {
  label: string;
  surface: "host" | "phone";
  view: MltHostView | MltPlayerView;
  room: HostRoomView | PlayerRoomView;
  /** The host view a no-TV phone stages alongside `view`; undefined for a shared-screen preview. */
  stage?: MltHostView;
}

function hostRevealPreview(label: string, reveal: MltReveal): MltPreview {
  const view = hostReveal(reveal);
  return {
    label,
    surface: "host",
    view,
    room: hostRoom(view, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  };
}

function phoneRevealPreview(
  label: string,
  you: PlayerId,
  view: MltPlayerView,
): MltPreview {
  return {
    label,
    surface: "phone",
    view,
    room: playerRoom(view, you, {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
    }),
  };
}

export const mostLikelyToPreviews: MltPreview[] = [
  {
    label: "Host: vote",
    surface: "host",
    view: hostVote,
    room: hostRoom(hostVote, VOTE_DEADLINE),
  },
  hostRevealPreview("Host: reveal picked", PICKED_REVEAL),
  hostRevealPreview("Host: reveal tie", TIE_REVEAL),
  hostRevealPreview("Host: reveal split", SPLIT_REVEAL),
  hostRevealPreview("Host: reveal no votes", NO_VOTES_REVEAL),
  hostRevealPreview("Host: reveal after kick", KICKED_REVEAL),
  {
    label: "Phone: Dov vote selecting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, DOV, { deadline: VOTE_DEADLINE }),
  },
  {
    label: "Phone: Dov vote locked in",
    surface: "phone",
    view: phoneVoteLocked,
    room: playerRoom(phoneVoteLocked, DOV, { deadline: VOTE_DEADLINE }),
  },
  phoneRevealPreview(
    "Phone: Maya reveal matched",
    MAYA,
    phoneReveal(PICKED_REVEAL, DOV, 500),
  ),
  phoneRevealPreview(
    "Phone: Leo reveal missed",
    LEO,
    phoneReveal(PICKED_REVEAL, MAYA, 0),
  ),
  phoneRevealPreview(
    "Phone: Dov reveal picked",
    DOV,
    phoneReveal(PICKED_REVEAL, LEO, 0),
  ),
  phoneRevealPreview(
    "Phone: Priya reveal tie",
    PRIYA,
    phoneReveal(TIE_REVEAL, LEO, 0),
  ),
  phoneRevealPreview(
    "Phone: Sam reveal split",
    SAM,
    phoneReveal(SPLIT_REVEAL, PRIYA, 0),
  ),
  phoneRevealPreview(
    "Phone: Noa reveal sat out",
    NOA,
    phoneReveal(NO_VOTES_REVEAL, null, 0),
  ),
  {
    label: "Phone (no-TV): Dov vote selecting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, DOV, {
      deadline: VOTE_DEADLINE,
      stage: hostVote,
    }),
    stage: hostVote,
  },
  {
    label: "Phone (no-TV): Dov vote locked in",
    surface: "phone",
    view: phoneVoteLocked,
    room: playerRoom(phoneVoteLocked, DOV, {
      deadline: VOTE_DEADLINE,
      stage: hostVote,
    }),
    stage: hostVote,
  },
  {
    label: "Phone (no-TV): Priya reveal settled",
    surface: "phone",
    view: phoneReveal(PICKED_REVEAL, DOV, 500),
    room: playerRoom(phoneReveal(PICKED_REVEAL, DOV, 500), PRIYA, {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
      stage: hostReveal(PICKED_REVEAL),
    }),
    stage: hostReveal(PICKED_REVEAL),
  },
  {
    label: "Host: worst case, vote (8 long names, longest prompt)",
    surface: "host",
    view: stressHostVote,
    room: hostRoom(stressHostVote, VOTE_DEADLINE),
  },
  {
    label: "Host: worst case, reveal (8 long names, longest prompt)",
    surface: "host",
    view: stressHostReveal,
    room: hostRoom(stressHostReveal, REVEAL_DEADLINE, REVEAL_PREVIEW_START),
  },
  {
    label: "Phone: worst case, ballot (8 long names, longest prompt)",
    surface: "phone",
    view: stressPhoneVoteSelecting,
    room: playerRoom(stressPhoneVoteSelecting, "stress-1", {
      deadline: VOTE_DEADLINE,
    }),
  },
  {
    label: "Phone: worst case, reveal matched (8 long names, longest prompt)",
    surface: "phone",
    view: stressPhoneReveal,
    room: playerRoom(stressPhoneReveal, "stress-0", {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
    }),
  },
  {
    label: "Phone (no-TV): worst case, ballot (8 long names, longest prompt)",
    surface: "phone",
    view: stressPhoneVoteSelecting,
    room: playerRoom(stressPhoneVoteSelecting, "stress-1", {
      deadline: VOTE_DEADLINE,
      stage: stressHostVote,
    }),
    stage: stressHostVote,
  },
  {
    label: "Phone (no-TV): worst case, reveal (8 long names, longest prompt)",
    surface: "phone",
    view: stressPhoneReveal,
    room: playerRoom(stressPhoneReveal, "stress-0", {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
      stage: stressHostReveal,
    }),
    stage: stressHostReveal,
  },
];
