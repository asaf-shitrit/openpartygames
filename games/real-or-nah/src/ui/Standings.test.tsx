// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import { LocaleProvider } from "@opg/i18n";
import {
  previousTotal,
  rankBadge,
  standingsOrder,
  Standings,
} from "./Standings";

afterEach(cleanup);

const MAYA = "maya";
const DOV = "dov";
const SAM = "sam";

const TOTALS = { [MAYA]: 2000, [DOV]: 1500, [SAM]: 500 };
const POINTS_THIS_FACT = { [MAYA]: 1000, [DOV]: 500, [SAM]: 0 };

function player(id: string, name: string): PlayerSummary {
  return {
    id,
    name,
    avatar: "star",
    connected: true,
    isVip: false,
    crowns: 0,
    waitingForNextGame: false,
  };
}

const PLAYERS: PlayerSummary[] = [
  player(MAYA, "Maya"),
  player(DOV, "Dov"),
  player(SAM, "Sam"),
];

describe("previousTotal", () => {
  it("subtracts this fact's points from the running total", () => {
    expect(previousTotal(TOTALS, POINTS_THIS_FACT, MAYA)).toBe(1000);
    expect(previousTotal(TOTALS, POINTS_THIS_FACT, SAM)).toBe(500);
  });

  it("defaults missing entries to 0", () => {
    expect(previousTotal({}, {}, MAYA)).toBe(0);
  });
});

describe("standingsOrder", () => {
  const ids = [SAM, DOV, MAYA];

  it("orders by previous totals before the reorder beat", () => {
    // previous: sam 500, dov 1000, maya 1000 -> tie broken by descending sort stability
    expect(standingsOrder(ids, TOTALS, POINTS_THIS_FACT, false)).toEqual([
      DOV,
      MAYA,
      SAM,
    ]);
  });

  it("orders by new totals after the reorder beat", () => {
    expect(standingsOrder(ids, TOTALS, POINTS_THIS_FACT, true)).toEqual([
      MAYA,
      DOV,
      SAM,
    ]);
  });
});

describe("rankBadge", () => {
  it("shows an up arrow for a positive change", () => {
    expect(rankBadge(2)).toBe("▲2");
  });

  it("shows a down arrow for a negative change", () => {
    expect(rankBadge(-1)).toBe("▼1");
  });

  it("shows nothing for an unchanged rank", () => {
    expect(rankBadge(0)).toBeNull();
  });
});

describe("Standings", () => {
  const playerIds = [SAM, DOV, MAYA];

  it("renders rows in the previous order before the reorder beat", () => {
    render(
      <LocaleProvider>
        <Standings
          players={PLAYERS}
          playerIds={playerIds}
          totals={TOTALS}
          pointsThisFact={POINTS_THIS_FACT}
          countReached={false}
          countLive={false}
          reorderReached={false}
        />
      </LocaleProvider>,
    );
    const names = screen.getAllByText(/Dov|Maya|Sam/).map((el) => el.textContent);
    expect(names).toEqual(["Dov", "Maya", "Sam"]);
  });

  it("shows the count settled (no live count) on a late mount", () => {
    render(
      <LocaleProvider>
        <Standings
          players={PLAYERS}
          playerIds={playerIds}
          totals={TOTALS}
          pointsThisFact={POINTS_THIS_FACT}
          countReached
          countLive={false}
          reorderReached
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("2,000")).toBeTruthy();
    expect(screen.getByText("1,500")).toBeTruthy();
  });

  it("shows a rank badge once the reorder is reached", () => {
    render(
      <LocaleProvider>
        <Standings
          players={PLAYERS}
          playerIds={playerIds}
          totals={TOTALS}
          pointsThisFact={POINTS_THIS_FACT}
          countReached
          countLive={false}
          reorderReached
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("▲1")).toBeTruthy();
  });

  it("labels each avatar in Hebrew when the locale is he", () => {
    window.localStorage.setItem("opg:locale", "he");
    render(
      <LocaleProvider>
        <Standings
          players={PLAYERS}
          playerIds={playerIds}
          totals={TOTALS}
          pointsThisFact={POINTS_THIS_FACT}
          countReached={false}
          countLive={false}
          reorderReached={false}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("הדירוג")).toBeTruthy();
    expect(screen.getByRole("img", { name: "האווטאר של Maya" })).toBeTruthy();
    window.localStorage.removeItem("opg:locale");
  });
});
