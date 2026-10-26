// Sample Sketch Phone screens for the dev gallery, the design map and UI tests, driven off a
// fixed server clock. Every view is built by the real view builders from a real `setup()` state,
// so a preview can never show something the game itself could not.
import type { AvatarId, HostRoomView, PlayerId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { DrawingPromptContent, GameContext } from "@opg/sdk";
import { createRng, type Doodle } from "@opg/sdk";
import { buildHostView, buildPlayerView } from "../views";
import { chainLinks } from "../rules";
import { setup } from "../index";
import {
  DESCRIBE_MS,
  DRAW_MS,
  FAVOURITE_MS,
  PRESENT_MS,
  VOTE_MS,
  WRITE_MS,
  type ChainLink,
  type SketchHostView,
  type SketchPlayerView,
  type SketchState,
} from "../state";
import { SQUIGGLE_DOODLE } from "./PhoneDraw";

const SERVER_NOW = 1735689600000;
const MAYA = "maya";
const DOV = "dov";
const PRIYA = "priya";
const SAM = "sam";
const NOA = "noa";
const LEO = "leo";
const CHRISTABELLE = "christabelle";
const WILHELMINA = "wilhelmina";

function player(id: PlayerId, name: string, avatar: AvatarId, crowns = 0): PlayerSummary {
  return { id, name, avatar, connected: true, isVip: id === MAYA, crowns, waitingForNextGame: false };
}

const PLAYERS: PlayerSummary[] = [
  player(MAYA, "Maya", "star"),
  player(DOV, "Dov", "toast", 2),
  player(PRIYA, "Priya", "drop", 1),
  player(SAM, "Sam", "cloud"),
  player(NOA, "Noa", "cat"),
  player(LEO, "Leo", "mushroom"),
  player(CHRISTABELLE, "Christabelle", "robot"),
  player(WILHELMINA, "Wilhelmina A", "ghost"),
];

const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: [] };

/** The longest words any link can carry, so the host and phone layouts are measured at their worst. */
export const STRESS_TEXT = "a cat riding a skateboard while the moon watches";

const DRAWING: Doodle = {
  v: 1,
  s: [
    { c: 0, d: 220, g: 0, p: [180, 620, 140, -60, 160, 40, -150, 30, 180, 60, 150, -50] },
    { c: 0, d: 180, g: 90, p: [520, 560, -40, -120, 80, 0, 80, 40, 60, -20] },
    { c: 0, d: 140, g: 40, p: [700, 640, 120, -180, -40, 160, 200, 10] },
  ],
};

const WORDS = [
  "a pig surfing on a pancake",
  "sunrise over a flying waffle",
  "breakfast is attacking the town",
  STRESS_TEXT,
  "a duck with a briefcase",
  "the moon on a skateboard",
  "a cat in a tiny hat",
  "a very tall sandwich",
];

function ctx(): GameContext<DrawingPromptContent> {
  return {
    players: PLAYERS.map((each) => ({ id: each.id, name: each.name, avatar: each.avatar })),
    connectedIds: PLAYERS.map((each) => each.id),
    rng: createRng(12),
    now: SERVER_NOW,
    content: CONTENT,
  };
}

function fill(link: ChainLink, index: number): ChainLink {
  if (link.kind === "drawing") {
    return { ...link, done: true, doodle: index % 2 === 0 ? DRAWING : SQUIGGLE_DOODLE };
  }
  return { ...link, done: true, text: WORDS[index % WORDS.length] ?? WORDS[0] ?? "" };
}

/** How long the fixture says each phase lasts, mirroring the game's own constants. */
function durationOf(phase: SketchState["phase"]): number {
  switch (phase) {
    case "write":
      return WRITE_MS;
    case "draw":
      return DRAW_MS;
    case "describe":
      return DESCRIBE_MS;
    case "replay":
      return PRESENT_MS;
    case "vote":
      return VOTE_MS;
    case "favourite":
      return FAVOURITE_MS;
    default:
      return 0;
  }
}

