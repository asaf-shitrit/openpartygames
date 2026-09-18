// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import { afterEach } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { avatarOf, findPlayer, nameOf, PromptLine } from "./common";

afterEach(() => {
  cleanup();
});

const PLAYERS: PlayerSummary[] = [
  {
    id: "dov",
    name: "Dov",
    avatar: "toast",
    connected: true,
    isVip: false,
    crowns: 0,
    waitingForNextGame: false,
  },
  {
    id: "maya",
    name: "Maya",
    avatar: "star",
    connected: true,
    isVip: true,
    crowns: 1,
    waitingForNextGame: false,
  },
];

describe("findPlayer", () => {
  it("finds a player by id", () => {
    expect(findPlayer(PLAYERS, "dov")).toEqual(PLAYERS[0]);
  });

  it("returns null for a null id", () => {
    expect(findPlayer(PLAYERS, null)).toBeNull();
  });

  it("returns null for an id not in the roster", () => {
    expect(findPlayer(PLAYERS, "zed")).toBeNull();
  });
});

describe("nameOf", () => {
  it("returns the player's name", () => {
    expect(nameOf(PLAYERS, "dov", "Someone")).toBe("Dov");
  });

  it("falls back to the given someone label for an unknown id", () => {
    expect(nameOf(PLAYERS, "zed", "Someone")).toBe("Someone");
  });

  it("falls back to the given someone label for a null id", () => {
    expect(nameOf(PLAYERS, null, "Someone")).toBe("Someone");
  });
});

describe("avatarOf", () => {
  it("returns the player's avatar", () => {
    expect(avatarOf(PLAYERS, "maya")).toBe("star");
  });

  it("returns null for an unknown id", () => {
    expect(avatarOf(PLAYERS, "zed")).toBeNull();
  });

  it("returns null for a null id", () => {
    expect(avatarOf(PLAYERS, null)).toBeNull();
  });
});

describe("PromptLine", () => {
  it("renders the Who's most likely to... text with the prompt", () => {
    const { container } = render(
      <LocaleProvider>
        <PromptLine prompt="adopt a dozen cats" size={20} />
      </LocaleProvider>,
    );
    expect(container.querySelector("p")?.textContent).toBe(
      "Who's most likely to adopt a dozen cats?",
    );
    expect(screen.getByText("adopt a dozen cats")).toBeTruthy();
  });
});
