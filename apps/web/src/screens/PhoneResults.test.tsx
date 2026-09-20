// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { LocaleProvider } from "@opg/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import {
  makeEndedEarlyResult,
  makeOldSaveResult,
  makePlayer,
  makePlayerView,
  makeResultWithAwards,
  makeTiedResult,
} from "./fixtures/room";
import { PhoneResults } from "./PhoneResults";

/** These screens read their copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const PRIYA = makePlayer({ id: "p1", name: "Priya", avatar: "drop" });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "star" });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });

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

const FINISHED_AT = 1_700_000_000_000;

function setup(
  result: ReturnType<typeof makeResultWithAwards>,
  you: string,
  elapsedMs: number,
  patch: Parameters<typeof makePlayerView>[0] = {},
) {
  let fakeNow = FINISHED_AT + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = FINISHED_AT + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const rendered = renderLocalized(
    <PhoneResults
      view={makePlayerView({
        you,
        players: [PRIYA, SAM, LEE],
        lobbyScreen: "results",
        lastResult: result,
        ...patch,
      })}
      clock={clock}
    />,
  );
  return { advanceTo, rendered };
}

describe("PhoneResults, ceremony from the start", () => {
  it("shows the teaser, then my award", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup(makeResultWithAwards(), "p1", 0);

    expect(screen.getByText("Eyes on the TV")).toBeTruthy();

    advanceTo(2100);
    expect(screen.getByText("Word thief")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([80, 50, 80]);
  });

  it("shows neutral teaser copy with no shared screen", () => {
    vi.useFakeTimers();
    setup(makeResultWithAwards(), "p1", 0, { sharedScreen: false });
    expect(screen.getByText("Almost time")).toBeTruthy();
    expect(screen.queryByText("Eyes on the TV")).toBeNull();
  });

  it("buzzes crown for the winner at the crown beat", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // 3 awards: crown-intro 11000, crown 19000.
    const { advanceTo } = setup(makeResultWithAwards(), "p2", 0);

    advanceTo(19100);
    expect(screen.getByText("You win the crown!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([70, 40, 70, 40, 70, 40, 320]);
  });

  it("tells a non-winner who won and their own rank", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // scores p1:10, p2:30, p3:20 -> p1 is ranked 3rd.
    const { advanceTo } = setup(makeResultWithAwards(), "p1", 0);

    advanceTo(19100);
    expect(screen.getByText("Sam wins the crown!")).toBeTruthy();
    expect(screen.getByText(/You finished/)).toBeTruthy();
    expect(screen.getByText(/You finished/).textContent).toBe(
      "You finished 3rd",
    );
    expect(vibrate).not.toHaveBeenCalledWith([70, 40, 70, 40, 70, 40, 320]);
  });

  it("calls out my own 3rd place moment", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // third is 3000ms after crown-intro (11000), so 14000. p1 is ranked 3rd.
    const { advanceTo } = setup(makeResultWithAwards(), "p1", 0);

    advanceTo(14100);
    expect(screen.getByText("3rd place!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });

  it("calls out my own 2nd place moment", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // second is 5000ms after crown-intro (11000), so 16000. p3 is ranked 2nd.
    const { advanceTo } = setup(makeResultWithAwards(), "p3", 0);

    advanceTo(16100);
    expect(screen.getByText("2nd place!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });
});

describe("PhoneResults, edge cases", () => {
  it("has no rank line for a viewer who isn't in the ranked list", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(makeResultWithAwards(), "p9", 0);
    advanceTo(19100);
    expect(screen.getByText("Sam wins the crown!")).toBeTruthy();
    expect(screen.queryByText(/You finished/)).toBeNull();
  });

  it("falls back to a generic line when nobody won", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(
      makeResultWithAwards({ winnerIds: [] }),
      "p1",
      0,
    );
    advanceTo(19100);
    expect(screen.getByText("The crown is decided")).toBeTruthy();
  });
});

describe("PhoneResults, ties", () => {
  it("names every winner and buzzes crown for each", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // No awards: crown-intro 2000, crown 10000.
    const { advanceTo } = setup(makeTiedResult(), "p2", 0);
    advanceTo(10100);
    expect(screen.getByText("You win the crown!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([70, 40, 70, 40, 70, 40, 320]);
  });
});

describe("PhoneResults, mounted late", () => {
  it("shows the settled rank card with no buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup(makeResultWithAwards(), "p2", 30_000);
    expect(screen.getByText("You finished 1st with 30")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("shows my award stickers on the settled card", () => {
    vi.useFakeTimers();
    setup(makeResultWithAwards(), "p1", 30_000);
    expect(screen.getByText("Word thief")).toBeTruthy();
  });
});

describe("PhoneResults, not completed", () => {
  it("shows Game over with my score", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          players: [PRIYA, SAM],
          lastResult: makeEndedEarlyResult(),
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("Game over")).toBeTruthy();
    expect(screen.getByText("6 points")).toBeTruthy();
  });

  it("does not buzz the ceremony for a game that ended early", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // p2 is 2nd, so the rank beat would buzz "good" if the ceremony ran.
    const { advanceTo } = setup(makeEndedEarlyResult(), "p2", 0);

    advanceTo(20_000);

    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByText("Game over")).toBeTruthy();
  });
});

describe("PhoneResults, an old save", () => {
  it("shows the settled rank card straight away", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          players: [PRIYA, SAM, LEE],
          lastResult: makeOldSaveResult(),
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("You finished 1st with 12")).toBeTruthy();
  });
});