/** Fills every link up to `upto` steps of the chain (0 = the seed only), leaving the rest open. */
function stateAt(phase: SketchState["phase"], upto: number): SketchState {
  const base = setup(ctx());
  const links: Record<string, ChainLink> = {};
  let index = 0;
  for (const [id, link] of Object.entries(base.links)) {
    links[id] = link.step < upto ? fill(link, index) : link;
    index += 1;
  }
  const deadline = SERVER_NOW + durationOf(phase);
  return {
    ...base,
    links,
    phase,
    // Chain 2 first, so the design's "Chain 1 of 8 · Priya's chain" has an owner.
    replayOrder: [2, 0, 1, 3, 4, 5, 6, 7],
    replayPos: 0,
    deadline,
    round: Math.min(upto, PLAYERS.length - 1),
  };
}

function votesFor(state: SketchState, chain: number): SketchState {
  const links = chainLinks(state, chain);
  const voters: Record<string, PlayerId[]> = {};
  // The first link is a seed with nothing before it, so the favourite goes to the drawing at
  // step 1: that is the case where the host credits the words the drawing came from. 1, 2 and 4
  // votes also put every plural form of `votes` on a screen.
  const votersByLink = [
    [CHRISTABELLE],
    [PRIYA, SAM, NOA, LEO],
    [DOV, MAYA],
  ];
  links.forEach((link, index) => {
    voters[link.id] = votersByLink[index] ?? [];
  });
  return { ...state, voters };
}

/** The same round, with `voter` already locked in on somebody else's link. */
function votedBy(state: SketchState, voter: PlayerId): SketchState {
  const target = Object.values(state.links).find(
    (link) => link.chain === 2 && link.done && link.authorId !== voter,
  );
  if (target === undefined) return state;
  const voters = state.voters[target.id] ?? [];
  return {
    ...state,
    voters: { ...state.voters, [target.id]: [...voters, voter] },
    votes: { ...state.votes, [voter]: target.id },
  };
}

const WRITE = stateAt("write", 0);
const DRAW = stateAt("draw", 1);
const DESCRIBE = stateAt("describe", 2);
const REPLAY = { ...stateAt("replay", 8), revealed: 4 };
const VOTE = votesFor(stateAt("vote", 8), 2);
const FAVOURITE = votesFor(stateAt("favourite", 8), 2);
/** Sam has already voted: the lock-in footer reads "Picked" instead of the button. */
const VOTED = votedBy(VOTE, SAM);
/** The draw round with the links of `authors` handed in, so `SentStage` sees a known wait. */
function sentAfter(state: SketchState, step: number, authors: readonly PlayerId[]): SketchState {
  const links = Object.fromEntries(
    Object.entries(state.links).map(([id, link]) => [
      id,
      link.step === step && authors.includes(link.authorId) ? fill(link, step) : link,
    ]),
  );
  return { ...state, links };
}

const ALL_IDS = PLAYERS.map((each) => each.id);
const SENT = sentAfter(DRAW, 1, [MAYA]);
const SENT_ONE = sentAfter(DRAW, 1, ALL_IDS.filter((id) => id !== LEO));
const SENT_TWO = sentAfter(DRAW, 1, ALL_IDS.filter((id) => id !== LEO && id !== NOA));
const SENT_WORDS = sentAfter(WRITE, 0, [MAYA]);
/** Sam pulled in mid-round: no link of his own for this step, so his phone shows the waiting card. */
const NO_LINK = {
  ...DRAW,
  links: Object.fromEntries(Object.entries(DRAW.links).filter(([, link]) => !(link.authorId === SAM && link.step === 1))),
};

interface RoomTiming {
  deadline: number | null;
  timerStartedAt?: number | null;
  /** The host view a no-TV phone stages, or null for a shared-screen room. */
  stage?: SketchHostView | null;
}

function commonRoom(view: SketchHostView | SketchPlayerView, timing: RoomTiming): Omit<HostRoomView, "role"> {
  const { deadline, timerStartedAt = null, stage = null } = timing;
  return {
    code: "BKTZ",
    sharedScreen: stage === null,
    phase: "in-game",
    lobbyScreen: "join",
    players: PLAYERS,
    vipId: MAYA,
    locked: false,
    games: [],
    selectedGameId: "sketch-phone",
    packs: [],
    lastResult: null,
    game: { id: "sketch-phone", view, deadline, timerStartedAt, stage },
    serverNow: SERVER_NOW,
    contentLanguage: "en",
  };
}

