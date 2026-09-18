// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { ImposterHostView, ImposterPlayerView } from "../../state";
import { imposterPreviews } from "../preview";
import { StageLastChance } from "./LastChance";

afterEach(cleanup);

function isHostView(
  view: ImposterHostView | ImposterPlayerView,
): view is ImposterHostView {
  return "votedIds" in view;
}

function hostSample(label: string) {
  const preview = imposterPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "host") throw new Error(`${label} is not a host`);
  if (!isHostView(preview.view)) throw new Error(`${label} is not a host view`);
  return { view: preview.view, room: preview.room };
}

describe("StageLastChance", () => {
  it("shows one blank tile per guessLength and never the letters", () => {
    const { view, room } = hostSample("Host: last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <StageLastChance
        view={view}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />,
    );
    const figure = screen.getByRole("figure");
    expect(figure.children).toHaveLength(view.guessLength ?? 0);
    for (const tile of Array.from(figure.children)) {
      expect(tile.textContent).toBe("");
    }
  });

  it("names the caught player and the steal amount", () => {
    const { view, room } = hostSample("Host: last chance");
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <StageLastChance
        view={view}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />,
    );
    expect(screen.getByText("Priya got caught!")).toBeTruthy();
    expect(screen.getByText(/steals 1,000 points\./)).toBeTruthy();
  });
});
