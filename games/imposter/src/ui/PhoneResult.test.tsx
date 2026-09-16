// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PlayerRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import type { ImposterAction, ImposterPlayerView } from "../state";
import { PhoneResult } from "./PhoneResult";
import { imposterPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

interface PhoneSample {
  view: ImposterPlayerView;
  room: PlayerRoomView;
}

function phoneSample(label: string): PhoneSample {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "player") throw new Error(`${label} is not a phone`);
  if (!("myVote" in preview.view)) {
    throw new Error(`${label} is not a player view`);
  }
  return { view: preview.view, room: preview.room };
}

const priyaStole = phoneSample("Phone: Priya result").view;
const dovSpotted = phoneSample("Phone: Dov result").view;
const priyaEscaped: ImposterPlayerView = {
  ...priyaStole,
  caught: false,
  guess: null,
  guessCorrect: null,
};
const dovEscaped: ImposterPlayerView = {
  ...dovSpotted,
  caught: false,
  guess: null,
  guessCorrect: null,
  myPoints: 0,
};

/** Mounts PhoneResult as if `elapsedMs` had passed since the result phase started. */
function setup(view: ImposterPlayerView, elapsedMs: number) {
  const { room } = phoneSample("Phone: Priya result");
  let fakeNow = elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    while (fakeNow < targetMs) {
      const step = Math.min(400, targetMs - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const me = room.players.find((player) => player.id === room.you) ?? null;
  const rendered = render(
    <PhoneResult
      view={view}
      players={room.players}
      me={me}
      deadline={null}
      timerStartedAt={0}
      clock={clock}
      send={vi.fn<(action: ImposterAction) => void>()}
      progress="Word 3 of 6"
    />,
  );
  return { advanceTo, rendered };
}

describe("PhoneResult, caught path", () => {
  it("teases the imposter's own guess, then lands the steal with a buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup(priyaStole, 0);

    expect(screen.getByText("Your guess is in…")).toBeTruthy();

    advanceTo(3900);
    expect(screen.getByText("You stole the word!")).toBeTruthy();
    expect(screen.getByText("+1,000 for you.")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });

  it("names the guesser to a crew member and lands their spotting bonus", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup(dovSpotted, 0);

    expect(screen.getByText("Priya guessed…")).toBeTruthy();

    advanceTo(3900);
    expect(screen.getByText("Nice spotting!")).toBeTruthy();
    expect(screen.getByText("+500 for you.")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });

  it("shows the running total once the count beat is reached", () => {
    vi.useFakeTimers();
    stubVibrate();
    const { advanceTo, rendered } = setup(dovSpotted, 0);
    advanceTo(7100);
    expect(rendered.getByText("Your total")).toBeTruthy();
  });
});

describe("PhoneResult, escaped path", () => {
  it("teases the escape before the personal beat, with no 'guessed nothing' copy", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup(priyaEscaped, 0);
    expect(screen.getByText("The imposter got away…")).toBeTruthy();
    expect(screen.queryByText(/guessed nothing/i)).toBeNull();
  });

  it("lands the imposter's escape with a buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup(priyaEscaped, 0);
    advanceTo(1400);
    expect(screen.getByText("You slipped away!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });

  it("tells a crew member the imposter got away, with no celebration", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup(dovEscaped, 0);
    advanceTo(1400);
    expect(screen.getByText("The imposter got away")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([120]);
    expect(screen.queryByText(/guessed nothing/i)).toBeNull();
  });
});

describe("PhoneResult, mounted late", () => {
  it("shows the result with no buzz and no confetti canvas", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { rendered } = setup(priyaStole, 11000);
    expect(screen.getByText("You stole the word!")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
    expect(rendered.container.querySelector("canvas")).toBeNull();
  });
});
