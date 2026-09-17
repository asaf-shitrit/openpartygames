// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { MltHostView, MltPlayerView } from "../state";
import { Host } from "./Host";
import { mostLikelyToPreviews } from "./preview";

afterEach(cleanup);

function findPreview(label: string) {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(
  view: MltHostView | MltPlayerView,
): view is MltHostView {
  return "votedIds" in view;
}

function hostSample(label: string) {
  const preview = findPreview(label);
  const { room, view } = preview;
  if (!isHostView(view)) throw new Error(`${label} is not a host view`);
  if (room.role !== "host") throw new Error(`${label} is not a host room`);
  return { view, room };
}

function renderHost(label: string) {
  const { view, room } = hostSample(label);
  const clock: ServerClock = { now: () => room.serverNow };
  return render(
    <Host
      view={view}
      room={room}
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
    />,
  );
}

describe("Host vote phase", () => {
  it("shows the prompt", () => {
    const { container } = renderHost("Host: vote");
    expect(screen.getByText("forget their own birthday party")).toBeTruthy();
    expect(container.textContent).toContain(
      "Who's most likely to forget their own birthday party?",
    );
  });

  it("counts how many players voted", () => {
    renderHost("Host: vote");
    expect(screen.getByText("4 of 6 voted")).toBeTruthy();
  });

  it("shows Voted and Thinking… labels, never who anyone voted for", () => {
    renderHost("Host: vote");
    expect(screen.getAllByText("Voted")).toHaveLength(4);
    expect(screen.getAllByText("Thinking…")).toHaveLength(2);
    expect(screen.queryByText(/voted for/i)).toBeNull();
  });

  it("shows the footer hint", () => {
    renderHost("Host: vote");
    expect(screen.getByText("Vote for anyone, even yourself")).toBeTruthy();
  });
});

describe("Host reveal phase", () => {
  it("renders HostReveal", () => {
    renderHost("Host: reveal picked");
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("Host chrome", () => {
  it("shows the round progress in the header", () => {
    renderHost("Host: vote");
    expect(screen.getByText("Prompt 7 of 20")).toBeTruthy();
  });
});
