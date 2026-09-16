import { describe, expect, it } from "vitest";
import type { Beat, Moment } from "@opg/ui";
import {
  RESULT_CANCELLED_MS,
  RESULT_CAUGHT_MS,
  RESULT_ESCAPED_MS,
} from "../state";
import {
  RESULT_TIMING,
  hostResultBeats,
  lettersRevealed,
  personalResult,
  phoneResultBeats,
  previousTotals,
  resultPath,
  standingsOrder,
} from "./result-timeline";
import type { PersonalResultInput } from "./result-timeline";

function atMsOf(beats: readonly Beat[], id: string): number {
  return beats.find((beat) => beat.id === id)?.atMs ?? -1;
}

function cueOf(beats: readonly Beat[], id: string): string | undefined {
  return beats.find((beat) => beat.id === id)?.cue;
}

function moment(beats: readonly Beat[], index: number): Moment {
  return {
    index,
    beatId: beats[index]?.id ?? null,
    elapsedMs: 0,
    live: false,
  };
}

function isSorted(beats: readonly Beat[]): boolean {
  for (let index = 1; index < beats.length; index += 1) {
    const previous = beats[index - 1];
    const current = beats[index];
    if (previous === undefined || current === undefined) return false;
    if (current.atMs < previous.atMs) return false;
  }
  return true;
}

function lastAtMs(beats: readonly Beat[]): number {
  return beats.reduce((max, beat) => Math.max(max, beat.atMs), 0);
}

describe("resultPath", () => {
  it("maps caught, escaped and cancelled", () => {
    expect(resultPath(true)).toBe("caught");
    expect(resultPath(false)).toBe("escaped");
    expect(resultPath(null)).toBe("cancelled");
  });
});

describe("hostResultBeats, caught", () => {
  const beats = hostResultBeats("caught", false, 5);

  it("lays out sorted beats that finish before the phase", () => {
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "drum")).toBe(RESULT_TIMING.caught.drumMs);
    expect(atMsOf(beats, "verdict")).toBe(RESULT_TIMING.caught.verdictMs);
    expect(atMsOf(beats, "word")).toBe(RESULT_TIMING.caught.wordMs);
    expect(atMsOf(beats, "points")).toBe(RESULT_TIMING.caught.pointsMs);
    expect(atMsOf(beats, "count")).toBe(RESULT_TIMING.caught.countMs);
    expect(atMsOf(beats, "reorder")).toBe(RESULT_TIMING.caught.reorderMs);
    expect(atMsOf(beats, "settle")).toBe(RESULT_TIMING.caught.settleMs);
    expect(lastAtMs(beats)).toBeLessThan(RESULT_CAUGHT_MS);
  });

  it("plays drumroll, one tick per letter, marker, pop and whoosh", () => {
    expect(cueOf(beats, "drum")).toBe("drumroll");
    expect(beats.filter((beat) => beat.cue === "tick")).toHaveLength(5);
    expect(cueOf(beats, "word")).toBe("marker");
    expect(cueOf(beats, "points")).toBe("pop");
    expect(cueOf(beats, "reorder")).toBe("whoosh");
  });

  it("slams a correct guess and buzzes a wrong one", () => {
    expect(cueOf(hostResultBeats("caught", true, 3), "verdict")).toBe("slam");
    expect(cueOf(hostResultBeats("caught", false, 3), "verdict")).toBe(
      "buzzer",
    );
    expect(cueOf(hostResultBeats("caught", null, 3), "verdict")).toBe(
      "buzzer",
    );
  });

  it("caps the letter step, speeding up for many letters", () => {
    const four = hostResultBeats("caught", true, 4);
    expect(atMsOf(four, "letter-1") - atMsOf(four, "letter-0")).toBe(140);
    const twenty = hostResultBeats("caught", true, 20);
    expect(atMsOf(twenty, "letter-1") - atMsOf(twenty, "letter-0")).toBe(90);
  });

  it("keeps every letter before the verdict beat", () => {
    const letters = hostResultBeats("caught", true, 8).filter((beat) =>
      beat.id.startsWith("letter-"),
    );
    expect(letters).toHaveLength(8);
    for (const letter of letters) {
      expect(letter.atMs).toBeLessThan(RESULT_TIMING.caught.verdictMs);
    }
  });

  it("has no letter beats for a zero-length guess", () => {
    const none = hostResultBeats("caught", null, 0);
    expect(none.filter((beat) => beat.id.startsWith("letter-"))).toHaveLength(
      0,
    );
  });
});

