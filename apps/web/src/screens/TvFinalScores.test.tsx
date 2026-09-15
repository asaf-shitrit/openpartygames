import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeHostView, makePlayer, makeResult } from "./fixtures/room";
import { TvFinalScores } from "./TvFinalScores";

const PRIYA = makePlayer({ id: "p1", name: "Priya", avatar: "drop" });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "star", crowns: 1 });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });

function isBefore(first: Element, second: Element): boolean {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

afterEach(cleanup);

describe("TvFinalScores", () => {
  it("ranks players by their last result score", () => {
    const { container } = render(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM, LEE],
          lobbyScreen: "results",
          lastResult: makeResult({
            scores: { p1: 10, p2: 30, p3: 5 },
            winnerIds: ["p2"],
          }),
        })}
      />,
    );
    expect(screen.getByText("Sam wins the crown!")).toBeTruthy();
    expect(container.textContent).toContain("30 points");
    const top = screen.getByText("30");
    const middle = screen.getByText("10");
    const bottom = screen.getByText("5");
    expect(isBefore(top, middle)).toBe(true);
    expect(isBefore(middle, bottom)).toBe(true);
  });

  it("names every winner when the game ends in a tie", () => {
    render(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM, LEE],
          lastResult: makeResult({
            scores: { p1: 20, p2: 20, p3: 5 },
            winnerIds: ["p1", "p2"],
          }),
        })}
      />,
    );
    expect(screen.getByText("Priya and Sam win the crown!")).toBeTruthy();
  });

  it("falls back to the top player when no winner was recorded", () => {
    render(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM, LEE],
          lastResult: makeResult({ scores: { p1: 12, p2: 4, p3: 7 } }),
        })}
      />,
    );
    expect(screen.getByText("Priya wins the crown!")).toBeTruthy();
  });

  it("renders a neutral winner card when no players are left", () => {
    const { container } = render(
      <TvFinalScores
        view={makeHostView({ players: [], lastResult: makeResult() })}
      />,
    );
    expect(screen.getByText("Someone wins the crown!")).toBeTruthy();
    expect(container.textContent).toContain("0 points");
  });

  it("waits when there is no result yet", () => {
    render(<TvFinalScores view={makeHostView({ lastResult: null })} />);
    expect(screen.getByText("Waiting for final scores")).toBeTruthy();
  });
});
