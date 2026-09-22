import { describe, expect, it } from "vitest";
import type { Beat, Moment } from "@opg/ui";
import { en, he } from "@opg/i18n";
import { revealDurationMs, revealPlan } from "../reveal-plan";
import type { RevealSegment } from "../reveal-plan";
import { planLiesOf, type RonReveal } from "../types";
import {
  callout,
  hostRevealBeats,
  personalCardBeats,
  personalRevealCards,
  revealProgress,
} from "./reveal-timeline";

const MAYA = "maya";
const DOV = "dov";
const SAM = "sam";
const NOA = "noa";
const LEO = "leo";

function lie(optionId: string, fooledCount: number) {
  return { optionId, fooledCount };
}

function moment(beats: readonly Beat[], index: number, live = false): Moment {
  return {
    index,
    beatId: beats[index]?.id ?? null,
    elapsedMs: beats[index]?.atMs ?? 0,
    live,
  };
}

function isSorted(beats: readonly Beat[]): boolean {
  for (let i = 1; i < beats.length; i += 1) {
    const prev = beats[i - 1];
    const cur = beats[i];
    if (prev === undefined || cur === undefined) return false;
    if (cur.atMs < prev.atMs) return false;
  }
  return true;
}

const REVEAL: RonReveal = {
  truthOptionId: "o3",
  answer: "emus",
  source: { title: "Emu War", url: "https://en.wikipedia.org/wiki/Emu_War" },
  foundByIds: [MAYA, LEO],
  lies: [
    { optionId: "o4", text: "cane toads", authorId: DOV, fooledIds: [SAM, NOA], points: 1000 },
    { optionId: "o1", text: "rabbits", authorId: NOA, fooledIds: [MAYA], points: 500 },
    { optionId: "o5", text: "koalas", authorId: SAM, fooledIds: [], points: 0 },
  ],
};

const NAMES = {
  [MAYA]: "Maya",
  [DOV]: "Dov",
  [SAM]: "Sam",
  [NOA]: "Noa",
  [LEO]: "Leo",
} satisfies Record<string, string>;

describe("hostRevealBeats", () => {
  const segments = revealPlan({ lies: planLiesOf(REVEAL) });

  it("lays out sorted beats that finish before the reveal ends", () => {
    const beats = hostRevealBeats(segments);
    expect(isSorted(beats)).toBe(true);
    const last = beats[beats.length - 1];
    expect(last).toBeDefined();
    expect(last?.atMs ?? 0).toBeLessThan(
      revealDurationMs({ lies: planLiesOf(REVEAL) }),
    );
  });

  it("plays the intro, duds and truth cues at the segment boundaries", () => {
    const beats = hostRevealBeats(segments);
    const intro = beats.find((b) => b.id === "intro");
    expect(intro).toEqual({ id: "intro", atMs: 0, cue: "whoosh" });
    const duds = beats.find((b) => b.id === "duds");
    expect(duds?.cue).toBe("tape");
    const truthIn = beats.find((b) => b.id === "truth-in");
    expect(truthIn?.cue).toBe("drumroll");
  });

  it("emits the first lie's beats at the documented offsets", () => {
    const beats = hostRevealBeats(segments);
    const lieSegment = segments.find((s) => s.kind === "lie");
    expect(lieSegment).toBeDefined();
    const d = lieSegment?.durationMs ?? 0;
    const at = lieSegment?.atMs ?? 0;
    expect(beats.find((b) => b.id === "lie-0-in")).toEqual({
      id: "lie-0-in",
      atMs: at,
      cue: "whoosh",
    });
    expect(beats.find((b) => b.id === "lie-0-fooled")?.atMs).toBe(
      Math.round(at + 0.17 * d),
    );
    expect(beats.find((b) => b.id === "lie-0-author")?.atMs).toBe(
      Math.round(at + 0.5 * d),
    );
    expect(beats.find((b) => b.id === "lie-0-points")?.atMs).toBe(
      Math.round(at + 0.7 * d),
    );
  });

  it("cues the first lie's beats pop, slam, then boing", () => {
    const beats = hostRevealBeats(segments);
    expect(beats.find((b) => b.id === "lie-0-fooled")?.cue).toBe("pop");
    expect(beats.find((b) => b.id === "lie-0-author")?.cue).toBe("slam");
    expect(beats.find((b) => b.id === "lie-0-points")?.cue).toBe("boing");
  });

  it("emits the standings beats with no cue on the count beat", () => {
    const beats = hostRevealBeats(segments);
    const standingsIn = beats.find((b) => b.id === "standings-in");
    expect(standingsIn?.cue).toBe("whoosh");
    const count = beats.find((b) => b.id === "standings-count");
    expect(count?.cue).toBeUndefined();
    const reorder = beats.find((b) => b.id === "standings-reorder");
    expect(reorder?.cue).toBe("whoosh");
  });

  it("numbers lie segments in the plan's order (fewest fooled first)", () => {
    const beats = hostRevealBeats(segments);
    // REVEAL has two foolers (o4 fooled 2, o1 fooled 1) and one dud (o5); the plan
    // orders foolers ascending, so lie-0 is o1 (1 fooled) and lie-1 is o4 (2 fooled).
    expect(beats.some((b) => b.id === "lie-1-in")).toBe(true);
    expect(beats.some((b) => b.id === "lie-2-in")).toBe(false);
  });

  it("is empty and duds-free for an all-duds reveal", () => {
    const allDuds: RevealSegment[] = revealPlan({
      lies: [lie("o1", 0), lie("o2", 0)],
    });
    const beats = hostRevealBeats(allDuds);
    expect(beats.some((b) => b.id.startsWith("lie-"))).toBe(false);
    expect(beats.some((b) => b.id === "duds")).toBe(true);
  });
});

