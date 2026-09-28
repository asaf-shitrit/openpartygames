// /dev/screens — one game screen at real size, picked with ?id=<game>/<index>.
//
// The layout suite drives this route, so it renders the screen and nothing else: no picker
// chrome around the screen under test, and a clock frozen at the phase start, so a
// measurement can never race a ticking timer. Without an id it lists what is there.
import { useEffect } from "react";
import { Stage } from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { GAME_LOADING_ATTRIBUTE, gameUiFor, preloadGameUi } from "../games";
import { appScreenById } from "./app-screens";
import { SCREENS, screenById, screenIdFromSearch, timingOf } from "./screens";
import type { AppCase, HostCase, PhoneCase, ScreenCase } from "./screens";

/** A game's screens, as the registry hands them over. */
type RegisteredUi = NonNullable<ReturnType<typeof gameUiFor>>;

/** Frozen at the moment the phase started, so every render of a screen is identical. */
function clockFor(anchor: number): ServerClock {
  return { now: () => anchor };
}

function ignoreAction(): void {
  // The gallery renders screens; nothing it does reaches a room.
}

function Missing({ text }: { text: string }) {
  return (
    <output data-testid="screen-missing" style={{ display: "block", padding: 24, fontSize: 18 }}>
      {text}
    </output>
  );
}

function ScreenIndex() {
  return (
    <ul data-testid="screen-index" style={{ padding: 24, fontSize: 16 }}>
      {SCREENS.map((screen) => (
        <li key={screen.id}>
          <a href={`/dev/screens?id=${encodeURIComponent(screen.id)}`}>
            {screen.id} — {screen.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function HostScreen({ screen, Ui }: { screen: HostCase; Ui: RegisteredUi }) {
  const timing = timingOf(screen.room);
  return (
    <Stage>
      <Ui.Host
        view={screen.view}
        room={screen.room}
        deadline={timing.deadline}
        timerStartedAt={timing.timerStartedAt}
        clock={clockFor(timing.anchor)}
      />
    </Stage>
  );
}

function PhoneScreenCase({ screen, Ui }: { screen: PhoneCase; Ui: RegisteredUi }) {
  const timing = timingOf(screen.room);
  return (
    <Ui.Phone
      view={screen.view}
      room={screen.room}
      deadline={timing.deadline}
      timerStartedAt={timing.timerStartedAt}
      clock={clockFor(timing.anchor)}
      send={ignoreAction}
      stage={timing.stage}
    />
  );
}

/** Exported for its own test: the branch a real registry entry can never reach otherwise. */
export function AppScreenView({ screen }: { screen: AppCase }) {
  const render = appScreenById(screen.appId);
  if (render === null) return <Missing text={`No app screen registered for ${screen.appId}`} />;
  if (screen.surface === "host") return <Stage>{render()}</Stage>;
  return render();
}

function ScreenView({ screen }: { screen: ScreenCase }) {
  if (screen.kind === "app") return <AppScreenView screen={screen} />;
  const Ui = gameUiFor(screen.gameId);
  if (Ui === null) return <Missing text={`No UI registered for ${screen.gameId}`} />;
  if (screen.surface === "host") return <HostScreen screen={screen} Ui={Ui} />;
  return <PhoneScreenCase screen={screen} Ui={Ui} />;
}

/**
 * Marks the body once the screen is mounted. The route is lazy-loaded, so without a signal a
 * measurement can land on a blank page — and a blank page violates nothing, which would make
 * the layout suite pass by measuring nothing at all.
 */
function useScreenReady(id: string | null, gameId: string | null): void {
  useEffect(() => {
    if (id === null) return undefined;
    let cancelled = false;
    // A game's Host and Phone load on demand and show "Updating the game…" until they arrive.
    // That fallback has text, so it would pass the suite's liveness check: hold the signal
    // until the screens are in, or the suite measures the fallback and calls it a screen.
    void (async () => {
      await screensLoaded(gameId);
      if (!cancelled) document.body.dataset.screen = id;
    })();
    return () => {
      cancelled = true;
      delete document.body.dataset.screen;
    };
  }, [id, gameId]);
}

/** Resolves once the game's screens are loaded and painted; at once for app-owned screens. */
function screensLoaded(gameId: string | null): Promise<void> {
  if (gameId === null || gameUiFor(gameId) === null) return Promise.resolve();
  return preloadGameUi(gameId).then(loadingMessageGone);
}

/** Polls each frame until React has swapped the loading message for the real screen. */
function loadingMessageGone(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (document.querySelector(`[${GAME_LOADING_ATTRIBUTE}]`) === null) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

export function ScreenGallery({ search }: { search?: string }) {
  const id = screenIdFromSearch(search ?? window.location.search);
  const screen = id === null ? null : screenById(id);
  useScreenReady(id, screen?.gameId ?? null);
  if (id === null) return <ScreenIndex />;
  if (screen === null) return <Missing text={`No screen with id ${id}`} />;
  return <ScreenView screen={screen} />;
}
