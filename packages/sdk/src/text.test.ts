import { describe, expect, it } from "vitest";
import { duplicateKey, normalizeAnswer } from "./text";

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

describe("normalizeAnswer, Hebrew and apostrophes", () => {
  it("ignores niqqud and cantillation", () => {
    expect(normalizeAnswer("שָׁלוֹם")).toBe("שלום");
  });

  it("joins a word at an apostrophe, curly quote or geresh", () => {
    expect(normalizeAnswer("Don't")).toBe("dont");
    expect(normalizeAnswer("don\u2019t")).toBe("dont");
    expect(normalizeAnswer("ג\u05F3חנון")).toBe("גחנון");
  });

  it("composes a decomposed accent", () => {
    expect(normalizeAnswer("cafe\u0301")).toBe(normalizeAnswer("caf\u00e9"));
  });
});

describe("normalizeAnswer, gershayim", () => {
  it("joins an acronym at a gershayim or an ASCII quote between Hebrew letters", () => {
    expect(normalizeAnswer("צה\u05F4ל")).toBe("צהל");
    expect(normalizeAnswer('צה"ל')).toBe("צהל");
  });

  it("still treats a quote around words as punctuation", () => {
    expect(normalizeAnswer('"hello" world')).toBe("hello world");
    expect(normalizeAnswer('say "שלום" now')).toBe("say שלום now");
  });
});

describe("duplicateKey", () => {
  it("is the normalized answer when there is one", () => {
    expect(duplicateKey("  The Giraffe!  ")).toBe("giraffe");
    expect(duplicateKey("giraffe")).toBe("giraffe");
  });

  it("keeps two different emoji-only answers apart", () => {
    expect(normalizeAnswer("\u{1F438}")).toBe("");
    expect(normalizeAnswer("\u{1F984}")).toBe("");
    expect(duplicateKey("\u{1F438}")).not.toBe(duplicateKey("\u{1F984}"));
  });

  it("keeps two different punctuation-only answers apart", () => {
    expect(duplicateKey("!!!")).not.toBe(duplicateKey("???"));
  });

  it("gives the same key for the same answer", () => {
    expect(duplicateKey("\u{1F438}")).toBe(duplicateKey("\u{1F438}"));
    expect(duplicateKey("!!!")).toBe(duplicateKey("!!!"));
  });
});
