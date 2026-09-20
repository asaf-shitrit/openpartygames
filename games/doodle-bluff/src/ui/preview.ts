// Sample Doodle Bluff screens for previews and UI tests, driven off a fixed server clock.
// Shape follows games/most-likely-to/src/ui/preview.ts.
import type { AvatarId, HostRoomView, PlayerId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { DoodleHostView, DoodlePlayerView, DoodleReveal } from "../state";

const SERVER_NOW = 1735689600000;

const MAYA = "maya";
const DOV = "dov";
const PRIYA = "priya";
const SAM = "sam";

const DRAW_DEADLINE = SERVER_NOW + 90000;
const TITLE_DEADLINE = SERVER_NOW + 20000;
const VOTE_DEADLINE = SERVER_NOW + 15000;
const REVEAL_DEADLINE = SERVER_NOW + 1000;

/** A reveal already at its 8s mark, so previews and tests render the settled end state. */
export const REVEAL_PREVIEW_START = SERVER_NOW - 8000;

function player(id: PlayerId, name: string, avatar: AvatarId, isVip = false): PlayerSummary {
  return { id, name, avatar, connected: true, isVip, crowns: 0, waitingForNextGame: false };
}

const PLAYERS: PlayerSummary[] = [
  player(MAYA, "Maya", "star", true),
  player(DOV, "Dov", "toast"),
  player(PRIYA, "Priya", "drop"),
  player(SAM, "Sam", "cloud"),
];

const ALL_IDS = PLAYERS.map((p) => p.id);
const TOTALS = { [MAYA]: 2000, [DOV]: 1500, [PRIYA]: 1500, [SAM]: 1000 } satisfies Record<PlayerId, number>;

const SAMPLE_DOODLE = {
  v: 1 as const,
  s: [
    { c: 0, d: 400, g: 0, p: [300, 500, 120, -80, 120, 80, 120, -80] },
    { c: 2, d: 260, g: 120, p: [600, 300, -60, 120, -60, -120] },
  ],
};

const FOUND_REVEAL: DoodleReveal = {
  artistId: PRIYA,
  drawingId: `${PRIYA}:0`,
  doodle: SAMPLE_DOODLE,
  truthOptionId: "o1",
  prompt: "a dog on a scooter",
  foundByIds: [MAYA, SAM],
  titles: [
    { optionId: "o2", text: "a cat riding a skateboard", authorId: DOV, fooledIds: [], points: 0 },
    { optionId: "o3", text: "a duck on a unicycle", authorId: null, fooledIds: [], points: 0 },
  ],
  artistPoints: 1000,
};

const NOBODY_FOUND_REVEAL: DoodleReveal = {
  ...FOUND_REVEAL,
  foundByIds: [],
  artistPoints: 0,
  titles: [
    { optionId: "o2", text: "a cat riding a skateboard", authorId: DOV, fooledIds: [MAYA, SAM], points: 1000 },
  ],
};

const HOST_BASE = { roundNumber: 3, roundCount: 8, playerIds: ALL_IDS, totals: TOTALS };

const hostDraw: DoodleHostView = {
  ...HOST_BASE,
  phase: "draw",
  drawnIds: [MAYA, DOV],
  drawnCounts: {},
  artistId: null,
  doodle: null,
  writtenIds: [],
  votedIds: [],
  options: null,
  reveal: null,
  pointsThisRound: null,
  gallery: null,
};

const hostTitle: DoodleHostView = {
  ...HOST_BASE,
  phase: "title",
  drawnIds: ALL_IDS,
  drawnCounts: {},
  artistId: PRIYA,
  doodle: SAMPLE_DOODLE,
  writtenIds: [MAYA],
  votedIds: [],
  options: null,
  reveal: null,
  pointsThisRound: null,
  gallery: null,
};

const hostVote: DoodleHostView = {
  ...HOST_BASE,
  phase: "vote",
  drawnIds: ALL_IDS,
  drawnCounts: {},
  artistId: PRIYA,
  doodle: SAMPLE_DOODLE,
  writtenIds: [MAYA, DOV, SAM],
  votedIds: [MAYA],
  options: [
    { id: "o1", text: "a dog on a scooter" },
    { id: "o2", text: "a cat riding a skateboard" },
    { id: "o3", text: "a duck on a unicycle" },
  ],
  reveal: null,
  pointsThisRound: null,
  gallery: null,
};

function hostReveal(reveal: DoodleReveal): DoodleHostView {
  return {
    ...HOST_BASE,
    phase: "reveal",
    drawnIds: ALL_IDS,
    drawnCounts: {},
    artistId: reveal.artistId,
    doodle: reveal.doodle,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal,
    pointsThisRound: { [MAYA]: 1000, [DOV]: 0, [PRIYA]: reveal.artistPoints, [SAM]: 1000 },
    gallery: null,
  };
}

const hostGallery: DoodleHostView = {
  ...HOST_BASE,
  phase: "gallery",
  drawnIds: ALL_IDS,
  drawnCounts: {},
  artistId: null,
  doodle: null,
  writtenIds: [],
  votedIds: [],
  options: null,
  reveal: null,
  pointsThisRound: null,
  gallery: [
    { drawingId: `${PRIYA}:0`, artistId: PRIYA, doodle: SAMPLE_DOODLE, title: "a dog on a scooter", shown: true, foundByCount: 2 },
    { drawingId: `${DOV}:0`, artistId: DOV, doodle: SAMPLE_DOODLE, title: "a squirrel driving a bus", shown: false, foundByCount: null },
  ],
};

const PHONE_BASE = { playerCount: ALL_IDS.length, roundNumber: 3, roundCount: 8, totals: TOTALS };

const phoneDraw: DoodlePlayerView = {
  ...PHONE_BASE,
  phase: "draw",
  myPrompts: [
    { drawingId: `${DOV}:0`, prompt: "a cat riding a skateboard" },
    { drawingId: `${DOV}:1`, prompt: "a squirrel driving a bus" },
  ],
  myStrokeCounts: { [`${DOV}:0`]: 3 },
  myDone: {},
  drawnCount: 1,
  currentDrawingId: null,
  isArtist: false,
  doodle: null,
  myTitle: null,
  titleError: null,
  titledCount: 0,
  options: null,
  myVote: null,
  votedCount: 0,
  reveal: null,
  myPoints: null,
};

function phoneTitle(overrides: Partial<DoodlePlayerView>): DoodlePlayerView {
  return {
    ...PHONE_BASE,
    phase: "title",
    myPrompts: [],
    myStrokeCounts: {},
    myDone: {},
    drawnCount: ALL_IDS.length,
    currentDrawingId: `${PRIYA}:0`,
    isArtist: false,
    doodle: SAMPLE_DOODLE,
    myTitle: null,
    titleError: null,
    titledCount: 1,
    options: null,
    myVote: null,
    votedCount: 0,
    reveal: null,
    myPoints: null,
    ...overrides,
  };
}

const phoneVoteSelecting: DoodlePlayerView = {
  ...phoneTitle({}),
  phase: "vote",
  titledCount: 3,
  options: [
    { id: "o1", text: "a dog on a scooter", mine: false },
    { id: "o2", text: "a cat riding a skateboard", mine: true },
    { id: "o3", text: "a duck on a unicycle", mine: false },
  ],
};

function phoneReveal(reveal: DoodleReveal, meIsArtist: boolean, myVote: PlayerId | null, myPoints: number): DoodlePlayerView {
  return {
    ...PHONE_BASE,
    phase: "reveal",
    myPrompts: [],
    myStrokeCounts: {},
    myDone: {},
    drawnCount: ALL_IDS.length,
    currentDrawingId: reveal.drawingId,
    isArtist: meIsArtist,
    doodle: reveal.doodle,
    myTitle: null,
    titleError: null,
    titledCount: 0,
    options: null,
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
  stage?: DoodleHostView | null;
}

function commonRoom(view: DoodleHostView | DoodlePlayerView, timing: RoomTiming) {
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
    selectedGameId: "doodle-bluff",
    packs: [],
    lastResult: null,
    game: { id: "doodle-bluff", view, deadline, timerStartedAt, stage },
    serverNow: SERVER_NOW,
  };
}

function hostRoom(view: DoodleHostView, deadline: number | null, timerStartedAt: number | null = null): HostRoomView {
  return { role: "host", ...commonRoom(view, { deadline, timerStartedAt }) };
}

function playerRoom(view: DoodlePlayerView, you: PlayerId, timing: RoomTiming): PlayerRoomView {
  return { role: "player", you, ...commonRoom(view, timing) };
}

export interface DoodleBluffPreview {
  label: string;
  surface: "host" | "phone";
  view: DoodleHostView | DoodlePlayerView;
  room: HostRoomView | PlayerRoomView;
  /** The host view a no-TV phone stages alongside `view`; undefined for a shared-screen preview. */
  stage?: DoodleHostView;
}

function hostRevealPreview(label: string, reveal: DoodleReveal): DoodleBluffPreview {
  const view = hostReveal(reveal);
  return { label, surface: "host", view, room: hostRoom(view, REVEAL_DEADLINE, REVEAL_PREVIEW_START) };
}

function phoneRevealPreview(label: string, you: PlayerId, view: DoodlePlayerView): DoodleBluffPreview {
  return {
    label,
    surface: "phone",
    view,
    room: playerRoom(view, you, { deadline: REVEAL_DEADLINE, timerStartedAt: REVEAL_PREVIEW_START }),
  };
}

export const doodleBluffPreviews: DoodleBluffPreview[] = [
  { label: "Host: draw", surface: "host", view: hostDraw, room: hostRoom(hostDraw, DRAW_DEADLINE) },
  { label: "Host: title", surface: "host", view: hostTitle, room: hostRoom(hostTitle, TITLE_DEADLINE) },
  { label: "Host: vote", surface: "host", view: hostVote, room: hostRoom(hostVote, VOTE_DEADLINE) },
  hostRevealPreview("Host: reveal found", FOUND_REVEAL),
  hostRevealPreview("Host: reveal nobody found it", NOBODY_FOUND_REVEAL),
  { label: "Host: gallery", surface: "host", view: hostGallery, room: hostRoom(hostGallery, null) },
  { label: "Phone: Dov drawing", surface: "phone", view: phoneDraw, room: playerRoom(phoneDraw, DOV, { deadline: DRAW_DEADLINE }) },
  {
    label: "Phone: Priya sit tight (artist)",
    surface: "phone",
    view: phoneTitle({ isArtist: true }),
    room: playerRoom(phoneTitle({ isArtist: true }), PRIYA, { deadline: TITLE_DEADLINE }),
  },
  {
    label: "Phone: Maya writing a title",
    surface: "phone",
    view: phoneTitle({}),
    room: playerRoom(phoneTitle({}), MAYA, { deadline: TITLE_DEADLINE }),
  },
  {
    label: "Phone: Dov title rejected (truth)",
    surface: "phone",
    view: phoneTitle({ titleError: "truth" }),
    room: playerRoom(phoneTitle({ titleError: "truth" }), DOV, { deadline: TITLE_DEADLINE }),
  },
  {
    label: "Phone: Maya voting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, MAYA, { deadline: VOTE_DEADLINE }),
  },
  phoneRevealPreview("Phone: Maya found it", MAYA, phoneReveal(FOUND_REVEAL, false, "o1", 1000)),
  phoneRevealPreview("Phone: Dov fooled nobody", DOV, phoneReveal(FOUND_REVEAL, false, "o2", 0)),
  phoneRevealPreview("Phone: Priya artist, found", PRIYA, phoneReveal(FOUND_REVEAL, true, null, 1000)),
  phoneRevealPreview("Phone: Priya artist, nobody found it", PRIYA, phoneReveal(NOBODY_FOUND_REVEAL, true, null, 0)),
  {
    label: "Phone (no-TV): Maya voting",
    surface: "phone",
    view: phoneVoteSelecting,
    room: playerRoom(phoneVoteSelecting, MAYA, { deadline: VOTE_DEADLINE, stage: hostVote }),
    stage: hostVote,
  },
  {
    label: "Phone (no-TV): Maya reveal settled",
    surface: "phone",
    view: phoneReveal(FOUND_REVEAL, false, "o1", 1000),
    room: playerRoom(phoneReveal(FOUND_REVEAL, false, "o1", 1000), MAYA, {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
      stage: hostReveal(FOUND_REVEAL),
    }),
    stage: hostReveal(FOUND_REVEAL),
  },
  {
    label: "Phone (no-TV): gallery",
    surface: "phone",
    view: { ...phoneDraw, phase: "gallery" },
    room: playerRoom({ ...phoneDraw, phase: "gallery" }, MAYA, { deadline: null, stage: hostGallery }),
    stage: hostGallery,
  },
];
