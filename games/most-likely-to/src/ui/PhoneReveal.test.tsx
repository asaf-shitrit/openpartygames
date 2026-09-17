// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { PhoneReveal } from "./PhoneReveal";
import { mostLikelyToPreviews, REVEAL_PREVIEW_START } from "./preview";

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

function phoneSample(label: string) {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "player") {
    throw new Error(`${label} is not a phone`);
  }
  if (!("myVote" in preview.view)) {
    throw new Error(`${label} is not a player view`);
  }
  return { view: preview.view, room: preview.room };
}

/** Mounts the phone reveal as if `elapsedMs` had passed since it started. */
function setup(label: string, elapsedMs: number) {
  const { view, room } = phoneSample(label);
  let fakeNow = REVEAL_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = REVEAL_PREVIEW_START + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const me = room.players.find((player) => player.id === room.you) ?? null;
  const rendered = render(
    <PhoneReveal
      view={view}
      players={room.players}
      me={me}
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
    />,
  );
  return { advanceTo, rendered };
}

describe("PhoneReveal, staged from the start", () => {
  it("shows the teaser before 8200ms, then the result card after", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Phone: Maya reveal matched", 0);

    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
    expect(screen.getByText("The votes are in…")).toBeTruthy();
    expect(screen.queryByText("You read the room!")).toBeNull();

    advanceTo(5600);
    expect(screen.getByText("Here it comes…")).toBeTruthy();

    advanceTo(8100);
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();

    advanceTo(8400);
    expect(screen.getByText("You read the room!")).toBeTruthy();
    expect(vibrate).toHaveBeenCalled();
  });

  it("buzzes on the live personal beat", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Phone: Maya reveal matched", 0);
    advanceTo(8400);
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });
});

describe("PhoneReveal, mounted late", () => {
  it("shows the result with no buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Phone: Maya reveal matched", 11200);
    expect(screen.getByText("You read the room!")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("PhoneReveal, card copy", () => {
  it("matched: the vote matched the top pick", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Maya reveal matched", 11200);
    expect(screen.getByText("You read the room!")).toBeTruthy();
    expect(screen.getByText("+500. It's Dov.")).toBeTruthy();
    expect(screen.getByText("2,000 total")).toBeTruthy();
  });

  it("missed: the vote went elsewhere", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Leo reveal missed", 11200);
    expect(screen.getByText("The room picked Dov")).toBeTruthy();
    expect(screen.getByText("Your vote went another way.")).toBeTruthy();
  });

  it("picked: the viewer is the pick", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Dov reveal picked", 11200);
    expect(screen.getByText("The room picked you!")).toBeTruthy();
    expect(screen.getByText("Time to explain yourself.")).toBeTruthy();
  });

  it("tie: the viewer is in the tie", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Priya reveal tie", 11200);
    expect(screen.getByText("You're in the tie!")).toBeTruthy();
    expect(screen.getByText("Explain yourself.")).toBeTruthy();
  });

  it("split: nobody reached the threshold", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Sam reveal split", 11200);
    expect(screen.getByText("No clear pick")).toBeTruthy();
    expect(
      screen.getByText("Nobody got 2 votes. No points this time."),
    ).toBeTruthy();
  });

  it("sat out: the viewer never voted", () => {
    vi.useFakeTimers();
    stubVibrate();
    setup("Phone: Noa reveal sat out", 11200);
    expect(screen.getByText("You sat this one out")).toBeTruthy();
    expect(screen.getByText("Vote next round to score.")).toBeTruthy();
  });
});
