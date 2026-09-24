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
import { PhoneResults } from "../screens/PhoneResults";
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
): ReturnType<typeof makePlayer>[] {
  return STRESS_NAMES.map((name, index) =>
    makePlayer({
      id: `stress-${index}`,
      name,
      avatar: STRESS_AVATARS[index] ?? "star",
      crowns: index % 3,
      isVip: index === vipIndex,
      waitingForNextGame: waiting(index),
    }),
  );
}

/** Every game the landing page shows, as the room-view shape the lobby/picker expect. */
const ALL_GAMES: GameSummary[] = LANDING_GAMES.map((game) =>
  makeGame({
    id: game.id,
    name: game.name,
    blurb: game.blurb,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    minutes: game.minutes,
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
    selectedGameId: "doodle-bluff",
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
// caught within its 600ms live-entry grace window. This is the heaviest thing the screen
// ever draws (a sticker burst under reduced motion), so it's also the fairest worst case.
const CROWN_LIVE_ELAPSED_MS = 11_000 + 8_000 + 200;

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

function ResultsWorstScreen() {
  const players = stressPlayers();
  const result = makeTiedResult({
    finishedAt: SERVER_NOW,
    scores: Object.fromEntries(players.map((player, index) => [player.id, 100 - index])),
    winnerIds: ["stress-0", "stress-1"],
    awards: [
      { id: "word-thief", playerIds: ["stress-2"], value: 4 },
      { id: "master-of-disguise", playerIds: ["stress-3"], value: 2 },
      { id: "sharpest-eye", playerIds: ["stress-4"], value: 5 },
    ],
  });
  // "You" are one of the tied winners, so the crown moment draws its confetti burst too.
  const view = makePlayerView({ you: "stress-0", players, lastResult: result });
  return <PhoneResults view={view} clock={clockAt(SERVER_NOW + CROWN_LIVE_ELAPSED_MS)} />;
}

// ---------- phone: reconnecting / kicked / waiting / landing ----------

function ReconnectingScreen() {
  return <PhoneReconnecting name="Priya" avatar="drop" onReload={ignore} />;
}

function KickedScreen() {
  return <PhoneKicked name="the VIP" avatar="drop" />;
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
    scores: Object.fromEntries(players.map((player, index) => [player.id, 100 - index])),
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
  "avatar-picker": AvatarPickerScreen,
  "avatar-picker-worst": AvatarPickerWorstScreen,
  lobby: LobbyScreen,
  "lobby-worst": LobbyWorstScreen,
  "vip-controls": VipControlsScreen,
  "vip-controls-worst": VipControlsWorstScreen,
  results: ResultsScreen,
  "results-worst": ResultsWorstScreen,
  reconnecting: ReconnectingScreen,
  kicked: KickedScreen,
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
