import { describe, expect, it } from "vitest";
import { en, format, he, placeFor } from "@opg/i18n";
import { crownCopy, finaleBeats, rankPlayers } from "./finale-timeline";

describe("finaleBeats", () => {
  it("lays out the wrap, awards, crown-intro, third, second and crown beats", () => {
    const beats = finaleBeats({
      awardCount: 2,
      rankedCount: 4,
      crownCue: "fanfare",
    });
    expect(beats.map((beat) => beat.id)).toEqual([
      "wrap",
      "award-0",
      "award-1",
      "crown-intro",
      "third",
      "second",
      "crown",
      "settle",
    ]);
    expect(beats[0]).toEqual({ id: "wrap", atMs: 0, cue: "whoosh" });
    expect(beats[1]).toEqual({ id: "award-0", atMs: 2000, cue: "tape" });
    expect(beats[2]).toEqual({ id: "award-1", atMs: 5000, cue: "tape" });
    const crownIntro = beats.find((beat) => beat.id === "crown-intro");
    expect(crownIntro).toEqual({
      id: "crown-intro",
      atMs: 8000,
      cue: "drumroll",
    });
    expect(beats.find((beat) => beat.id === "third")).toEqual({
      id: "third",
      atMs: 11000,
      cue: "pop",
    });
    expect(beats.find((beat) => beat.id === "second")).toEqual({
      id: "second",
      atMs: 13000,
      cue: "pop",
    });
    expect(beats.find((beat) => beat.id === "crown")).toEqual({
      id: "crown",
      atMs: 16000,
      cue: "fanfare",
    });
    expect(beats.find((beat) => beat.id === "settle")).toEqual({
      id: "settle",
      atMs: 19000,
    });
  });

  it("has no award beats when nobody earned one", () => {
    const beats = finaleBeats({
      awardCount: 0,
      rankedCount: 2,
      crownCue: "slam",
    });
    expect(beats.map((beat) => beat.id)).toEqual([
      "wrap",
      "crown-intro",
      "second",
      "crown",
      "settle",
    ]);
  });

  it("omits third with fewer than 3 ranked players", () => {
    const beats = finaleBeats({
      awardCount: 0,
      rankedCount: 2,
      crownCue: "slam",
    });
    expect(beats.some((beat) => beat.id === "third")).toBe(false);
    expect(beats.some((beat) => beat.id === "second")).toBe(true);
  });

  it("omits second with fewer than 2 ranked players", () => {
    const beats = finaleBeats({
      awardCount: 0,
      rankedCount: 1,
      crownCue: "slam",
    });
    expect(beats.some((beat) => beat.id === "third")).toBe(false);
    expect(beats.some((beat) => beat.id === "second")).toBe(false);
    expect(beats.some((beat) => beat.id === "crown")).toBe(true);
  });
});

describe("rankPlayers", () => {
  it("ranks by score, highest first", () => {
    const ranked = rankPlayers({ p1: 10, p2: 30, p3: 5 }, ["p1", "p2", "p3"]);
    expect(ranked).toEqual([
      { id: "p2", score: 30, rank: 1 },
      { id: "p1", score: 10, rank: 2 },
      { id: "p3", score: 5, rank: 3 },
    ]);
  });

  it("shares a rank on a tie and skips the next rank", () => {
    const ranked = rankPlayers({ p1: 20, p2: 20, p3: 5 }, ["p1", "p2", "p3"]);
    expect(ranked).toEqual([
      { id: "p1", score: 20, rank: 1 },
      { id: "p2", score: 20, rank: 1 },
      { id: "p3", score: 5, rank: 3 },
    ]);
  });

  it("defaults a missing score to 0", () => {
    expect(rankPlayers({}, ["p1"])).toEqual([{ id: "p1", score: 0, rank: 1 }]);
  });
});

describe("crownCopy", () => {
  it("returns null when nobody won", () => {
    expect(crownCopy(en, [])).toBeNull();
  });

  it("names one winner", () => {
    expect(crownCopy(en, ["Dov"])).toBe("Dov wins the crown!");
  });

  it("joins two winners with 'and'", () => {
    expect(crownCopy(en, ["Dov", "Maya"])).toBe(
      "Dov and Maya share the crown!",
    );
  });

  it("joins three or more winners with commas and 'and'", () => {
    expect(crownCopy(en, ["Dov", "Maya", "Sam"])).toBe(
      "Dov, Maya and Sam share the crown!",
    );
  });

  it("names the winner in the reader's language", () => {
    expect(crownCopy(he, ["Dov"])).toBe(
      format(he.results.crownWins, { name: "Dov" }),
    );
  });
});

describe("placeFor", () => {
  // Every game caps at 8 players, so every rank a room can reach has its own word
  // rather than a number with a suffix glued on — a rule English has and Hebrew does not.
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [8, "8th"],
  ])("names place %i in English as %s", (rank, expected) => {
    expect(placeFor(en, rank)).toContain(expected);
  });

  it("names every reachable place in Hebrew without a suffix rule", () => {
    for (let rank = 1; rank <= 8; rank += 1) {
      const place = placeFor(he, rank);
      expect(place).not.toBe("");
      expect(place).not.toContain(String(rank));
    }
  });

  it("falls back to the numbered form past the last named place", () => {
    expect(placeFor(en, 9)).toContain("9");
    expect(placeFor(he, 9)).toContain("9");
  });
});
