// The two things about the reveal's layout that content decides rather than design: how big
// the answer can be drawn, and how tight the lies table has to be to hold every lie.
//
// ---------- The answer ----------
//
// How big the revealed answer can be drawn before it stops fitting the truth card.
//
// The answer is content, not design: a pack decides whether this fact's answer is "emus" or
// "laser pointer" (the longest any real-or-nah pack ships, held there by
// scripts/content-stress.test.ts), and both have to land in the same card at the same beat.
//
// This sizes by the whole string rather than by its longest word — unlike `fitTextSize` in
// @opg/ui, which sizes headings that are allowed to wrap. The answer is not: it sits inside a
// `Highlight`, whose swipe is one bar drawn behind the whole span, so a two-line answer gets a
// single bar through the middle of both lines instead of one under each.
//
// `BODY_ADVANCE` is an estimate for Atkinson Hyperlegible bold, set deliberately wider than the
// face actually measures so the result errs small. The real guard is the layout suite: the
// worst-case reveal fixture renders this at 1920x1080 and fails if the answer crosses the card.

/**
 * The truth card's width on the 1920x1080 stage, and the padding inside it. They live here
 * rather than in HostReveal.tsx because the answer's size is derived from them, and a card
 * narrowed without re-checking that derivation is how the longest answer stops fitting.
 */
export const TRUTH_CARD_WIDTH = 480;
export const TRUTH_CARD_PADDING = 28;
/** What the answer has to fit in: the card, less its padding and the highlighter swipe's own. */
export const ANSWER_WIDTH = TRUTH_CARD_WIDTH - 2 * TRUTH_CARD_PADDING - 2 * 12;

/** The design's size for a short answer (design/TVRealOrNahReveal.dc.html). */
export const ANSWER_MAX = 96;
/**
 * Well clear of the 28px TV floor, however long the answer is. It is a backstop for an answer
 * longer than any pack ships, not a size the longest shipped answer should land on: if it ever
 * clamps here for real content, the card has stopped being wide enough — see the test.
 */
export const ANSWER_MIN = 40;
/** Average glyph advance as a fraction of font size, with margin, for Atkinson bold. */
export const BODY_ADVANCE = 0.7;

const SEGMENTER = new Intl.Segmenter();

/** Characters a reader sees, counting an emoji or a combining pair as one (as @opg/ui's text-fit does). */
function graphemeCount(text: string): number {
  return [...SEGMENTER.segment(text)].length;
}

/** The largest size in [ANSWER_MIN, ANSWER_MAX] at which `answer` still fits `widthPx` on one line. */
export function answerSize(answer: string, widthPx: number): number {
  const chars = graphemeCount(answer);
  if (chars === 0) return ANSWER_MAX;
  const fits = Math.floor(widthPx / (chars * BODY_ADVANCE));
  return Math.min(ANSWER_MAX, Math.max(ANSWER_MIN, fits));
}

// ---------- The lies table ----------

export interface TableDensity {
  /** The lie's own text. Never below the TV's 28px floor. */
  fontSize: number;
  /** The author's avatar, beside their name. */
  avatarSize: number;
  paddingY: number;
  rowGap: number;
  minHeight: number;
  /** The lie's line box. Two wrapped lines of a 40-character lie set every row's height. */
  lineHeight: number;
  /** "The lies", and the gap under it. */
  headingSize: number;
  headingGap: number;
}

const ROOMY: TableDensity = {
  fontSize: 30,
  avatarSize: 44,
  paddingY: 10,
  rowGap: 10,
  minHeight: 76,
  lineHeight: 1.2,
  headingSize: 44,
  headingGap: 12,
};

const TIGHT: TableDensity = {
  fontSize: 28,
  avatarSize: 40,
  paddingY: 4,
  rowGap: 5,
  minHeight: 60,
  lineHeight: 1.1,
  headingSize: 34,
  headingGap: 8,
};

/** Above this many rows the table has to give up its breathing room to fit the stage. */
export const ROOMY_ROW_LIMIT = 6;

/**
 * How tight the table has to be to hold `rowCount` rows.
 *
 * A full room is eight players, every one of whom may write a lie at LIE_MAX_LENGTH, and
 * nothing caps the option list — so the table has to hold eight rows of 40-character text
 * inside 1080px that does not scroll. Six rows or fewer fit comfortably; past that the rows
 * trade padding and two points of type for the height, rather than running off the bottom.
 * Both settings stay at or above the 28px TV floor; e2e/layout holds this against the
 * worst-case fixtures in preview.ts.
 */
export function tableDensity(rowCount: number): TableDensity {
  return rowCount > ROOMY_ROW_LIMIT ? TIGHT : ROOMY;
}

/**
 * The fooled avatars shrink once there are enough of them to wrap their column. Seven is the
 * most one lie can take — everyone in a full room but its author — and seven at the roomy size
 * wrap to a second line, which makes that one row half again as tall as every other.
 */
export function fooledAvatarSize(count: number): number {
  if (count > 6) return 28;
  return count > 4 ? 32 : 40;
}

/**
 * Past this many finders the truth card lists names instead of avatar tags.
 *
 * A name at NAME_MAX_LENGTH will not share a line with another inside the card, so every tag
 * costs a full row: all eight players finding the truth — which is exactly when every lie is
 * a dud and the table below is at its longest — ran the card 137px off the bottom of the
 * stage. A joined list of the same names wraps at about three names to the line.
 */
export const FINDER_TAG_LIMIT = 4;

/** Whether the truth card can afford an avatar tag per finder, or has to join their names. */
export function showsFinderTags(finderCount: number): boolean {
  return finderCount <= FINDER_TAG_LIMIT;
}
