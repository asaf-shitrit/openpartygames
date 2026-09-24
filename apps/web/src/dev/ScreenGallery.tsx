// /dev/screens — one game screen at real size, picked with ?id=<game>/<index>.
//
// The layout suite drives this route, so it renders the screen and nothing else: no picker
// chrome around the screen under test, and a clock frozen at the phase start, so a
// measurement can never race a ticking timer. Without an id it lists what is there.
import { useEffect } from "react";
import { Stage } from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { gameUiFor } from "../games";
import { SCREENS, screenById, screenIdFromSearch, timingOf } from "./screens";
import type { HostCase, PhoneCase, ScreenCase } from "./screens";

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

function ScreenView({ screen }: { screen: ScreenCase }) {
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
function useScreenReady(id: string | null): void {
  useEffect(() => {
    if (id !== null) document.body.dataset.screen = id;
    return () => {
      delete document.body.dataset.screen;
    };
  }, [id]);
}

export function ScreenGallery({ search }: { search?: string }) {
  const id = screenIdFromSearch(search ?? window.location.search);
  useScreenReady(id);
  if (id === null) return <ScreenIndex />;
  const screen = screenById(id);
  if (screen === null) return <Missing text={`No screen with id ${id}`} />;
  return <ScreenView screen={screen} />;
}
