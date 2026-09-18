// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import type { ImposterHostView, ImposterPlayerView } from "../state";
import { Host } from "./Host";
import { imposterPreviews } from "./preview";

afterEach(cleanup);

function findPreview(label: string) {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(
  view: ImposterHostView | ImposterPlayerView,
): view is ImposterHostView {
  return "votedIds" in view;
}

function hostSample(label: string) {
  const preview = findPreview(label);
  const room = preview.room;
  const view = preview.view;
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

describe("Host phases", () => {
  it("word-check shows the phones prompt and the clue order", () => {
    renderHost("Host: check your phones");
    expect(screen.getByText("Check your phones!")).toBeTruthy();
    expect(screen.getByText("Clue order")).toBeTruthy();
    expect(screen.getByText("Maya")).toBeTruthy();
  });

  it("clues names the current speaker and shows their turn position instead of a timer", () => {
    renderHost("Host: clues");
    expect(screen.getByText("Dov's turn")).toBeTruthy();
    expect(screen.getByText("Speaking")).toBeTruthy();
    expect(screen.getByText("Up next")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("of 6")).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("vote counts how many players voted", () => {
    renderHost("Host: vote");
    expect(screen.getByText("5 of 6 voted")).toBeTruthy();
    expect(screen.getAllByText("Voted")).toHaveLength(5);
    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  it("reveal shows the caught imposter stamp and the decoy word", () => {
    renderHost("Host: reveal");
    expect(screen.getByText("The votes are in")).toBeTruthy();
    expect(screen.getByText("Imposter!")).toBeTruthy();
    expect(screen.getByText("Priya's decoy word was")).toBeTruthy();
    expect(screen.getByText("ZEBRA")).toBeTruthy();
    expect(screen.getAllByText("4 votes").length).toBeGreaterThan(0);
  });

  it("last chance names the imposter and the seconds left", () => {
    renderHost("Host: last chance");
    expect(screen.getByText("Last chance, Priya!")).toBeTruthy();
    expect(screen.getByText("Priya is typing…")).toBeTruthy();
  });

  it("result shows the crew word, the guess and the points", () => {
    renderHost("Host: result");
    expect(screen.getByText("The word was")).toBeTruthy();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.getByText("Priya guessed…")).toBeTruthy();
    expect(screen.getByLabelText("HORSE")).toBeTruthy();
    expect(screen.getByText("NOPE")).toBeTruthy();
    expect(screen.getByText("Points this word")).toBeTruthy();
    expect(screen.getAllByText("1,500")).toHaveLength(2);
  });

  it("wraps the phase in the enter animation and swaps content on a phase change", () => {
    const first = hostSample("Host: vote");
    const second = hostSample("Host: result");
    const clock: ServerClock = { now: () => first.room.serverNow };
    const { container, rerender } = render(
      <Host
        view={first.view}
        room={first.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
      />,
    );
    const wrapper = container.querySelector(".opg-phase-enter");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain("Who has the decoy word?");

    rerender(
      <Host
        view={second.view}
        room={second.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
      />,
    );
    const next = container.querySelector(".opg-phase-enter");
    expect(next).toBeTruthy();
    expect(next?.textContent).toContain("Standings");
  });
});

describe("Host secrecy", () => {
  it("only shows the imposter stamp when the imposter was caught", () => {
    for (const label of [
      "Host: check your phones",
      "Host: clues",
      "Host: vote",
      "Host: last chance",
      "Host: result",
    ]) {
      renderHost(label);
      expect(screen.queryByText("Imposter!")).toBeNull();
      cleanup();
    }
    renderHost("Host: reveal");
    expect(screen.getByText("Imposter!")).toBeTruthy();
  });

  it("only shows the crew word in the result", () => {
    for (const label of [
      "Host: check your phones",
      "Host: clues",
      "Host: vote",
      "Host: reveal",
      "Host: last chance",
    ]) {
      renderHost(label);
      expect(screen.queryByText("GIRAFFE")).toBeNull();
      cleanup();
    }
    renderHost("Host: result");
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
  });
});

interface RecordingEngine extends SoundEngine {
  cues: CueId[];
}

function recordingEngine(): RecordingEngine {
  const cues: CueId[] = [];
  return {
    cues,
    status: () => "running",
    subscribe: () => () => undefined,
    unlock() {},
    setMuted() {},
    preload() {},
    play(cue) {
      cues.push(cue);
      return { stop() {} };
    },
    playMusic() {},
    stopAll() {},
  };
}

describe("Host sound cues", () => {
  it("pops a vote tile only after mount, when the vote arrives live", () => {
    const { view, room } = hostSample("Host: vote");
    const engine = recordingEngine();
    const clock: ServerClock = { now: () => room.serverNow };
    const { rerender } = render(
      <SoundProvider engine={engine}>
        <Host
          view={view}
          room={room}
          deadline={null}
          timerStartedAt={null}
          clock={clock}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual([]);

    rerender(
      <SoundProvider engine={engine}>
        <Host
          view={{ ...view, votedIds: [...view.votedIds, "priya"] }}
          room={room}
          deadline={null}
          timerStartedAt={null}
          clock={clock}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual(["pop"]);
  });

  it("plays whoosh only when the current speaker changes live", () => {
    const { view, room } = hostSample("Host: clues");
    const engine = recordingEngine();
    const clock: ServerClock = { now: () => room.serverNow };
    const { rerender } = render(
      <SoundProvider engine={engine}>
        <Host
          view={view}
          room={room}
          deadline={null}
          timerStartedAt={null}
          clock={clock}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual([]);

    rerender(
      <SoundProvider engine={engine}>
        <Host
          view={{ ...view, currentSpeakerId: "priya" }}
          room={room}
          deadline={null}
          timerStartedAt={null}
          clock={clock}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual(["whoosh"]);
  });
});
