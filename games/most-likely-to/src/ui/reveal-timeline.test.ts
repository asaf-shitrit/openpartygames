import { describe, expect, it } from "vitest";
import type { Beat, Moment } from "@opg/ui";
import { en } from "@opg/i18n";
import { REVEAL_MS } from "../state";
import type { MltOutcome } from "../state";
import {
  PHONE_FOLLOW_MS,
  REVEAL_TIMING,
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  personalReveal,
  phoneRevealBeats,
  scratchOrder,
  spotlightIds,
  verdictCue,
} from "./reveal-timeline";

const PICKED: MltOutcome = { kind: "picked", pickedId: "dov" };
const TIE: MltOutcome = { kind: "tie", tiedIds: ["dov", "priya"] };
const SPLIT: MltOutcome = { kind: "split" };
const NO_VOTES: MltOutcome = { kind: "no-votes" };

const A = "a";
const B = "b";
const X = "x";
const Y = "y";
const Z = "z";

function cueOf(beats: readonly Beat[], id: string): string | undefined {
  return beats.find((beat) => beat.id === id)?.cue;
}

function atMsOf(beats: readonly Beat[], id: string): number {
  return beats.find((beat) => beat.id === id)?.atMs ?? -1;
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

describe("hostRevealBeats", () => {
  it("lays out sorted beats that all finish before the reveal ends", () => {
    const beats = hostRevealBeats(PICKED, 4);
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "intro")).toBe(0);
    expect(atMsOf(beats, "suspense")).toBe(REVEAL_TIMING.suspenseMs);
    expect(atMsOf(beats, "verdict")).toBe(REVEAL_TIMING.verdictMs);
    expect(atMsOf(beats, "points")).toBe(REVEAL_TIMING.pointsMs);
    expect(atMsOf(beats, "next")).toBe(REVEAL_TIMING.nextMs);
    for (const beat of beats) expect(beat.atMs).toBeLessThan(REVEAL_MS);
  });

  it("plays whoosh, one scratch per mark, drumroll, the verdict cue, pop and tape", () => {
    const beats = hostRevealBeats(PICKED, 4);
    expect(cueOf(beats, "intro")).toBe("whoosh");
    expect(beats.filter((beat) => beat.cue === "scratch")).toHaveLength(4);
    expect(cueOf(beats, "suspense")).toBe("drumroll");
    expect(cueOf(beats, "verdict")).toBe("slam");
    expect(cueOf(beats, "points")).toBe("pop");
    expect(cueOf(beats, "next")).toBe("tape");
  });

  it("caps the mark step at 450ms, speeding up for many marks", () => {
    const four = hostRevealBeats(PICKED, 4);
    expect(atMsOf(four, "mark-1") - atMsOf(four, "mark-0")).toBe(450);
    const ten = hostRevealBeats(PICKED, 10);
    expect(atMsOf(ten, "mark-1") - atMsOf(ten, "mark-0")).toBe(360);
  });

  it("keeps every mark before the suspense beat", () => {
    const marks = hostRevealBeats(PICKED, 10).filter((beat) =>
      beat.id.startsWith("mark-"),
    );
    expect(marks).toHaveLength(10);
    for (const mark of marks) {
      expect(mark.atMs).toBeLessThan(REVEAL_TIMING.suspenseMs);
    }
  });
});

describe("verdictCue", () => {
  it("slams for a clear pick and boings for everything else", () => {
    expect(verdictCue(PICKED)).toBe("slam");
    expect(verdictCue(TIE)).toBe("boing");
    expect(verdictCue(SPLIT)).toBe("boing");
    expect(verdictCue(NO_VOTES)).toBe("boing");
  });
});

describe("scratchOrder", () => {
  it("takes each target's first voter, then each target's second", () => {
    const order = scratchOrder({ [A]: [X, Y], [B]: [Z] }, [A, B]);
    expect(order).toEqual([
      { targetId: A, voterId: X },
      { targetId: B, voterId: Z },
      { targetId: A, voterId: Y },
    ]);
  });

  it("is empty when nobody voted", () => {
    expect(scratchOrder({}, [A, B])).toEqual([]);
  });
});

describe("marksDrawn", () => {
  const beats = hostRevealBeats(PICKED, 3);

  it("draws nothing before the first mark", () => {
    expect(marksDrawn(beats, moment(beats, -1))).toBe(0);
  });

  it("draws marks one beat at a time", () => {
    expect(marksDrawn(beats, moment(beats, 1))).toBe(1);
    expect(marksDrawn(beats, moment(beats, 3))).toBe(3);
  });

  it("draws all marks once the suspense beat is reached", () => {
    expect(marksDrawn(beats, moment(beats, 4))).toBe(3);
    expect(marksDrawn(beats, moment(beats, 7))).toBe(3);
  });
});

describe("marksForTarget", () => {
  const order = scratchOrder({ [A]: [X, Y], [B]: [Z] }, [A, B]);

  it("counts the target's marks among the drawn ones", () => {
    expect(marksForTarget(order, A, 0)).toBe(0);
    expect(marksForTarget(order, A, 1)).toBe(1);
    expect(marksForTarget(order, A, 3)).toBe(2);
    expect(marksForTarget(order, B, 3)).toBe(1);
  });

  it("clamps out-of-range drawn counts", () => {
    expect(marksForTarget(order, A, 99)).toBe(2);
    expect(marksForTarget(order, A, -4)).toBe(0);
  });
});

