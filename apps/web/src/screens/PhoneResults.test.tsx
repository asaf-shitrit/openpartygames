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
  makeResult,
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
  it("tells the VIP they ended it, with their own score, and no standings on a shared screen", () => {
    // vipId defaults to p1 (see fixtures/room.ts), and this view is p1 — the VIP reading their
    // own early end.
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
    expect(screen.getByText("You ended the game early")).toBeTruthy();
    expect(screen.getByText("6 points")).toBeTruthy();
    // Shared screen (the view's default): no standings table duplicated on the phone.
    expect(screen.queryByText("Final scores")).toBeNull();
  });

  it("names the VIP for everyone else, and shows the standings with no shared screen", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p2",
          vipId: "p1",
          players: [PRIYA, SAM],
          lastResult: makeEndedEarlyResult(),
          sharedScreen: false,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("Priya ended the game early")).toBeTruthy();
    expect(screen.getByText("2 points")).toBeTruthy();
    expect(screen.getByText("Final scores")).toBeTruthy();
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(
      screen.getByText("Waiting on Priya to pick the next game"),
    ).toBeTruthy();
  });

  it("gives no crown and no award ceremony, even with awards and a winner on the wire", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p2",
          vipId: "p1",
          players: [PRIYA, SAM],
          sharedScreen: false,
          lastResult: makeEndedEarlyResult({
            winnerIds: ["p2"],
            awards: [{ id: "word-thief", playerIds: ["p2"], value: 2 }],
          }),
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("Priya ended the game early")).toBeTruthy();
    expect(screen.queryByText("You win the crown!")).toBeNull();
    expect(screen.queryByText("Word thief")).toBeNull();
  });

  it("does not buzz the ceremony for a game that ended early", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    // p2 is 2nd, so the rank beat would buzz "good" if the ceremony ran.
    const { advanceTo } = setup(makeEndedEarlyResult(), "p2", 0);

    advanceTo(20_000);

    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByText("Priya ended the game early")).toBeTruthy();
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

describe("PhoneResults, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("shows the settled rank card in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
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
    expect(screen.getByText("סיימתם במקום הראשון עם 12")).toBeTruthy();
  });
});

describe("PhoneResults, a player who never played", () => {
  it("gets a plain final-scores card, not a bogus last-place rank", () => {
    // The scores are keyed p1/p2/p3 only; p4 joined the room but never played this round.
    const P4 = makePlayer({ id: "p4", name: "Newcomer", avatar: "toast" });
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p4",
          players: [PRIYA, SAM, LEE, P4],
          lastResult: makeOldSaveResult(),
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("Final scores")).toBeTruthy();
    expect(screen.queryByText(/You finished/)).toBeNull();
  });

  it("does not inflate rankedCount for the 3rd/2nd beats with a bystander", () => {
    // Only p1 and p2 played; a bystander (p4) must not make the timeline think there is a
    // 3rd place to reveal.
    const P4 = makePlayer({ id: "p4", name: "Newcomer", avatar: "toast" });
    vi.useFakeTimers();
    const { advanceTo } = setup(
      makeResultWithAwards({
        scores: { p1: 10, p2: 30 },
        winnerIds: ["p2"],
        awards: [],
      }),
      "p1",
      0,
      { players: [PRIYA, SAM, LEE, P4] },
    );
    advanceTo(14100);
    expect(screen.queryByText("3rd place!")).toBeNull();
  });
});

describe("PhoneResults, no shared screen at the settled card", () => {
  const NAME_LENGTH = 12;
  const eightPlayers = Array.from({ length: 8 }, (_, i) =>
    makePlayer({
      id: `p${i + 1}`,
      name: `Player${i + 1}`.padEnd(NAME_LENGTH, "Z").slice(0, NAME_LENGTH),
      avatar: "drop",
    }),
  );
  // Tied for first, so the standings list carries a real tie, and the reader (p1) holds
  // every award so the sticker row is exercised too.
  const worstCaseResult = makeResult({
    finishedAt: 0,
    scores: {
      p1: 50,
      p2: 50,
      p3: 40,
      p4: 35,
      p5: 30,
      p6: 25,
      p7: 20,
      p8: 15,
    },
    winnerIds: ["p1", "p2"],
    awards: [
      { id: "word-thief", playerIds: ["p1"], value: 2 },
      { id: "master-of-disguise", playerIds: ["p1"], value: 1 },
      { id: "sharpest-eye", playerIds: ["p1"], value: 3 },
    ],
  });

  it("carries the full standings and every award pill, not just one", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          vipId: "p2",
          sharedScreen: false,
          players: eightPlayers,
          lastResult: worstCaseResult,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("You finished 1st with 50")).toBeTruthy();
    expect(screen.getByText("Word thief")).toBeTruthy();
    expect(screen.getByText("Master of disguise")).toBeTruthy();
    expect(screen.getByText("Sharpest eye")).toBeTruthy();
    for (const player of eightPlayers) {
      expect(screen.getByText(player.name)).toBeTruthy();
    }
    expect(
      screen.getByText("Waiting on Player2ZZZZZ to pick the next game"),
    ).toBeTruthy();
  });

  it("says nothing about waiting when the reader is the VIP", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p2",
          vipId: "p2",
          sharedScreen: false,
          players: eightPlayers,
          lastResult: worstCaseResult,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.queryByText(/Waiting on/)).toBeNull();
  });

  it("shows no standings list once a shared screen is carrying them", () => {
    renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          vipId: "p2",
          sharedScreen: true,
          players: eightPlayers,
          lastResult: worstCaseResult,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    expect(screen.getByText("You finished 1st with 50")).toBeTruthy();
    expect(screen.queryByText("Player8ZZZZZ")).toBeNull();
    expect(screen.queryByText(/Waiting on/)).toBeNull();
  });
});

