import { describe, expect, it } from "vitest";
import {
  ANSWER_MAX,
  ANSWER_MIN,
  ANSWER_WIDTH,
  answerSize,
  BODY_ADVANCE,
  fooledAvatarSize,
  FINDER_TAG_LIMIT,
  ROOMY_ROW_LIMIT,
  showsFinderTags,
  tableDensity,
} from "./reveal-layout";

/** The longest answer any real-or-nah pack ships, held there by scripts/content-stress.test.ts. */
const LONGEST_PACK_ANSWER = "laser pointer";

describe("answerSize", () => {
  it("draws a short answer at the design's size", () => {
    expect(answerSize("emus", ANSWER_WIDTH)).toBe(ANSWER_MAX);
  });

  it("shrinks the longest answer any pack ships until it fits the card on one line", () => {
    const size = answerSize(LONGEST_PACK_ANSWER, ANSWER_WIDTH);
    expect(size).toBeLessThan(ANSWER_MAX);
    // Above the floor, so the fit is the estimate's doing and not the clamp's: a card narrow
    // enough to push this answer down to ANSWER_MIN would overflow instead of shrinking.
    expect(size).toBeGreaterThan(ANSWER_MIN);
    // The whole string across, not just its longest word.
    expect(size * LONGEST_PACK_ANSWER.length * BODY_ADVANCE).toBeLessThanOrEqual(ANSWER_WIDTH);
  });

  it("never goes below the floor, however long the answer", () => {
    expect(answerSize("a".repeat(200), ANSWER_WIDTH)).toBe(ANSWER_MIN);
  });

  it("counts an emoji as one character rather than its code points", () => {
    // One grapheme built from five code points: sizing by code points would shrink a single
    // glyph towards the floor.
    expect(answerSize("\u{1F469}\u200D\u{1F469}\u200D\u{1F467}", ANSWER_WIDTH)).toBe(ANSWER_MAX);
  });

  it("falls back to the design size for an empty answer", () => {
    expect(answerSize("", ANSWER_WIDTH)).toBe(ANSWER_MAX);
  });
});

describe("tableDensity", () => {
  it("leaves a short table roomy", () => {
    expect(tableDensity(3)).toEqual(tableDensity(ROOMY_ROW_LIMIT));
    expect(tableDensity(3).fontSize).toBeGreaterThan(28);
  });

  it("tightens past the roomy limit so eight rows still fit the stage", () => {
    const tight = tableDensity(ROOMY_ROW_LIMIT + 1);
    const roomy = tableDensity(ROOMY_ROW_LIMIT);
    expect(tight.minHeight).toBeLessThan(roomy.minHeight);
    expect(tight.paddingY).toBeLessThan(roomy.paddingY);
    expect(tight.rowGap).toBeLessThan(roomy.rowGap);
  });

  it("never drops a lie below the 28px TV floor, at any row count", () => {
    for (let rows = 1; rows <= 8; rows += 1) {
      expect(tableDensity(rows).fontSize).toBeGreaterThanOrEqual(28);
    }
  });
});

describe("fooledAvatarSize", () => {
  it("keeps a handful of avatars at full size", () => {
    expect(fooledAvatarSize(1)).toBe(fooledAvatarSize(4));
  });

  it("shrinks once there are more than a column's worth", () => {
    // Seven is the most one lie can take: everyone in a full room but its own author.
    expect(fooledAvatarSize(7)).toBeLessThan(fooledAvatarSize(4));
  });
});

describe("showsFinderTags", () => {
  it("keeps avatar tags while a handful of players found the truth", () => {
    expect(showsFinderTags(1)).toBe(true);
    expect(showsFinderTags(FINDER_TAG_LIMIT)).toBe(true);
  });

  it("drops to a joined list once a full room finds it", () => {
    expect(showsFinderTags(FINDER_TAG_LIMIT + 1)).toBe(false);
    expect(showsFinderTags(8)).toBe(false);
  });
});
