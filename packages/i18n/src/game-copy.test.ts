import { describe, expect, it } from "vitest";
import { en } from "./dictionary";
import { gameBlurb, gameLandingBlurb, gameName } from "./game-copy";
import { he } from "./he";

const IDS = ["imposter", "real-or-nah", "most-likely-to", "doodle-bluff"];

describe("game copy", () => {
  it("names each shipped game in the room's UI language", () => {
    expect(gameName(he, "imposter", "Imposter")).toBe("מתחזה");
    expect(gameName(he, "real-or-nah", "Real or Nah")).toBe("אמת או לא");
    expect(gameName(en, "doodle-bluff", "x")).toBe("Doodle Bluff");
  });

  it("gives every shipped game a blurb of its own in each language", () => {
    for (const id of IDS) {
      expect(gameBlurb(he, id, "fallback")).not.toBe("fallback");
      expect(gameBlurb(he, id, "fallback")).toMatch(/[א-ת]/);
      expect(gameLandingBlurb(he, id, "fallback")).toMatch(/[א-ת]/);
      expect(gameBlurb(en, id, "fallback")).not.toBe("fallback");
    }
  });

  it("falls back to the server's text for a game it has no copy for", () => {
    expect(gameName(he, "mystery", "Mystery")).toBe("Mystery");
    expect(gameBlurb(he, "mystery", "A mystery")).toBe("A mystery");
    expect(gameLandingBlurb(he, "mystery", "A mystery")).toBe("A mystery");
  });
});