describe("revealProgress", () => {
  const segments = revealPlan({ lies: planLiesOf(REVEAL) });
  const beats = hostRevealBeats(segments);

  it("reports nothing shown before the first beat", () => {
    const progress = revealProgress(segments, beats, moment(beats, -1));
    expect(progress.dudsShown).toBe(false);
    expect(progress.truthShown).toBe(false);
    expect(progress.lies.every((l) => !l.shown)).toBe(true);
  });

  it("reveals lies one stage at a time as beats are reached", () => {
    const fooledIndex = beats.findIndex((b) => b.id === "lie-0-fooled");
    const progress = revealProgress(segments, beats, moment(beats, fooledIndex));
    const lie0 = progress.lies.find((l) => l.index === 0);
    expect(lie0?.shown).toBe(true);
    expect(lie0?.fooledShown).toBe(true);
    expect(lie0?.flipped).toBe(false);
    expect(lie0?.pointsShown).toBe(false);
  });

  it("marks the truth stamped and standings counted once reached", () => {
    const truthRealIndex = beats.findIndex((b) => b.id === "truth-real");
    const truth = revealProgress(segments, beats, moment(beats, truthRealIndex, true));
    expect(truth.truthShown).toBe(true);
    expect(truth.truthStamped).toBe(true);
    expect(truth.truthStampedLive).toBe(true);

    const countIndex = beats.findIndex((b) => b.id === "standings-count");
    const standings = revealProgress(segments, beats, moment(beats, countIndex));
    expect(standings.standingsCountReached).toBe(true);
    expect(standings.standingsReorderReached).toBe(false);
  });

  it("settles everything once the last beat is reached with live false", () => {
    const progress = revealProgress(
      segments,
      beats,
      moment(beats, beats.length - 1, false),
    );
    expect(progress.standingsReorderReached).toBe(true);
    expect(progress.lies.every((l) => l.pointsShown)).toBe(true);
    expect(progress.lies.every((l) => !l.live.author)).toBe(true);
  });
});

describe("callout", () => {
  it("says everyone when every voter was fooled and there are at least two", () => {
    expect(callout(en, 2, 2)).toBe("Fooled everyone!");
    expect(callout(en, 4, 4)).toBe("Fooled everyone!");
  });

  it("says the count once at least three were fooled without fooling everyone", () => {
    expect(callout(en, 3, 5)).toBe("Fooled 3 people!");
  });

  it("is null otherwise", () => {
    expect(callout(en, 0, 5)).toBeNull();
    expect(callout(en, 1, 5)).toBeNull();
    expect(callout(en, 2, 5)).toBeNull();
  });

  it("routes through the Hebrew dictionary too", () => {
    expect(callout(he, 2, 2)).toBe("רימו את כולם!");
    expect(callout(he, 3, 5)).toBe("רימו 3 אנשים!");
  });
});

