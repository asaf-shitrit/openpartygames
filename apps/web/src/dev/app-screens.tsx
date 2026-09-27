// The real components and fixture props behind every AppCase in screens.ts — a React module,
// unlike screens.ts, which layout.spec.ts imports directly under Node. Only ScreenGallery.tsx
// (and this file's own test) import this.
import type { JSX } from "react";
import type {
  AvatarId,
  GameSummary,
  PackSummary,
  PlayerRoomView,
} from "@opg/protocol";
import { NAME_MAX_LENGTH } from "@opg/protocol";
import { useLocale } from "@opg/i18n";
import type { ServerClock } from "@opg/ui";
import { LANDING_GAMES } from "../games";
import {
  makeGame,
  makeHostView,
  makePack,
  makePlayer,
  makePlayerView,
  makeResultWithAwards,
  makeTiedResult,
} from "../screens/fixtures/room";
import { PhoneAvatarPicker } from "../screens/PhoneAvatarPicker";
import { PhoneJoin } from "../screens/PhoneJoin";
import { PhoneKicked } from "../screens/PhoneKicked";
import { PhoneLanding } from "../screens/PhoneLanding";
import { PhoneLobby } from "../screens/PhoneLobby";
import { PhoneReconnecting } from "../screens/PhoneReconnecting";
import { PhoneNextRoundBar } from "../screens/PhoneNextRoundBar";
import { PhoneResults } from "../screens/PhoneResults";
import { PhoneStarting } from "../screens/PhoneStarting";
import { PhoneVipControls } from "../screens/PhoneVipControls";
import { PhoneWaiting } from "../screens/PhoneWaiting";
import { TvCredits } from "../screens/TvCredits";
import { TvFinalScores } from "../screens/TvFinalScores";
import { TvFullTonight } from "../screens/TvFullTonight";
import { TvGamePicker } from "../screens/TvGamePicker";
import { TvLanding } from "../screens/TvLanding";
import { TvLobby } from "../screens/TvLobby";
import { TvReconnecting } from "../screens/TvReconnecting";

const SERVER_NOW = 1_700_000_000_000;

/** No-op handlers: the gallery renders screens; nothing it does reaches a room. */
function ignore(): void {
  // Intentionally empty — see above.
}

/** Eight players, the room ceiling, each named at NAME_MAX_LENGTH (12 characters). */
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

function stressPlayers(
  vipIndex = 0,
  waiting: (index: number) => boolean = () => false,
  away: (index: number) => boolean = () => false,
): ReturnType<typeof makePlayer>[] {
  return STRESS_NAMES.map((name, index) =>
    makePlayer({
      id: `stress-${index}`,
      name,
      avatar: STRESS_AVATARS[index] ?? "star",
      crowns: index % 3,
      isVip: index === vipIndex,
      waitingForNextGame: waiting(index),
      // Defaults to connected. A roster with away players is taller than one without — each
      // away row carries an extra badge — so it needs its own fixture rather than being
      // assumed to fit because the all-present version does.
      connected: !away(index),
    }),
  );
}

// `LandingGame` (games.tsx) carries no `noTv` field — it's the landing page's static blurb/icon
// metadata, from before a room exists. Mirrors each game's own `GameDefinition.noTv` (see
// games/<id>/src/index.ts) so fixtures built on `ALL_GAMES` with `sharedScreen: false` can
// actually tell a blocked (TV-only) game apart from a safe one — without this, `makeGame`'s
// `noTv: false` default made every game in every fixture look TV-only, so "no shared screen"
// always showed every game blocked and never showed what picking a real no-TV game looks like.
const NO_TV_GAME_IDS = new Set(["imposter", "most-likely-to", "doodle-bluff"]);

/** Every game the landing page shows, as the room-view shape the lobby/picker expect. */
const ALL_GAMES: GameSummary[] = LANDING_GAMES.map((game) =>
  makeGame({
    id: game.id,
    name: game.name,
    blurb: game.blurb,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    minutes: game.minutes,
    noTv: NO_TV_GAME_IDS.has(game.id),
  }),
);

const MANY_PACKS: PackSummary[] = [
  makePack({ id: "animals", name: "Animals", rating: "family", enabled: true, itemCount: 12 }),
  makePack({ id: "food-and-drink", name: "Food & Drink", rating: "family", enabled: true, itemCount: 20 }),
  makePack({ id: "movies-and-tv", name: "Movies & TV", rating: "teen", enabled: false, itemCount: 15 }),
  makePack({ id: "after-dark", name: "After Dark", rating: "adult", enabled: false, itemCount: 8 }),
];