describe("hostResultBeats, escaped", () => {
  const beats = hostResultBeats("escaped", null, 0);

  it("lays out sorted beats that finish before the phase", () => {
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "word")).toBe(RESULT_TIMING.escaped.wordMs);
    expect(atMsOf(beats, "points")).toBe(RESULT_TIMING.escaped.pointsMs);
    expect(atMsOf(beats, "count")).toBe(RESULT_TIMING.escaped.countMs);
    expect(atMsOf(beats, "reorder")).toBe(RESULT_TIMING.escaped.reorderMs);
    expect(atMsOf(beats, "settle")).toBe(RESULT_TIMING.escaped.settleMs);
    expect(lastAtMs(beats)).toBeLessThan(RESULT_ESCAPED_MS);
  });

  it("plays sneak, pop and whoosh, with no verdict or letters", () => {
    expect(cueOf(beats, "word")).toBe("sneak");
    expect(cueOf(beats, "points")).toBe("pop");
    expect(cueOf(beats, "reorder")).toBe("whoosh");
    expect(beats.some((beat) => beat.id === "verdict")).toBe(false);
    expect(beats.some((beat) => beat.id.startsWith("letter-"))).toBe(false);
  });
});

describe("hostResultBeats, cancelled", () => {
  it("only settles, immediately", () => {
    const beats = hostResultBeats("cancelled", null, 0);
    expect(beats).toEqual([{ id: "settle", atMs: 0 }]);
    expect(lastAtMs(beats)).toBeLessThan(RESULT_CANCELLED_MS);
  });
});

describe("lettersRevealed", () => {
  const beats = hostResultBeats("caught", true, 3);

  it("reveals nothing before the first letter", () => {
    expect(lettersRevealed(beats, moment(beats, -1))).toBe(0);
    expect(lettersRevealed(beats, moment(beats, 0))).toBe(0);
  });

  it("reveals letters one beat at a time", () => {
    expect(lettersRevealed(beats, moment(beats, 1))).toBe(1);
    expect(lettersRevealed(beats, moment(beats, 3))).toBe(3);
  });

  it("reveals every letter once the verdict beat is reached", () => {
    const verdictIndex = beats.findIndex((beat) => beat.id === "verdict");
    expect(lettersRevealed(beats, moment(beats, verdictIndex))).toBe(3);
    expect(lettersRevealed(beats, moment(beats, beats.length - 1))).toBe(3);
  });

  it("reveals nothing for a path with no letter beats", () => {
    const escaped = hostResultBeats("escaped", null, 0);
    expect(lettersRevealed(escaped, moment(escaped, escaped.length - 1))).toBe(
      0,
    );
  });
});

