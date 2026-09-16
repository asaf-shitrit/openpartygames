import { describe, expect, it } from "vitest";
import type { Beat, Moment } from "@opg/ui";
import { REVEAL_MS } from "../state";
import type { RevealOutcome } from "../rules";
import {
  PHONE_FOLLOW_MS,
  REVEAL_TIMING,
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  personalReveal,
  phoneRevealBeats,
  revealRole,
  scratchOrder,
} from "./reveal-timeline";

const CAUGHT: RevealOutcome = { kind: "caught" };
const WRONG: RevealOutcome = { kind: "wrong", accusedId: "dov" };
const TIE: RevealOutcome = { kind: "tie", tiedIds: ["dov", "priya"] };
const NO_VOTES: RevealOutcome = { kind: "no-votes" };

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
  it("lays out sorted beats that finish before the phase", () => {
    const beats = hostRevealBeats(CAUGHT, 4);
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "intro")).toBe(0);
    expect(atMsOf(beats, "suspense")).toBe(REVEAL_TIMING.suspenseMs);
    expect(atMsOf(beats, "verdict")).toBe(REVEAL_TIMING.verdictMs);
    expect(atMsOf(beats, "unmask")).toBe(REVEAL_TIMING.unmaskMs);
    expect(atMsOf(beats, "next")).toBe(REVEAL_TIMING.nextMs);
    expect(REVEAL_TIMING.nextMs).toBeLessThan(REVEAL_MS);
  });

  it("plays whoosh, one scratch per mark, drumroll, slam, marker and tape", () => {
    const beats = hostRevealBeats(CAUGHT, 4);
    expect(cueOf(beats, "intro")).toBe("whoosh");
    expect(beats.filter((beat) => beat.cue === "scratch")).toHaveLength(4);
    expect(cueOf(beats, "suspense")).toBe("drumroll");
    expect(cueOf(beats, "verdict")).toBe("slam");
    expect(cueOf(beats, "unmask")).toBe("marker");
    expect(cueOf(beats, "next")).toBe("tape");
  });

  it("caps the mark step at 450ms, speeding up for many marks", () => {
    const four = hostRevealBeats(CAUGHT, 4);
    expect(atMsOf(four, "mark-1") - atMsOf(four, "mark-0")).toBe(450);
    const ten = hostRevealBeats(CAUGHT, 10);
    expect(atMsOf(ten, "mark-1") - atMsOf(ten, "mark-0")).toBe(360);
  });

  it("keeps every mark before the suspense beat", () => {
    const marks = hostRevealBeats(CAUGHT, 10).filter((beat) =>
      beat.id.startsWith("mark-"),
    );
    expect(marks).toHaveLength(10);
    for (const mark of marks) {
      expect(mark.atMs).toBeLessThan(REVEAL_TIMING.suspenseMs);
    }
  });

  it("picks the verdict and unmask stings per outcome", () => {
    expect(cueOf(hostRevealBeats(WRONG, 1), "verdict")).toBe("buzzer");
    expect(cueOf(hostRevealBeats(WRONG, 1), "unmask")).toBe("sneak");
    expect(cueOf(hostRevealBeats(TIE, 1), "verdict")).toBe("boing");
    expect(cueOf(hostRevealBeats(NO_VOTES, 1), "verdict")).toBe("boing");
  });
});

describe("marksDrawn", () => {
  const beats = hostRevealBeats(CAUGHT, 3);

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

describe("revealRole", () => {
  it("labels the imposter, the spotter and the crew", () => {
    expect(revealRole(A, A, null)).toBe("imposter");
    expect(revealRole(A, B, A)).toBe("spotter");
    expect(revealRole(A, B, Z)).toBe("crew");
    expect(revealRole(null, B, null)).toBe("crew");
  });
});

describe("personalReveal", () => {
  it("writes the caught rows", () => {
    expect(personalReveal(true, "imposter", "Priya")).toEqual({
      headline: "You got caught!",
      sub: "Get ready to guess the crew's word.",
      haptic: "caught",
      celebrate: false,
    });
    expect(personalReveal(true, "spotter", "Priya")).toEqual({
      headline: "You spotted Priya!",
      sub: "+500 if they miss the word.",
      haptic: "good",
      celebrate: true,
    });
    expect(personalReveal(true, "crew", "Priya")).toEqual({
      headline: "Priya was the imposter",
      sub: "Get ready for their last chance.",
      haptic: "soft",
      celebrate: false,
    });
  });

  it("writes the escaped rows", () => {
    expect(personalReveal(false, "imposter", "Priya")).toEqual({
      headline: "You slipped away!",
      sub: "+1,000 for you.",
      haptic: "good",
      celebrate: true,
    });
    expect(personalReveal(false, "spotter", "Priya")).toEqual({
      headline: "You were right about Priya!",
      sub: "Not enough votes to catch them.",
      haptic: "soft",
      celebrate: false,
    });
    expect(personalReveal(false, "crew", "Priya")).toEqual({
      headline: "Priya got away",
      sub: "The imposter keeps the points.",
      haptic: "soft",
      celebrate: false,
    });
  });
});

describe("phoneRevealBeats", () => {
  it("lands the personal beat 200ms after the TV's caught verdict", () => {
    const beats = phoneRevealBeats(true, "caught");
    expect(beats.map((beat) => beat.id)).toEqual([
      "intro",
      "suspense",
      "personal",
      "next",
    ]);
    expect(atMsOf(beats, "personal")).toBe(
      REVEAL_TIMING.verdictMs + PHONE_FOLLOW_MS,
    );
    expect(beats.find((beat) => beat.id === "personal")?.haptic).toBe("caught");
    expect(isSorted(beats)).toBe(true);
    expect(atMsOf(beats, "next")).toBeLessThan(REVEAL_MS);
  });

  it("lands the personal beat 200ms after the TV's escape unmask", () => {
    const beats = phoneRevealBeats(false, "soft");
    expect(atMsOf(beats, "personal")).toBe(
      REVEAL_TIMING.unmaskMs + PHONE_FOLLOW_MS,
    );
    expect(beats.find((beat) => beat.id === "personal")?.haptic).toBe("soft");
  });
});