function clockAt(now: number): ServerClock {
  return { now: () => now };
}

// ---------- phone: join ----------

function JoinScreen() {
  return <PhoneJoin onJoin={ignore} />;
}

function JoinWorstScreen() {
  return (
    <PhoneJoin
      initialCode="BKTZ"
      initialName={"Wilhelmina".slice(0, NAME_MAX_LENGTH)}
      error="This room is full for tonight. Try again tomorrow."
      onJoin={ignore}
    />
  );
}

/**
 * The other join failure, and the taller one: a code that does not exist also carries the
 * sounds-alike hint, a second line of body text under the error.
 *
 * That hint went unmeasured for its whole life. It only renders for a not-found error, the
 * worst-case fixture above passes a room-full one, and until `PhoneJoin` grew `errorHint` the
 * branch could not be driven from outside the component at all — the copy came from an internal
 * async path a static fixture cannot reach. A sub-floor 15px font size lived on this line
 * undetected as a direct result. Pulled from the dictionary rather than retyped, so the fixture
 * cannot drift from the copy players actually see.
 */
function JoinNotFoundScreen() {
  const { t } = useLocale();
  return (
    <PhoneJoin
      initialCode="BKTZ"
      initialName={"Wilhelmina".slice(0, NAME_MAX_LENGTH)}
      error={t.join.errorMissing}
      errorHint={t.join.soundsAlikeHint}
      onJoin={ignore}
    />
  );
}

// ---------- phone: avatar picker ----------

function avatarPickerView(patch: Partial<PlayerRoomView> = {}): PlayerRoomView {
  return makePlayerView({
    players: [makePlayer({ id: "p1", name: "Priya", avatar: "drop" })],
    ...patch,
  });
}

function AvatarPickerScreen() {
  return <PhoneAvatarPicker view={avatarPickerView()} onPick={ignore} onDone={ignore} />;
}

function AvatarPickerWorstScreen() {
  const players = stressPlayers();
  return (
    <PhoneAvatarPicker
      view={avatarPickerView({ you: "stress-0", players })}
      onPick={ignore}
      onDone={ignore}
    />
  );
}

// ---------- phone: lobby ----------

function LobbyScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop", isVip: true }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makePlayerView({ you: "p2", players, games: ALL_GAMES });
  return <PhoneLobby view={view} onChangeAvatar={ignore} onLeave={ignore} />;
}

function LobbyWorstScreen() {
  const players = stressPlayers();
  const view = makePlayerView({
    you: "stress-1",
    players,
    games: ALL_GAMES,
    sharedScreen: false,
    // "real-or-nah" is not `noTv`, so picking it with no shared screen is exactly the blocked
    // case `SelectedGameSection` warns about: the old fixture picked "doodle-bluff" instead,
    // which *is* `noTv`, so `BlockedReason` and the escape line (naming every noTv alternative)
    // never rendered here despite the "no shared screen" label promising that state.
    selectedGameId: "real-or-nah",
  });
  return <PhoneLobby view={view} onChangeAvatar={ignore} onLeave={ignore} />;
}

// ---------- phone: VIP controls ----------

function VipControlsScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop", isVip: true }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makePlayerView({
    you: "p1",
    players,
    games: ALL_GAMES,
    packs: MANY_PACKS,
  });
  return (
    <PhoneVipControls
      view={view}
      onPickGame={ignore}
      onSetPack={ignore}
      onSetLocked={ignore}
      onSetSharedScreen={ignore}
      onKick={ignore}
      onStartGame={ignore}
    />
  );
}

function VipControlsWorstScreen() {
  const players = stressPlayers();
  const view = makePlayerView({
    you: "stress-0",
    players,
    games: ALL_GAMES,
    packs: MANY_PACKS,
    locked: true,
    sharedScreen: false,
    // "imposter" (the default `selectedGameId`) is `noTv`, so with no shared screen it is
    // never blocked — the "blocked" chip on the tile, the longer `gameNeedsSharedScreen`
    // disabled-start reason, and the `playOnTvLaptopAdds` hint (naming every blocked game)
    // never rendered here despite "no shared screen" being part of this fixture's label.
    // "real-or-nah" is not `noTv`, so it exercises all three.
    selectedGameId: "real-or-nah",
  });
  return (
    <PhoneVipControls
      view={view}
      error="Couldn't reach the room. Check your connection and try again."
      onPickGame={ignore}
      onSetPack={ignore}
      onSetLocked={ignore}
      onSetSharedScreen={ignore}
      onKick={ignore}
      onStartGame={ignore}
    />
  );
}

