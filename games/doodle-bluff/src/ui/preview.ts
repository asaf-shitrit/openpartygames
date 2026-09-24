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
  /** The room's cast, when it is not the usual four. */
  players?: PlayerSummary[];
}

function commonRoom(view: DoodleHostView | DoodlePlayerView, timing: RoomTiming) {
  const { deadline, timerStartedAt = null, stage = null, players = PLAYERS } = timing;
  return {
    code: "BKTZ",
    sharedScreen: stage === null,
    phase: "in-game" as const,
    lobbyScreen: "join" as const,
    players,
    vipId: players[0]?.id ?? MAYA,
    locked: false,
    games: [],
    selectedGameId: "doodle-bluff",
    packs: [],
    lastResult: null,
    game: { id: "doodle-bluff", view, deadline, timerStartedAt, stage },
    serverNow: SERVER_NOW,
    contentLanguage: "en" as const,
  };
}

function hostRoom(
  view: DoodleHostView,
  deadline: number | null,
  timerStartedAt: number | null = null,
  players: PlayerSummary[] = PLAYERS,
): HostRoomView {
  return { role: "host", ...commonRoom(view, { deadline, timerStartedAt, players }) };
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

// ---------- Worst case ----------
//
// The layout suite measures these, so they carry the most punishing content the game can
// actually serve: the longest prompt any doodle-bluff pack ships, the longest house title,
// a player-written title at the action schema's cap, and a full room of players whose names
// all sit at the protocol's limit. scripts/content-stress.test.ts fails when a pack ships a
// prompt or house title longer than this, so new content re-arms these fixtures instead of
// slipping past.

/** The longest prompt in any doodle-bluff pack (packs/doodle-bluff/doodle-absurd.json). */
export const STRESS_TEXT = "an astronaut planting a flag on a giant cupcake";

/** The longest house title in any doodle-bluff pack (packs/doodle-bluff/doodle-absurd.json). */
const STRESS_HOUSE_TITLE = "pirates digging an island made of gingerbread";

/** A player-written title at TITLE_MAX_LENGTH (games/doodle-bluff/src/state.ts). */
const STRESS_PLAYER_TITLE = "a garden gnome plotting something sneaky";

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

const STRESS_AVATARS: AvatarId[] = ["star", "toast", "drop", "cloud", "cat", "ghost", "mushroom", "egg"];

const STRESS_PLAYERS: PlayerSummary[] = STRESS_NAMES.map((name, index) =>
  player(`stress-${index}`, name, STRESS_AVATARS[index] ?? "star", index === 0),
);

const STRESS_IDS: PlayerId[] = STRESS_PLAYERS.map((each) => each.id);
const [STRESS_ARTIST, ...STRESS_NON_ARTISTS] = STRESS_IDS;
const STRESS_TOTALS: Record<PlayerId, number> = Object.fromEntries(
  STRESS_PLAYERS.map((each, index) => [each.id, 2000 - index * 100]),
);

/** Seven non-artist titles at the worst case, one of them a house title nobody claimed. */
const STRESS_TITLE_TEXTS = STRESS_NON_ARTISTS.map((_, index) => (index === 0 ? STRESS_HOUSE_TITLE : STRESS_PLAYER_TITLE));

const stressHostTitle: DoodleHostView = {
  roundNumber: 3,
  roundCount: 8,
  playerIds: STRESS_IDS,
  totals: STRESS_TOTALS,
  phase: "title",
  drawnIds: STRESS_IDS,
  drawnCounts: {},
  artistId: STRESS_ARTIST ?? MAYA,
  doodle: SAMPLE_DOODLE,
  writtenIds: STRESS_NON_ARTISTS.slice(0, 4),
  votedIds: [],
  options: null,
  reveal: null,
  pointsThisRound: null,
  gallery: null,
};

const STRESS_TRUTH_OPTION = { id: "truth", text: STRESS_TEXT };
const STRESS_TITLE_OPTIONS = STRESS_NON_ARTISTS.map((id, index) => ({
  id: `title-${id}`,
  text: STRESS_TITLE_TEXTS[index] ?? STRESS_PLAYER_TITLE,
}));

const stressHostVote: DoodleHostView = {
  ...stressHostTitle,
  phase: "vote",
  writtenIds: STRESS_NON_ARTISTS,
  votedIds: STRESS_NON_ARTISTS.slice(0, 3),
  options: [STRESS_TRUTH_OPTION, ...STRESS_TITLE_OPTIONS],
};

const stressPhoneVote: DoodlePlayerView = {
  playerCount: STRESS_IDS.length,
  roundNumber: 3,
  roundCount: 8,
  totals: STRESS_TOTALS,
  phase: "vote",
  myPrompts: [],
  myStrokeCounts: {},
  myDone: {},
  drawnCount: STRESS_IDS.length,
  currentDrawingId: `${STRESS_ARTIST}:0`,
  isArtist: false,
  doodle: SAMPLE_DOODLE,
  myTitle: null,
  titleError: null,
  titledCount: STRESS_NON_ARTISTS.length,
  options: [
    { id: STRESS_TRUTH_OPTION.id, text: STRESS_TRUTH_OPTION.text, mine: false },
    ...STRESS_TITLE_OPTIONS.map((option, index) => ({ id: option.id, text: option.text, mine: index === 0 })),
  ],
  myVote: null,
  votedCount: 3,
  reveal: null,
  myPoints: null,
};

const stressPhoneTitle: DoodlePlayerView = {
  ...stressPhoneVote,
  phase: "title",
  currentDrawingId: `${STRESS_ARTIST}:0`,
  titledCount: 4,
  options: null,
  votedCount: 0,
};

/** Seven revealed titles: six from players named at NAME_MAX_LENGTH, one unclaimed (house). */
const STRESS_REVEALED_TITLES = STRESS_NON_ARTISTS.map((id, index) => ({
  optionId: `title-${id}`,
  text: STRESS_TITLE_TEXTS[index] ?? STRESS_PLAYER_TITLE,
  authorId: index === 0 ? null : id,
  fooledIds: index === 0 ? STRESS_NON_ARTISTS.slice(1, 4) : STRESS_NON_ARTISTS.filter((each) => each !== id).slice(0, 2),
  points: index === 0 ? 1500 : 1000,
}));

const STRESS_REVEAL: DoodleReveal = {
  artistId: STRESS_ARTIST ?? PRIYA,
  drawingId: `${STRESS_ARTIST}:0`,
  doodle: SAMPLE_DOODLE,
  truthOptionId: "truth",
  prompt: STRESS_TEXT,
  foundByIds: STRESS_NON_ARTISTS.slice(0, 4),
  titles: STRESS_REVEALED_TITLES,
  artistPoints: 1000,
};

function stressHostReveal(): DoodleHostView {
  return {
    roundNumber: 3,
    roundCount: 8,
    playerIds: STRESS_IDS,
    totals: STRESS_TOTALS,
    phase: "reveal",
    drawnIds: STRESS_IDS,
    drawnCounts: {},
    artistId: STRESS_REVEAL.artistId,
    doodle: STRESS_REVEAL.doodle,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal: STRESS_REVEAL,
    pointsThisRound: Object.fromEntries(STRESS_IDS.map((id) => [id, id === STRESS_ARTIST ? 1000 : 500])),
    gallery: null,
  };
}

const stressPhoneReveal: DoodlePlayerView = {
  playerCount: STRESS_IDS.length,
  roundNumber: 3,
  roundCount: 8,
  totals: STRESS_TOTALS,
  phase: "reveal",
  myPrompts: [],
  myStrokeCounts: {},
  myDone: {},
  drawnCount: STRESS_IDS.length,
  currentDrawingId: STRESS_REVEAL.drawingId,
  isArtist: false,
  doodle: STRESS_REVEAL.doodle,
  myTitle: null,
  titleError: null,
  titledCount: 0,
  options: null,
  myVote: "truth",
  votedCount: 0,
  reveal: STRESS_REVEAL,
  myPoints: 1000,
};

/** Sixteen drawings: every player made two, titles at the worst-case lengths
 * (plan/0003-doodle-bluff.md, "The gallery"). */
const STRESS_GALLERY = STRESS_IDS.flatMap((artistId, playerIndex) =>
  [0, 1].map((slot) => ({
    drawingId: `${artistId}:${slot}`,
    artistId,
    doodle: SAMPLE_DOODLE,
    title: (playerIndex + slot) % 2 === 0 ? STRESS_HOUSE_TITLE : STRESS_PLAYER_TITLE,
    shown: (playerIndex + slot) % 3 !== 0,
    foundByCount: (playerIndex + slot) % 3 !== 0 ? (playerIndex + slot) % 5 : null,
  })),
);

function stressHostGallery(): DoodleHostView {
  return {
    roundNumber: 8,
    roundCount: 8,
    playerIds: STRESS_IDS,
    totals: STRESS_TOTALS,
    phase: "gallery",
    drawnIds: STRESS_IDS,
    drawnCounts: {},
    artistId: null,
    doodle: null,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal: null,
    pointsThisRound: null,
    gallery: STRESS_GALLERY,
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
  {
    label: "Host: worst case, title (long prompt, 8 long names)",
    surface: "host",
    view: stressHostTitle,
    room: hostRoom(stressHostTitle, TITLE_DEADLINE, null, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, vote (8 long options)",
    surface: "host",
    view: stressHostVote,
    room: hostRoom(stressHostVote, VOTE_DEADLINE, null, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, reveal (7 long titles, house title)",
    surface: "host",
    view: stressHostReveal(),
    room: hostRoom(stressHostReveal(), REVEAL_DEADLINE, REVEAL_PREVIEW_START, STRESS_PLAYERS),
  },
  {
    label: "Host: worst case, gallery (16 drawings, long titles)",
    surface: "host",
    view: stressHostGallery(),
    room: hostRoom(stressHostGallery(), null, null, STRESS_PLAYERS),
  },
  {
    label: "Phone: worst case, writing a title (8 long names)",
    surface: "phone",
    view: stressPhoneTitle,
    room: playerRoom(stressPhoneTitle, STRESS_NON_ARTISTS[0] ?? MAYA, {
      deadline: TITLE_DEADLINE,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, voting (8 long options)",
    surface: "phone",
    view: stressPhoneVote,
    room: playerRoom(stressPhoneVote, STRESS_NON_ARTISTS[0] ?? MAYA, {
      deadline: VOTE_DEADLINE,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone: worst case, reveal (long prompt and titles)",
    surface: "phone",
    view: stressPhoneReveal,
    room: playerRoom(stressPhoneReveal, STRESS_NON_ARTISTS[0] ?? MAYA, {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
      players: STRESS_PLAYERS,
    }),
  },
  {
    label: "Phone (no-TV): worst case, reveal (7 long titles, house title)",
    surface: "phone",
    view: stressPhoneReveal,
    room: playerRoom(stressPhoneReveal, STRESS_NON_ARTISTS[0] ?? MAYA, {
      deadline: REVEAL_DEADLINE,
      timerStartedAt: REVEAL_PREVIEW_START,
      stage: stressHostReveal(),
      players: STRESS_PLAYERS,
    }),
    stage: stressHostReveal(),
  },
  {
    label: "Phone (no-TV): worst case, gallery (16 drawings, long titles)",
    surface: "phone",
    view: { ...stressPhoneVote, phase: "gallery" },
    room: playerRoom({ ...stressPhoneVote, phase: "gallery" }, STRESS_NON_ARTISTS[0] ?? MAYA, {
      deadline: null,
      stage: stressHostGallery(),
      players: STRESS_PLAYERS,
    }),
    stage: stressHostGallery(),
  },
];