describe("personalRevealCards", () => {
  const segments = revealPlan({ lies: planLiesOf(REVEAL) });

  it("gives the author of a fooling lie a celebration card", () => {
    const cards = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: DOV,
      names: NAMES,
      standingsOrdinal: 1,
      myPointsThisFact: 1000,
    });
    const authored = cards.find((c) => c.id === "author-fooled");
    expect(authored).toBeDefined();
    expect(authored?.headline).toBe("You fooled Sam and Noa!");
    expect(authored?.sub).toBe("+1,000");
    expect(authored?.haptic).toBe("good");
    expect(authored?.celebrate).toBe(true);
    expect(cards.some((c) => c.id === "duds")).toBe(false);
  });

  it("gives a fooled voter a soft card naming the author and the lie", () => {
    const cards = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: MAYA,
      names: NAMES,
      standingsOrdinal: 2,
      myPointsThisFact: 0,
    });
    const fooled = cards.find((c) => c.id === "fooled-by");
    expect(fooled).toBeDefined();
    expect(fooled?.headline).toBe("Noa's lie got you");
    expect(fooled?.sub).toBe('"rabbits"');
    expect(fooled?.haptic).toBe("soft");
  });

  it("gives a dud author a soft 'fooled nobody' card", () => {
    const cards = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: SAM,
      names: NAMES,
      standingsOrdinal: 4,
      myPointsThisFact: 0,
    });
    const duds = cards.find((c) => c.id === "duds");
    expect(duds).toEqual(
      expect.objectContaining({ headline: "Your lie fooled nobody", haptic: "soft" }),
    );
  });

  it("gives the finder a celebration card and everyone else a plain truth card", () => {
    const found = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: MAYA,
      names: NAMES,
      standingsOrdinal: 1,
      myPointsThisFact: 1000,
    }).find((c) => c.id === "truth-found");
    expect(found?.headline).toBe("You found it!");
    expect(found?.celebrate).toBe(true);

    const missed = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: SAM,
      names: NAMES,
      standingsOrdinal: 4,
      myPointsThisFact: 0,
    }).find((c) => c.id === "truth-missed");
    expect(missed?.headline).toBe("The truth: emus");
    expect(missed?.celebrate).toBe(false);
  });

  it("always adds a standings card with no haptic", () => {
    const cards = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: SAM,
      names: NAMES,
      standingsOrdinal: 3,
      myPointsThisFact: 0,
    });
    const standings = cards.find((c) => c.id === "standings");
    expect(standings?.headline).toBe("You're 3rd");
    expect(standings?.sub).toBe("+0 this fact");
    expect(standings?.haptic).toBeUndefined();
  });

  it("orders cards chronologically by atMs", () => {
    const cards = personalRevealCards(en, {
      segments,
      reveal: REVEAL,
      me: DOV,
      names: NAMES,
      standingsOrdinal: 1,
      myPointsThisFact: 1000,
    });
    for (let i = 1; i < cards.length; i += 1) {
      const a = cards[i - 1];
      const b = cards[i];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect((b?.atMs ?? 0) >= (a?.atMs ?? 0)).toBe(true);
    }
  });

  it("names the place in words in Hebrew, with no digit and no suffix rule", () => {
    const cards = personalRevealCards(he, {
      segments,
      reveal: REVEAL,
      me: SAM,
      names: NAMES,
      standingsOrdinal: 3,
      myPointsThisFact: 0,
    });
    const standings = cards.find((c) => c.id === "standings");
    // English builds "3rd" from a suffix rule; Hebrew has no such rule, so the place is
    // a word from the dictionary and the headline carries no digit at all.
    expect(standings?.headline).toBe("אתם במקום השלישי");
    expect(standings?.headline).not.toMatch(/\d/);
    expect(standings?.sub).toBe("+0 בעובדה הזו");

    const authored = personalRevealCards(he, {
      segments,
      reveal: REVEAL,
      me: DOV,
      names: NAMES,
      standingsOrdinal: 1,
      myPointsThisFact: 1000,
    }).find((c) => c.id === "author-fooled");
    expect(authored?.headline).toBe("רימיתם את Sam וNoa!");
  });
});

describe("personalCardBeats", () => {
  it("carries each card's id, atMs and optional haptic into a Beat", () => {
    const cards = personalRevealCards(en, {
      segments: revealPlan({ lies: planLiesOf(REVEAL) }),
      reveal: REVEAL,
      me: DOV,
      names: NAMES,
      standingsOrdinal: 1,
      myPointsThisFact: 1000,
    });
    const beats = personalCardBeats(cards);
    expect(beats).toHaveLength(cards.length);
    const standings = beats.find((b) => b.id === "standings");
    expect(standings?.haptic).toBeUndefined();
    const authored = beats.find((b) => b.id === "author-fooled");
    expect(authored?.haptic).toBe("good");
  });
});
