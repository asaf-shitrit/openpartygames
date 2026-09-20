import { describe, expect, it } from "vitest";
import type { Moment } from "@opg/ui";
import { en, he } from "@opg/i18n";
import {
  hostRevealBeats,
  personalReveal,
  phoneRevealBeats,
  REVEAL_TIMING,
  titlesShown,
} from "./reveal-timeline";

function momentAt(index: number): Moment {
  return { index, beatId: null, elapsedMs: 0, live: true };
}

describe("hostRevealBeats", () => {
  it("starts with the replay beat and ends with next", () => {
    const beats = hostRevealBeats(2);
    expect(beats[0]).toEqual({ id: "replay", atMs: 0, cue: "whoosh" });
    expect(beats.at(-1)).toEqual({ id: "next", atMs: REVEAL_TIMING.nextMs, cue: "tape" });
  });

  it("has one title-N beat per title, all inside the titles window", () => {
    const beats = hostRevealBeats(3);
    const titleBeats = beats.filter((b) => b.id.startsWith("title-"));
    expect(titleBeats).toHaveLength(3);
    for (const beat of titleBeats) {
      expect(beat.atMs).toBeGreaterThanOrEqual(REVEAL_TIMING.titlesStartMs);
      expect(beat.atMs).toBeLessThan(REVEAL_TIMING.titlesStartMs + REVEAL_TIMING.titlesSpanMs);
    }
  });

  it("has no title beats when there are no titles", () => {
    const beats = hostRevealBeats(0);
    expect(beats.filter((b) => b.id.startsWith("title-"))).toHaveLength(0);
  });

  it("includes a truth beat before points and next", () => {
    const beats = hostRevealBeats(1);
    const truth = beats.find((b) => b.id === "truth");
    const points = beats.find((b) => b.id === "points");
    expect(truth?.atMs).toBe(REVEAL_TIMING.truthMs);
    expect(points?.atMs).toBe(REVEAL_TIMING.pointsMs);
    expect(truth?.atMs).toBeLessThan(points?.atMs ?? 0);
  });
});

describe("titlesShown", () => {
  it("is 0 before the first title beat", () => {
    const beats = hostRevealBeats(3);
    expect(titlesShown(beats, momentAt(0))).toBe(0);
  });

  it("counts every title beat reached, not beats of other kinds", () => {
    const beats = hostRevealBeats(3);
    const lastTitleIndex = beats.findIndex((b) => b.id === "title-2");
    expect(titlesShown(beats, momentAt(lastTitleIndex))).toBe(3);
  });

  it("is fully shown once the truth beat is reached", () => {
    const beats = hostRevealBeats(2);
    const truthIndex = beats.findIndex((b) => b.id === "truth");
    expect(titlesShown(beats, momentAt(truthIndex))).toBe(2);
  });
});

describe("personalReveal", () => {
  it("artist, nobody found it", () => {
    const result = personalReveal(en, {
      isArtist: true,
      myVote: null,
      truthOptionId: "o1",
      myPoints: 0,
      foundByCount: 0,
    });
    expect(result.headline).toBe("Nobody found it!");
    expect(result.celebrate).toBe(false);
  });

  it("artist, some players found it", () => {
    const result = personalReveal(en, {
      isArtist: true,
      myVote: null,
      truthOptionId: "o1",
      myPoints: 1000,
      foundByCount: 2,
    });
    expect(result.headline).toBe("They found you!");
    expect(result.sub).toContain("2 players");
    expect(result.celebrate).toBe(true);
  });

  it("voter who sat out", () => {
    const result = personalReveal(en, {
      isArtist: false,
      myVote: null,
      truthOptionId: "o1",
      myPoints: null,
      foundByCount: 0,
    });
    expect(result.headline).toBe("You sat this one out");
    expect(result.haptic).toBe("soft");
  });

  it("voter who found the truth", () => {
    const result = personalReveal(en, {
      isArtist: false,
      myVote: "o1",
      truthOptionId: "o1",
      myPoints: 500,
      foundByCount: 1,
    });
    expect(result.headline).toBe("You found it!");
    expect(result.celebrate).toBe(true);
  });

  it("voter who fooled someone with their own title", () => {
    const result = personalReveal(en, {
      isArtist: false,
      myVote: "o2",
      truthOptionId: "o1",
      myPoints: 500,
      foundByCount: 1,
    });
    expect(result.headline).toBe("You fooled someone!");
    expect(result.celebrate).toBe(true);
  });

  it("voter who neither found nor fooled", () => {
    const result = personalReveal(en, {
      isArtist: false,
      myVote: "o2",
      truthOptionId: "o1",
      myPoints: 0,
      foundByCount: 1,
    });
    expect(result.headline).toBe("Not this time");
    expect(result.haptic).toBe("caught");
  });

  it("returns Hebrew copy for the Hebrew dictionary", () => {
    const result = personalReveal(he, {
      isArtist: false,
      myVote: "o1",
      truthOptionId: "o1",
      myPoints: 500,
      foundByCount: 1,
    });
    expect(result.headline).toBe("מצאתם את זה!");
    expect(result.sub).toContain("500");
  });
});

describe("phoneRevealBeats", () => {
  it("places the personal beat after the truth beat by the default follow", () => {
    const beats = phoneRevealBeats("good");
    const personal = beats.find((b) => b.id === "personal");
    expect(personal?.atMs).toBe(REVEAL_TIMING.truthMs + 200);
    expect(personal?.haptic).toBe("good");
  });

  it("supports a zero follow for no-TV rooms", () => {
    const beats = phoneRevealBeats("good", 0);
    const personal = beats.find((b) => b.id === "personal");
    expect(personal?.atMs).toBe(REVEAL_TIMING.truthMs);
  });
});
