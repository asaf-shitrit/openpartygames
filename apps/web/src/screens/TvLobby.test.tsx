import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SoundProvider } from "@opg/ui";
import type { CueHandle, CueId, SoundEngine, SoundStatus } from "@opg/ui";
import { makeHostView, makePlayer } from "./fixtures/room";
import { TvLobby } from "./TvLobby";

class FakeEngine implements SoundEngine {
  readonly cues: CueId[] = [];

  status(): SoundStatus {
    return "running";
  }

  subscribe(): () => void {
    return () => {
      /* status never changes */
    };
  }

  unlock(): void {
    /* nothing to resume */
  }

  setMuted(): void {
    /* nothing to mute */
  }

  preload(): void {
    /* no samples */
  }

  play(cue: CueId): CueHandle {
    this.cues.push(cue);
    return {
      stop() {
        /* nothing is playing */
      },
    };
  }

  playMusic(): void {
    /* nothing to play */
  }

  stopAll(): void {
    /* nothing is playing */
  }
}

afterEach(cleanup);

describe("TvLobby", () => {
  it("shows the room code and a QR code svg", () => {
    const { container } = render(
      <TvLobby
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
        })}
      />,
    );
    expect(screen.getByText("BKTZ")).toBeTruthy();
    expect(screen.getByText("1 of 8 players")).toBeTruthy();
    const qrTitle = container.querySelector("svg title");
    expect(qrTitle?.textContent).toContain("/BKTZ");
    expect(container.querySelector(".opg-qr")).not.toBeNull();
  });

  it("shows the VIP callout and open seats", () => {
    render(
      <TvLobby
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
          vipId: "p1",
        })}
      />,
    );
    expect(
      screen.getByText("is the VIP and picks the game from their phone"),
    ).toBeTruthy();
    expect(screen.getAllByText("Open seat").length).toBe(7);
  });

  it("waits for the first player when nobody has joined", () => {
    render(<TvLobby view={makeHostView({ players: [], vipId: null })} />);
    expect(
      screen.getByText("Waiting for the first player to join"),
    ).toBeTruthy();
  });

  it("tells players to open the address this screen is served from", () => {
    render(<TvLobby view={makeHostView({ players: [], vipId: null })} />);
    expect(screen.getByText(window.location.host)).toBeTruthy();
    expect(screen.queryByText("openpartygames.org")).toBeNull();
  });

  it("shows the Show on TV chip in the header and opens the guide", async () => {
    const user = userEvent.setup();
    render(<TvLobby view={makeHostView()} />);
    await user.click(screen.getByRole("button", { name: "Show on TV" }));
    expect(
      screen.getByRole("dialog", { name: "Show this on your TV" }),
    ).toBeTruthy();
  });

  it("plays no pop on the first mount, even with players already seated", () => {
    const engine = new FakeEngine();
    render(
      <SoundProvider engine={engine}>
        <TvLobby
          view={makeHostView({ players: [makePlayer({ id: "p1" })] })}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual([]);
  });

  it("pops a seat once a new player arrives", () => {
    const engine = new FakeEngine();
    const { rerender } = render(
      <SoundProvider engine={engine}>
        <TvLobby
          view={makeHostView({ players: [makePlayer({ id: "p1" })] })}
        />
      </SoundProvider>,
    );
    rerender(
      <SoundProvider engine={engine}>
        <TvLobby
          view={makeHostView({
            players: [
              makePlayer({ id: "p1" }),
              makePlayer({ id: "p2", name: "Sam" }),
            ],
          })}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual(["pop"]);
  });
});