function hostRoom(state: SketchState) {
  const view = buildHostView(state);
  const room: HostRoomView = { role: "host", ...commonRoom(view, { deadline: state.deadline }) };
  return { view, room };
}

function phoneRoom(state: SketchState, you: PlayerId, noTv = false) {
  const view = buildPlayerView(state, you);
  const stage = noTv ? buildHostView(state) : null;
  const room: PlayerRoomView = {
    role: "player",
    you,
    ...commonRoom(view, { deadline: state.deadline, stage }),
  };
  return { view, room };
}

export interface SketchHostPreview {
  label: string;
  surface: "host";
  room: HostRoomView;
  view: SketchHostView;
}

export interface SketchPlayerPreview {
  label: string;
  surface: "phone";
  room: PlayerRoomView;
  view: SketchPlayerView;
}

export type SketchPhonePreview = SketchHostPreview | SketchPlayerPreview;

function hostPreview(label: string, state: SketchState): SketchHostPreview {
  const { view, room } = hostRoom(state);
  return { label, surface: "host", view, room };
}

function phonePreview(label: string, state: SketchState, you: PlayerId, noTv = false): SketchPlayerPreview {
  const { view, room } = phoneRoom(state, you, noTv);
  return { label, surface: "phone", view, room };
}

/** The presenter of the replay at `revealed` links: the chain's owner. */
const PRESENTER = buildHostView(REPLAY).ownerId ?? PRIYA;
const WATCHER = PLAYERS.map((each) => each.id).find((id) => id !== PRESENTER) ?? SAM;

export const sketchPhonePreviews: SketchPhonePreview[] = [
  hostPreview("Host: write", WRITE),
  hostPreview("Host: passing round", DRAW),
  hostPreview("Host: passing round, two done", SENT_TWO),
  hostPreview("Host: replay", REPLAY),
  hostPreview("Host: describing", stateAt("describe", 2)),
  hostPreview("Host: vote", VOTE),
  hostPreview("Host: favourite", FAVOURITE),
  hostPreview("Host: favourite, no votes", stateAt("favourite", 8)),
  phonePreview("Phone: Maya writing", WRITE, MAYA),
  phonePreview("Phone: Sam drawing", DRAW, SAM),
  phonePreview("Phone: Noa describing", DESCRIBE, NOA),
  phonePreview("Phone: Maya sent", SENT, MAYA),
  phonePreview("Phone: Maya sent, one player left", SENT_ONE, MAYA),
  phonePreview("Phone: Maya sent, two players left", SENT_TWO, MAYA),
  phonePreview("Phone: Maya sent the first line", SENT_WORDS, MAYA),
  phonePreview("Phone: Sam pulled in, nothing to draw", NO_LINK, SAM),
  phonePreview("Phone: Priya presenting", REPLAY, PRESENTER),
  phonePreview("Phone: Sam watching", REPLAY, WATCHER),
  phonePreview("Phone: Sam voting", VOTE, SAM),
  phonePreview("Phone: Sam has voted", VOTED, SAM),
  phonePreview("Phone: Priya favourite", FAVOURITE, PRIYA),
  phonePreview("Phone: Sam favourite", FAVOURITE, SAM),
  phonePreview("Phone (no-TV): Sam drawing", DRAW, SAM, true),
  phonePreview("Phone (no-TV): Priya presenting", REPLAY, PRESENTER, true),
  phonePreview("Phone (no-TV): Sam watching", REPLAY, WATCHER, true),
  phonePreview("Phone (no-TV): Sam voting", VOTE, SAM, true),
  phonePreview("Phone (no-TV): Priya favourite", FAVOURITE, PRIYA, true),
];

function isHostPreview(preview: SketchPhonePreview): preview is SketchHostPreview {
  return preview.surface === "host";
}

function isPlayerPreview(preview: SketchPhonePreview): preview is SketchPlayerPreview {
  return preview.surface === "phone";
}

/** The host previews on their own, typed, for the gallery's TV cases and the tests. */
export const sketchPhoneHostPreviews: SketchHostPreview[] = sketchPhonePreviews.filter(isHostPreview);

/** The phone previews on their own, typed, for the gallery's phone cases and the tests. */
export const sketchPhonePlayerPreviews: SketchPlayerPreview[] =
  sketchPhonePreviews.filter(isPlayerPreview);
