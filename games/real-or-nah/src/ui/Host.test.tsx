// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HostRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import type { RonHostView } from "../types";
import { Host } from "./Host";
import { realOrNahPreviews } from "./preview";

afterEach(cleanup);

interface HostSample {
  label: string;
  surface: "host";
  view: RonHostView;
  room: HostRoomView;
}

/** The preview table pairs surface "host" with host views and host rooms. */
function hostSample(label: string): HostSample {
  const entry = realOrNahPreviews.find(
    (p): p is HostSample => p.label === label && p.surface === "host",
  );
  if (entry === undefined) throw new Error(`no host preview ${label}`);
  return entry;
}

function renderHost(label: string) {
  const { view, room } = hostSample(label);
  const clock: ServerClock = { now: () => room.serverNow };
  return render(
    <Host
      view={view}
      room={room}
      deadline={room.game?.deadline ?? null}
      clock={clock}
    />,
  );
}

describe("Host write phase", () => {
  it("shows the prompt with its blank and who is done writing", () => {
    const { container } = renderHost("Host: write");
    expect(screen.getByText(/went to war against/)).toBeTruthy();
    expect(screen.getByText(/and lost\./)).toBeTruthy();
    expect(container.querySelector('path[d^="M6 18c56-7"]')).toBeTruthy();
    expect(screen.getByText("4 of 6")).toBeTruthy();
    expect(screen.getAllByText("Done")).toHaveLength(4);
    expect(screen.getAllByText("Writing…")).toHaveLength(2);
    expect(screen.getByText("Maya")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("Lies in")).toBeTruthy();
  });
});

describe("Host vote phase", () => {
  it("shows every option and how many players have voted", () => {
    const { view } = hostSample("Host: vote");
    renderHost("Host: vote");
    for (const option of view.options ?? [])
      expect(screen.getByText(option.text)).toBeTruthy();
    expect(screen.getByText("4 of 6 voted")).toBeTruthy();
    expect(screen.getByText("Which one is real?")).toBeTruthy();
  });
});

describe("Host reveal phase", () => {
  it("stamps the truth REAL and every lie NAH", () => {
    const { view } = hostSample("Host: reveal");
    renderHost("Host: reveal");
    expect(screen.getByText("The truth")).toBeTruthy();
    expect(screen.getByText("REAL")).toBeTruthy();
    expect(screen.getAllByText("NAH")).toHaveLength(
      view.reveal?.lies.length ?? 0,
    );
    expect(screen.getByText("The lies")).toBeTruthy();
    expect(screen.getAllByText("Fooled nobody")).toHaveLength(3);
    expect(screen.getByText("Found by")).toBeTruthy();
    expect(screen.getByText("+1,000 each")).toBeTruthy();
  });

  it("labels a house lie instead of a player name", () => {
    renderHost("Host: reveal with a house lie");
    expect(screen.getByText("House lie")).toBeTruthy();
    expect(screen.getByText("a surprisingly large lizard")).toBeTruthy();
    expect(screen.getAllByText("NAH")).toHaveLength(7);
  });

  it("wraps the phase in the enter animation and swaps content on a phase change", () => {
    const first = hostSample("Host: vote");
    const second = hostSample("Host: reveal");
    const clock: ServerClock = { now: () => first.room.serverNow };
    const { container, rerender } = render(
      <Host
        view={first.view}
        room={first.room}
        deadline={null}
        clock={clock}
      />,
    );
    const wrapper = container.querySelector(".opg-phase-enter");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain("Which one is real?");

    rerender(
      <Host
        view={second.view}
        room={second.room}
        deadline={null}
        clock={clock}
      />,
    );
    const next = container.querySelector(".opg-phase-enter");
    expect(next).toBeTruthy();
    expect(next?.textContent).toContain("The truth");
  });
});
