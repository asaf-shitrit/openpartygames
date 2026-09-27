// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HostRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { RonHostView } from "../types";
import { Host } from "./Host";
import { RON_REVEAL_PREVIEW_START, realOrNahPreviews } from "./preview";

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

/**
 * `now` defaults to the room's own clock, which for a reveal preview lands well past
 * standings (see `RON_REVEAL_PREVIEW_START` in preview.ts) — the truly settled state,
 * where standings have retired the duds/lies/truth stack. Pass an explicit `now` (an
 * offset from `RON_REVEAL_PREVIEW_START`) to catch a reveal mid-flight instead.
 */
function renderHost(label: string, now?: number) {
  const { view, room } = hostSample(label);
  const clock: ServerClock = { now: () => now ?? room.serverNow };
  return render(
    <LocaleProvider>
      <Host
        view={view}
        room={room}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />
    </LocaleProvider>,
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

  it("renders in Hebrew when the locale is he", () => {
    window.localStorage.setItem("opg:locale", "he");
    const { view, room } = hostSample("Host: write");
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <LocaleProvider>
        <Host
          view={view}
          room={room}
          deadline={room.game?.deadline ?? null}
          timerStartedAt={room.game?.timerStartedAt ?? null}
          clock={clock}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("כתבו שקר משכנע בטלפון שלכם")).toBeTruthy();
    expect(screen.getByText("שקרים נכנסים")).toBeTruthy();
    expect(screen.getAllByText("בוצע")).toHaveLength(4);
    window.localStorage.removeItem("opg:locale");
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
  it("stamps the truth REAL and every lie NAH, settled by default (before standings take over)", () => {
    // The preview fixture's own clock now lands just before standings by default — see
    // `revealPreviewNow` in preview.ts — so every distinguishing reveal preview (this one
    // included) stays visibly different from the others instead of all collapsing into the
    // same later standings screen.
    const { view } = hostSample("Host: reveal, 3 foolers");
    renderHost("Host: reveal, 3 foolers");
    expect(screen.getByText("Let's see who fooled who")).toBeTruthy();
    expect(screen.getByText("These fooled nobody")).toBeTruthy();
    expect(screen.getByText("The truth")).toBeTruthy();
    expect(screen.getByText("REAL")).toBeTruthy();
    expect(screen.getAllByText("NAH")).toHaveLength(
      view.reveal?.lies.length ?? 0,
    );
    expect(screen.getByText("+1,000 each")).toBeTruthy();
    expect(screen.queryByText("Standings")).toBeNull();
  });

  it("swaps to standings once they land, retiring the lies and the truth", () => {
    renderHost("Host: reveal, 3 foolers", RON_REVEAL_PREVIEW_START + 21999);
    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.queryByText("Let's see who fooled who")).toBeNull();
    expect(screen.queryByText("The truth")).toBeNull();
  });

  it("labels a house lie instead of a player name", () => {
    // Past every lie's flip beat but before standings; see reveal-plan.ts for the
    // per-lie segment math (4 foolers here, so a wider lie budget than the 3-fooler
    // fixture above).
    renderHost("Host: reveal with a house lie", RON_REVEAL_PREVIEW_START + 16500);
    expect(screen.getByText("House lie")).toBeTruthy();
    expect(screen.getByText("a surprisingly large lizard")).toBeTruthy();
    expect(screen.getAllByText("NAH")).toHaveLength(7);
  });

  it("wraps the phase in the enter animation and swaps content on a phase change", () => {
    const first = hostSample("Host: vote");
    const second = hostSample("Host: reveal, 3 foolers");
    const voteClock: ServerClock = { now: () => first.room.serverNow };
    const { container, rerender } = render(
      <LocaleProvider>
        <Host
          view={first.view}
          room={first.room}
          deadline={null}
          timerStartedAt={null}
          clock={voteClock}
        />
      </LocaleProvider>,
    );
    const wrapper = container.querySelector(".opg-phase-enter");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain("Which one is real?");

    // Mid-reveal, so the truth section is on stage rather than standings.
    const revealClock: ServerClock = { now: () => RON_REVEAL_PREVIEW_START + 17000 };
    rerender(
      <LocaleProvider>
        <Host
          view={second.view}
          room={second.room}
          deadline={second.room.game?.deadline ?? null}
          timerStartedAt={second.room.game?.timerStartedAt ?? null}
          clock={revealClock}
        />
      </LocaleProvider>,
    );
    const next = container.querySelector(".opg-phase-enter");
    expect(next).toBeTruthy();
    expect(next?.textContent).toContain("The truth");
  });
});
