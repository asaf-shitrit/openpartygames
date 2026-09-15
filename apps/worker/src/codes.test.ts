import { describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, ROOM_CODE_RE } from "@opg/protocol";
import { randomRoomCode, roomCodeFromBytes } from "./codes";

describe("roomCodeFromBytes", () => {
  it("maps bytes to alphabet positions", () => {
    expect(roomCodeFromBytes([0, 1, 2, 3])).toBe("BCDF");
    expect(roomCodeFromBytes([19, 18, 17, 16])).toBe("ZXWV");
  });

  it("skips bytes that would bias the alphabet", () => {
    expect(roomCodeFromBytes([255, 0, 255, 1, 240, 2, 3])).toBe("BCDF");
  });

  it("returns null when it runs out of usable bytes", () => {
    expect(roomCodeFromBytes([1, 2])).toBeNull();
    expect(roomCodeFromBytes([250, 251, 252])).toBeNull();
  });
});

describe("randomRoomCode", () => {
  it("always draws a full code from the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = randomRoomCode();
      expect(ROOM_CODE_RE.test(code)).toBe(true);
      for (const letter of code) expect(ROOM_CODE_ALPHABET).toContain(letter);
    }
  });
});