describe("PhoneResults, the footer slot", () => {
  const eightPlayers = Array.from({ length: 8 }, (_, i) =>
    makePlayer({ id: `p${i + 1}`, name: `Player ${i + 1}`, avatar: "drop" }),
  );
  const settledResult = makeResult({
    finishedAt: 0,
    scores: { p1: 80, p2: 70, p3: 60, p4: 50, p5: 40, p6: 30, p7: 20, p8: 10 },
    winnerIds: ["p1"],
  });

  function renderWithFooter() {
    return renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          vipId: "p1",
          sharedScreen: false,
          players: eightPlayers,
          lastResult: settledResult,
        })}
        clock={{ now: () => FINISHED_AT }}
        footer={<button type="button">Next round</button>}
      />,
    );
  }

  it("renders the footer inside the phone column, after the standings", () => {
    const { container } = renderWithFooter();
    const column = container.querySelector(".opg-grid-phone");
    const footer = screen.getByRole("button", { name: "Next round" });
    // The whole point of the slot: the footer is a child of the same scrolling column the
    // standings live in, and the last one — so the list ends above it instead of under it.
    // A bar rendered beside this screen could only sit on top of it, because the column is
    // a `PhoneScreen fit` and owns the full viewport height.
    expect(column?.contains(footer)).toBe(true);
    expect(column?.lastElementChild).toBe(footer);
  });

  it("leaves the column ending in the standings when no footer is given", () => {
    const { container } = renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you: "p1",
          vipId: "p2",
          sharedScreen: false,
          players: eightPlayers,
          lastResult: settledResult,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
    const column = container.querySelector(".opg-grid-phone");
    expect(column?.children).toHaveLength(1);
    expect(screen.getByText("Player 8")).toBeTruthy();
  });
});

describe("PhoneResults, standings rows", () => {
  const threePlayers = [PRIYA, SAM, LEE];
  const settledResult = makeResult({
    finishedAt: 0,
    scores: { p1: 30, p2: 20, p3: 10 },
    winnerIds: ["p1"],
  });

  function renderStandings(players = threePlayers, you = "p1") {
    return renderLocalized(
      <PhoneResults
        view={makePlayerView({
          you,
          vipId: you,
          sharedScreen: false,
          players,
          lastResult: settledResult,
        })}
        clock={{ now: () => FINISHED_AT }}
      />,
    );
  }

  it("marks first place in the crown's red and every other rank in ink", () => {
    renderStandings();
    const first = screen.getByText("1");
    const second = screen.getByText("2");
    expect(first.getAttribute("style")).toContain("color: var(--opg-marker)");
    expect(second.getAttribute("style")).toContain("color: var(--opg-ink)");
  });

  it("lists nobody who has no score of their own", () => {
    // p4 walked in after the game started: a seat on the roster, nothing in the result. A
    // scoreboard is the one place they should not appear — not even on 0, which they did
    // not play for.
    const P4 = makePlayer({ id: "p4", name: "Newcomer", avatar: "toast" });
    renderStandings([...threePlayers, P4]);
    expect(screen.getByText("Lee")).toBeTruthy();
    expect(screen.queryByText("Newcomer")).toBeNull();
  });

  it("reads down the card in rank order, whatever order the roster arrives in", () => {
    const { container } = renderStandings([LEE, SAM, PRIYA]);
    const ranks = [...container.querySelectorAll(".opg-marker")]
      .map((el) => el.textContent)
      .filter((text) => text === "1" || text === "2" || text === "3");
    expect(ranks).toEqual(["1", "2", "3"]);
  });
});

describe("PhoneResults, Eyes on the TV doodle", () => {
  it("swaps the screen doodle for the room doodle with no shared screen", () => {
    vi.useFakeTimers();
    const withTv = setup(makeResultWithAwards(), "p1", 0);
    const tvCircles = withTv.rendered.container.querySelectorAll("circle").length;

    cleanup();

    const noTv = setup(makeResultWithAwards(), "p1", 0, { sharedScreen: false });
    const roomCircles = noTv.rendered.container.querySelectorAll("circle").length;

    // The screen doodle draws 2 eyes; the room doodle draws the same 2 eyes plus a 3-face huddle.
    expect(tvCircles).toBe(2);
    expect(roomCircles).toBe(5);
  });
});