describe("spotlightIds", () => {
  it("lands on the pick alone, or everyone in a tie", () => {
    expect(spotlightIds(PICKED)).toEqual(["dov"]);
    expect(spotlightIds(TIE)).toEqual(["dov", "priya"]);
  });

  it("spotlights nobody for a split or a no-votes round", () => {
    expect(spotlightIds(SPLIT)).toEqual([]);
    expect(spotlightIds(NO_VOTES)).toEqual([]);
  });
});

describe("personalReveal", () => {
  it("sits out a player who did not vote", () => {
    expect(
      personalReveal(en, {
        outcome: PICKED,
        me: "leo",
        myVote: null,
        matched: false,
        pickedName: "Dov",
      }),
    ).toEqual({
      headline: "You sat this one out",
      sub: "Vote next round to score.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("celebrates picking yourself and being picked, matched", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "picked", pickedId: "dov" },
        me: "dov",
        myVote: "dov",
        matched: true,
        pickedName: "Dov",
      }),
    ).toEqual({
      headline: "You called it on yourself!",
      sub: "+500. Own it.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("puts you on the hook when the room picked you and you missed", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "picked", pickedId: "dov" },
        me: "dov",
        myVote: "leo",
        matched: false,
        pickedName: "Dov",
      }),
    ).toEqual({
      headline: "The room picked you!",
      sub: "Time to explain yourself.",
      haptic: "caught",
      celebrate: false,
    });
  });

  it("celebrates matching someone else's pick", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "picked", pickedId: "dov" },
        me: "leo",
        myVote: "dov",
        matched: true,
        pickedName: "Dov",
      }),
    ).toEqual({
      headline: "You read the room!",
      sub: "+500. It's Dov.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("falls back to Someone for a picked player who left", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "picked", pickedId: "dov" },
        me: "leo",
        myVote: "priya",
        matched: false,
        pickedName: null,
      }),
    ).toEqual({
      headline: "The room picked Someone",
      sub: "Your vote went another way.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("celebrates a matched tie", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "tie", tiedIds: ["dov", "priya"] },
        me: "leo",
        myVote: "dov",
        matched: true,
        pickedName: null,
      }),
    ).toEqual({
      headline: "You backed a winner!",
      sub: "+500. It's a tie.",
      haptic: "good",
      celebrate: true,
    });
  });

  it("puts a tied player on the hook", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "tie", tiedIds: ["dov", "priya"] },
        me: "dov",
        myVote: "leo",
        matched: false,
        pickedName: null,
      }),
    ).toEqual({
      headline: "You're in the tie!",
      sub: "Explain yourself.",
      haptic: "caught",
      celebrate: false,
    });
  });

  it("is a plain miss for a bystander to a tie", () => {
    expect(
      personalReveal(en, {
        outcome: { kind: "tie", tiedIds: ["dov", "priya"] },
        me: "leo",
        myVote: "sam",
        matched: false,
        pickedName: null,
      }),
    ).toEqual({
      headline: "It's a tie",
      sub: "Your vote went another way.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("scores nobody on a split round", () => {
    expect(
      personalReveal(en, {
        outcome: SPLIT,
        me: "leo",
        myVote: "sam",
        matched: false,
        pickedName: null,
      }),
    ).toEqual({
      headline: "No clear pick",
      sub: "Nobody got 2 votes. No points this time.",
      haptic: "soft",
      celebrate: false,
    });
  });
});

describe("phoneRevealBeats", () => {
  it("lands the personal beat 200ms after the TV's verdict, with the haptic", () => {
    const beats = phoneRevealBeats("good");
    expect(beats.map((beat) => beat.id)).toEqual([
      "intro",
      "suspense",
      "personal",
      "next",
    ]);
    expect(atMsOf(beats, "personal")).toBe(
      REVEAL_TIMING.verdictMs + PHONE_FOLLOW_MS,
    );
    expect(atMsOf(beats, "personal")).toBe(8200);
    expect(beats.find((beat) => beat.id === "personal")?.haptic).toBe("good");
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "next")).toBeLessThan(REVEAL_MS);
  });

  it("lands the personal beat on the verdict itself when there is no TV to follow", () => {
    const beats = phoneRevealBeats("good", 0);
    expect(atMsOf(beats, "personal")).toBe(REVEAL_TIMING.verdictMs);
    expect(atMsOf(beats, "personal")).toBe(8000);
    expect(beats.find((beat) => beat.id === "personal")?.haptic).toBe("good");
    expect(isSorted(beats)).toBe(true);
  });

  it("moves only the personal beat, whatever the follow", () => {
    const withTv = phoneRevealBeats("good");
    const withoutTv = phoneRevealBeats("good", 0);
    for (const id of ["intro", "suspense", "next"]) {
      expect(atMsOf(withoutTv, id)).toBe(atMsOf(withTv, id));
    }
    expect(atMsOf(withTv, "personal") - atMsOf(withoutTv, "personal")).toBe(
      PHONE_FOLLOW_MS,
    );
  });
});
