import { describe, expect, it } from "vitest";
import { MAX_AWARDS, cleanPlayerName, normalizeRoomCode, parseClientMessage, ROOM_CODE_RE } from "./index";

describe("parseClientMessage", () => {
  it("accepts every well-formed message", () => {
    const messages = [
      { t: "host-hello", hostToken: "abc" },
      { t: "join", name: "Priya" },
      { t: "join", name: "Priya", token: "tok" },
      { t: "set-avatar", avatar: "drop" },
      { t: "pick-game", gameId: "imposter" },
      { t: "set-pack", packId: "animals", enabled: false },
      { t: "set-locked", locked: true },
      { t: "kick", playerId: "p1" },
      { t: "start-game" },
      { t: "skip-phase" },
      { t: "end-game" },
      { t: "game-action", action: { type: "vote", target: "p2" } },
    ];
    for (const message of messages) {
      expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
    }
  });

  it("rejects malformed frames", () => {
    const frames = [
      "not json",
      JSON.stringify(null),
      JSON.stringify([1, 2]),
      JSON.stringify({ t: "nope" }),
      JSON.stringify({ t: "set-avatar", avatar: "dragon" }),
      JSON.stringify({ t: "set-pack", packId: "animals", enabled: "yes" }),
      JSON.stringify({ t: "join", name: "x".repeat(65) }),
      JSON.stringify({ t: "host-hello" }),
      "x".repeat(5000),
    ];
    for (const frame of frames) expect(parseClientMessage(frame)).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it("drops unknown fields instead of passing them through", () => {
    expect(parseClientMessage(JSON.stringify({ t: "start-game", extra: 1 }))).toEqual({ t: "start-game" });
  });
});

describe("cleanPlayerName", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanPlayerName("  Maya   Lee ")).toBe("Maya Lee");
  });

  it("rejects empty and overlong names", () => {
    expect(cleanPlayerName("   ")).toBeNull();
    expect(cleanPlayerName("abcdefghijklm")).toBeNull();
  });
});

describe("room codes", () => {
  it("normalizes case and validates the consonant alphabet", () => {
    expect(normalizeRoomCode(" bktz ")).toBe("BKTZ");
    expect(ROOM_CODE_RE.test("BKTZ")).toBe(true);
    expect(ROOM_CODE_RE.test("BATZ")).toBe(false);
  });
});

describe("GameResultSummary", () => {
  it("documents the award cap the SDK enforces", () => {
    // The cap itself lives in sanitizeAwards (packages/sdk/src/room.ts), tested there.
    expect(MAX_AWARDS).toBe(3);
  });
});