describe("personalResult", () => {
  const base: PersonalResultInput = {
    path: "caught",
    isImposter: false,
    votedImposter: false,
    guessCorrect: null,
    myPoints: 0,
    crewWord: "GIRAFFE",
  };

  it("stole the word", () => {
    expect(
      personalResult({
        ...base,
        isImposter: true,
        guessCorrect: true,
        myPoints: 1000,
      }),
    ).toEqual({
      headline: "You stole the word!",
      sub: "+1,000 for you.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("caught, imposter, guessed wrong", () => {
    expect(
      personalResult({ ...base, isImposter: true, guessCorrect: false }),
    ).toEqual({
      headline: "So close!",
      sub: "The word was GIRAFFE.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("caught, crew, spotted the imposter, guess wrong", () => {
    expect(
      personalResult({
        ...base,
        votedImposter: true,
        guessCorrect: false,
        myPoints: 500,
      }),
    ).toEqual({
      headline: "Nice spotting!",
      sub: "+500 for you.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("caught, crew, guess right", () => {
    expect(personalResult({ ...base, guessCorrect: true })).toEqual({
      headline: "They stole it!",
      sub: "0 this word.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("caught without voting the imposter, guess wrong", () => {
    expect(personalResult({ ...base, guessCorrect: false })).toEqual({
      headline: "Caught without you",
      sub: "0 this word.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("escaped, imposter", () => {
    expect(
      personalResult({
        ...base,
        path: "escaped",
        isImposter: true,
        myPoints: 1000,
      }),
    ).toEqual({
      headline: "You slipped away!",
      sub: "+1,000 for you.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("escaped, crew", () => {
    expect(personalResult({ ...base, path: "escaped" })).toEqual({
      headline: "The imposter got away",
      sub: "0 this word.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("cancelled", () => {
    expect(personalResult({ ...base, path: "cancelled" })).toEqual({
      headline: "Word cancelled",
      sub: "No points this word.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("trusts myPoints over the table amount when they differ", () => {
    expect(
      personalResult({
        ...base,
        isImposter: true,
        guessCorrect: true,
        myPoints: 1500,
      }).sub,
    ).toBe("+1,500 for you.");
  });
});

describe("phoneResultBeats", () => {
  it("caught: drum, personal 200ms after the TV verdict, count, settle", () => {
    const beats = phoneResultBeats("caught", "good");
    expect(beats.map((beat) => beat.id)).toEqual([
      "drum",
      "personal",
      "count",
      "settle",
    ]);
    expect(atMsOf(beats, "personal")).toBe(
      RESULT_TIMING.caught.verdictMs + 200,
    );
    expect(beats.find((beat) => beat.id === "personal")?.haptic).toBe("good");
    expect(isSorted(beats)).toBe(true);
    expect(lastAtMs(beats)).toBeLessThan(RESULT_CAUGHT_MS);
  });

  it("escaped: personal 200ms after the TV word beat, count, settle", () => {
    const beats = phoneResultBeats("escaped", "soft");
    expect(beats.map((beat) => beat.id)).toEqual([
      "personal",
      "count",
      "settle",
    ]);
    expect(atMsOf(beats, "personal")).toBe(
      RESULT_TIMING.escaped.pointsMs + 200,
    );
    expect(lastAtMs(beats)).toBeLessThan(RESULT_ESCAPED_MS);
  });

  it("cancelled: personal only, immediately", () => {
    const beats = phoneResultBeats("cancelled", "soft");
    expect(beats).toEqual([{ id: "personal", atMs: 0, haptic: "soft" }]);
    expect(lastAtMs(beats)).toBeLessThan(RESULT_CANCELLED_MS);
  });
});

describe("standingsOrder", () => {
  it("sorts by score desc, ties by playerIds order", () => {
    const order = standingsOrder(
      ["a", "b", "c", "d"],
      { a: 1000, b: 1500, c: 1500, d: 0 },
    );
    expect(order).toEqual(["b", "c", "a", "d"]);
  });

  it("treats a missing total as 0", () => {
    expect(standingsOrder(["a", "b"], { a: 500 })).toEqual(["a", "b"]);
  });
});

describe("previousTotals", () => {
  it("subtracts this word's points from the totals", () => {
    expect(previousTotals({ a: 1500, b: 500 }, { a: 500, b: 0 })).toEqual({
      a: 1000,
      b: 500,
    });
  });

  it("never goes below 0", () => {
    expect(previousTotals({ a: 200 }, { a: 500 })).toEqual({ a: 0 });
  });

  it("treats null points as no change", () => {
    expect(previousTotals({ a: 1000 }, null)).toEqual({ a: 1000 });
  });
});
