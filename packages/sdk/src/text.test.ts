import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "./text";

describe("normalizeAnswer", () => {
  it("lowercases and trims", () => {
    expect(normalizeAnswer("  GIRAFFE  ")).toBe("giraffe");
  });

  it("strips punctuation", () => {
    expect(normalizeAnswer("gi-raffe!")).toBe("gi raffe");
    expect(normalizeAnswer("Hello, world.")).toBe("hello world");
  });

  it("drops a leading article followed by a space", () => {
    expect(normalizeAnswer("the giraffe")).toBe("giraffe");
    expect(normalizeAnswer("a zebra")).toBe("zebra");
    expect(normalizeAnswer("an apple")).toBe("apple");
    expect(normalizeAnswer("THE giraffe")).toBe("giraffe");
  });

  it("does not drop an article glued to the word", () => {
    expect(normalizeAnswer("theater")).toBe("theater");
    expect(normalizeAnswer("apple")).toBe("apple");
  });

  it("only drops one leading article", () => {
    expect(normalizeAnswer("the an apple")).toBe("an apple");
  });

  it("collapses inner whitespace", () => {
    expect(normalizeAnswer("a   big    cat")).toBe("big cat");
  });

  it("handles the documented example", () => {
    expect(normalizeAnswer("  The Giraffe!  ")).toBe("giraffe");
  });

  it("keeps numbers and unicode letters", () => {
    expect(normalizeAnswer("Café 42")).toBe("café 42");
    expect(normalizeAnswer("naïve")).toBe("naïve");
  });

  it("returns an empty string for whitespace/punctuation only", () => {
    expect(normalizeAnswer("   ")).toBe("");
    expect(normalizeAnswer("!!!")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeAnswer("  The Big, Bad Wolf!  ");
    expect(normalizeAnswer(once)).toBe(once);
    expect(once).toBe("big bad wolf");
  });
});