// ---------- phone: results ----------

// The crown beat, live: awardCount 3 (2000 + 3*3000 = 11000) plus the 8000ms to "crown",
// caught within its live-entry grace window. Real state, worth measuring for the crown/confetti
// beat's own layout — but NOT the crowded case: the crown card is just a crown and one short
// headline (the a11y contrast collector reports exactly 1 element checked on this screen).
const CROWN_LIVE_ELAPSED_MS = 11_000 + 8_000 + 200;

// The settle beat, for the worst case: awardCount 3 puts crown-intro at
// 2000 + 3*3000 = 11000ms (see `finaleBeats`/`crownIntroAtMs`), and settle fires
// `settleAfterIntroMs` (11000ms) after that, so 22000ms after `finishedAt`. This is the most
// crowded thing `PhoneResults` ever draws: `SettledCard` holds your rank, your score, and
// `StickerRow`'s wrapping award pills all at once. No fixture ever reached it before — both
// results screens froze on the crown beat instead, which this file wrongly called the worst
// case. +200ms is slack past the exact boundary, not a live-entry grace window (settle has no
// "live" state to catch).
const SETTLE_ELAPSED_MS = 11_000 + 11_000 + 200;

function ResultsScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop" }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makePlayerView({
    you: "p2",
    players,
    lastResult: makeResultWithAwards(),
  });
  return <PhoneResults view={view} clock={clockAt(SERVER_NOW + CROWN_LIVE_ELAPSED_MS)} />;
}

/** The heaviest result a room can produce, shared by the TV-mode and no-TV worst cases. */
function worstCaseResult() {
  return makeTiedResult({
    finishedAt: SERVER_NOW,
    // stress-0 and stress-1 genuinely tie for first (both 100); the rest are unique scores
    // below them, so `rankPlayers` still produces third/second beats ahead of the tie.
    scores: {
      "stress-0": 100,
      "stress-1": 100,
      "stress-2": 90,
      "stress-3": 80,
      "stress-4": 70,
      "stress-5": 60,
      "stress-6": 50,
      "stress-7": 40,
    },
    winnerIds: ["stress-0", "stress-1"],
    // All three land on "you" (stress-0), so `myAwards` actually returns them and StickerRow
    // renders and wraps three pills — assigning them to other players (as this fixture used to)
    // makes `myAwards` return `[]` and the row never renders at all.
    awards: [
      { id: "word-thief", playerIds: ["stress-0"], value: 4 },
      { id: "master-of-disguise", playerIds: ["stress-0"], value: 2 },
      { id: "sharpest-eye", playerIds: ["stress-0"], value: 5 },
    ],
  });
}

function ResultsWorstScreen() {
  const view = makePlayerView({
    players: stressPlayers(),
    you: "stress-0",
    lastResult: worstCaseResult(),
  });
  return <PhoneResults view={view} clock={clockAt(SERVER_NOW + SETTLE_ELAPSED_MS)} />;
}

/**
 * The same settled beat in a room with no TV, which is a strictly taller screen: with no shared
 * screen to carry the scoreboard, `PhoneResults` puts the full ranked table on the phone under
 * the reader's own card, plus the "waiting on the VIP" line. Eight names at NAME_MAX_LENGTH and
 * three award pills stack on top of that, so this — not the TV-mode worst case above — is the
 * tallest thing the results screen ever renders, and the one most likely to outgrow a phone.
 */
function ResultsWorstNoTvScreen() {
  const view = makePlayerView({
    you: "stress-0",
    // Somebody else is VIP, and `vipId` names a player who is really in the room. Both halves
    // matter: the waiting line only renders for a non-VIP, and it interpolates the VIP's name,
    // so leaving `vipId` at the base fixture's "p1" resolves to nothing and prints the
    // `someone` fallback — seven characters where the worst case is a name at the 12-character
    // limit, which is the whole reason this fixture exists.
    players: stressPlayers(1),
    vipId: "stress-1",
    lastResult: worstCaseResult(),
    sharedScreen: false,
  });
  return <PhoneResults view={view} clock={clockAt(SERVER_NOW + SETTLE_ELAPSED_MS)} />;
}

/**
 * The composition that actually ships to the VIP: the finale plus the bar that leaves it,
 * inside one column.
 *
 * Nothing measured this before, and a release blocker rode in on the gap — the bar was pinned
 * to the viewport, so it reserved no space and sat on top of the last standings row, which
 * hit-tested as the button rather than the row. Both halves matter here: `you` must be the VIP
 * (only the VIP is given a bar, and the VIP never sees the "waiting on…" line a non-VIP does),
 * and there must be no shared screen, because that is when the standings render on the phone
 * and the column is at its tallest.
 */
function ResultsVipNoTvScreen() {
  const view = makePlayerView({
    you: "stress-0",
    players: stressPlayers(),
    lastResult: worstCaseResult(),
    sharedScreen: false,
  });
  return (
    <PhoneResults
      view={view}
      clock={clockAt(SERVER_NOW + SETTLE_ELAPSED_MS)}
      footer={<PhoneNextRoundBar onNextRound={ignore} />}
    />
  );
}

// ---------- phone: reconnecting / kicked / waiting / landing ----------

function ReconnectingScreen() {
  return <PhoneReconnecting name="Priya" avatar="drop" onReload={ignore} />;
}

function KickedScreen() {
  return <PhoneKicked name="the VIP" avatar="drop" />;
}

/** A real kicker's name can run to NAME_MAX_LENGTH; "the VIP" (7 characters) never stressed it. */
function KickedWorstScreen() {
  return (
    <PhoneKicked name={"Wilhelmina A".slice(0, NAME_MAX_LENGTH)} avatar="mushroom" />
  );
}

function WaitingScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop" }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star", waitingForNextGame: true }),
  ];
  const view = makePlayerView({
    you: "p2",
    players,
    games: ALL_GAMES,
    selectedGameId: "imposter",
    phase: "in-game",
    game: { id: "imposter", view: {}, stage: null, deadline: null, timerStartedAt: null },
  });
  return <PhoneWaiting view={view} />;
}

/**
 * The beat between the VIP tapping Start and the first round. Named for the longest game in the
 * registry, because the heading interpolates it and this screen does not scroll.
 */
function StartingScreen() {
  const view = makePlayerView({
    players: stressPlayers(),
    you: "stress-1",
    games: ALL_GAMES,
    selectedGameId: "most-likely-to",
    phase: "starting",
  });
  return <PhoneStarting view={view} />;
}

/** A full room where three phones have dropped: every away row grows by a badge. */
function LobbyAwayScreen() {
  const view = makePlayerView({
    players: stressPlayers(0, () => false, (index) => index % 3 === 2),
    you: "stress-1",
    games: ALL_GAMES,
  });
  return <PhoneLobby view={view} onChangeAvatar={ignore} onLeave={ignore} />;
}

function WaitingAwayScreen() {
  const view = makePlayerView({
    you: "stress-1",
    players: stressPlayers(0, (index) => index !== 0, (index) => index % 3 === 2),
    games: ALL_GAMES,
    selectedGameId: "doodle-bluff",
    phase: "in-game",
    game: { id: "doodle-bluff", view: {}, stage: null, deadline: null, timerStartedAt: null },
  });
  return <PhoneWaiting view={view} />;
}

function WaitingWorstScreen() {
  const players = stressPlayers(0, (index) => index !== 0);
  const view = makePlayerView({
    you: "stress-1",
    players,
    games: ALL_GAMES,
    selectedGameId: "doodle-bluff",
    phase: "in-game",
    game: { id: "doodle-bluff", view: {}, stage: null, deadline: null, timerStartedAt: null },
  });
  return <PhoneWaiting view={view} />;
}

function LandingScreen() {
  return <PhoneLanding />;
}

// ---------- TV shell ----------

function TvLandingScreen() {
  return <TvLanding />;
}

function TvFullTonightScreen() {
  return <TvFullTonight />;
}

function TvLobbyScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop", isVip: true }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makeHostView({ players, games: ALL_GAMES });
  return <TvLobby view={view} />;
}

function TvLobbyWorstScreen() {
  const players = stressPlayers();
  const view = makeHostView({ players, games: ALL_GAMES, selectedGameId: "doodle-bluff" });
  return <TvLobby view={view} />;
}

function TvGamePickerScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop", isVip: true }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makeHostView({ players, games: ALL_GAMES, selectedGameId: "real-or-nah" });
  return <TvGamePicker view={view} />;
}

function TvFinalScoresScreen() {
  const players = [
    makePlayer({ id: "p1", name: "Priya", avatar: "drop" }),
    makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    makePlayer({ id: "p3", name: "Lee", avatar: "cat" }),
  ];
  const view = makeHostView({
    players,
    games: ALL_GAMES,
    lastResult: makeResultWithAwards(),
  });
  return <TvFinalScores view={view} clock={clockAt(SERVER_NOW + 40_000)} />;
}

function TvFinalScoresWorstScreen() {
  const players = stressPlayers();
  const result = makeTiedResult({
    finishedAt: SERVER_NOW,
    // stress-0 and stress-1 genuinely tie for first (both 100), matching `winnerIds` below.
    // The old version gave them unique scores (100, 99, ...) while still calling it a tie:
    // `ScoresList`/`SettledBanner` derive their own "winners" from a shared top *rank*
    // (`ranked.filter((row) => row.rank === 1)`), not from `winnerIds`, so with unique scores
    // only stress-0 ever rendered as a winner there even though the crown headline (built from
    // `winnerIds`) said two people shared it.
    scores: {
      "stress-0": 100,
      "stress-1": 100,
      "stress-2": 90,
      "stress-3": 80,
      "stress-4": 70,
      "stress-5": 60,
      "stress-6": 50,
      "stress-7": 40,
    },
    winnerIds: ["stress-0", "stress-1"],
    awards: [
      { id: "word-thief", playerIds: ["stress-2"], value: 4 },
      { id: "master-of-disguise", playerIds: ["stress-3"], value: 2 },
      { id: "sharpest-eye", playerIds: ["stress-4"], value: 5 },
    ],
  });
  const view = makeHostView({ players, games: ALL_GAMES, lastResult: result });
  return <TvFinalScores view={view} clock={clockAt(SERVER_NOW + 40_000)} />;
}

function TvCreditsScreen() {
  return <TvCredits />;
}

function TvReconnectingScreen() {
  // The real app always shows this over the running host stage (HostApp.tsx), never alone —
  // mirror that here, both so the fixture isn't near-empty and so an overlap between the
  // overlay and what's behind it is something this screen can actually catch.
  return (
    <>
      <TvLobbyScreen />
      <TvReconnecting />
    </>
  );
}

/** Every AppCase's `appId`, mapped to the component and fixture props it renders. */
const APP_SCREEN_COMPONENTS = {
  join: JoinScreen,
  "join-worst": JoinWorstScreen,
  "join-not-found": JoinNotFoundScreen,
  "avatar-picker": AvatarPickerScreen,
  "avatar-picker-worst": AvatarPickerWorstScreen,
  lobby: LobbyScreen,
  "lobby-worst": LobbyWorstScreen,
  "vip-controls": VipControlsScreen,
  "vip-controls-worst": VipControlsWorstScreen,
  results: ResultsScreen,
  "results-worst": ResultsWorstScreen,
  "results-worst-no-tv": ResultsWorstNoTvScreen,
  "results-vip-no-tv": ResultsVipNoTvScreen,
  reconnecting: ReconnectingScreen,
  kicked: KickedScreen,
  "kicked-worst": KickedWorstScreen,
  starting: StartingScreen,
  "lobby-away": LobbyAwayScreen,
  "waiting-away": WaitingAwayScreen,
  waiting: WaitingScreen,
  "waiting-worst": WaitingWorstScreen,
  landing: LandingScreen,
  "tv-landing": TvLandingScreen,
  "tv-full-tonight": TvFullTonightScreen,
  "tv-lobby": TvLobbyScreen,
  "tv-lobby-worst": TvLobbyWorstScreen,
  "tv-game-picker": TvGamePickerScreen,
  "tv-final-scores": TvFinalScoresScreen,
  "tv-final-scores-worst": TvFinalScoresWorstScreen,
  "tv-credits": TvCreditsScreen,
  "tv-reconnecting": TvReconnectingScreen,
} satisfies Record<string, () => JSX.Element>;

/** A `Map` rather than the object itself, so a lookup by an arbitrary string needs no cast. */
const APP_SCREEN_BY_ID = new Map(Object.entries(APP_SCREEN_COMPONENTS));

/** Every `appId` `screens.ts`'s `APP_SCREENS` can name — a test holds the two lists in step. */
export const APP_SCREEN_IDS: readonly string[] = [...APP_SCREEN_BY_ID.keys()];

export function appScreenById(appId: string): (() => JSX.Element) | null {
  return APP_SCREEN_BY_ID.get(appId) ?? null;
}
