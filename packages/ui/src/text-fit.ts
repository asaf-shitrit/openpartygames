// Picking a heading size that fits the space it has.
//
// Content decides how long a word is: a pack can ship "flight attendant" where the design was
// drawn with "zebra". A fixed font size is a bet that every word is short, and the bet loses
// off the right edge of a phone. This sizes the text instead.
//
// The estimate: in Permanent Marker a character's advance averages about 0.52 of the font
// size (measured at 72px: 0.506 for "flight attendant", 0.516 for "aeiounrst"). The ratio
// below carries a margin over that for words built from wide letters like m and w.
//
// It sizes to the longest word rather than the whole string, because the containers that use
// it wrap. Two big lines read better on a phone than one shrunk to nothing.

/** Average glyph advance as a fraction of font size, with margin, for Permanent Marker. */
export const MARKER_ADVANCE = 0.62;

export interface FitOptions {
  /** The size to use when the text fits with room to spare. */
  max: number;
  /** Never go below this, however long the word is. */
  min: number;
  /** The width the text has to live in, in px. */
  widthPx: number;
  /** Average glyph advance as a fraction of font size. Defaults to Permanent Marker's. */
  advance?: number;
}

const SEGMENTER = new Intl.Segmenter();

/** Characters a reader sees, counting an emoji or a combining pair as one. */
function graphemeCount(word: string): number {
  return [...SEGMENTER.segment(word)].length;
}

/** Characters in the longest whitespace-separated word. */
export function longestWordLength(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let longest = 0;
  for (const word of words) longest = Math.max(longest, graphemeCount(word));
  return longest;
}

/**
 * The largest size in [min, max] at which the longest word in `text` still fits `widthPx`.
 * Text short enough to fit gets `max`; nothing ever goes below `min`, so a pathological word
 * clamps and wraps rather than shrinking into illegibility.
 */
export function fitTextSize(text: string, options: FitOptions): number {
  const { max, min, widthPx, advance = MARKER_ADVANCE } = options;
  const longest = longestWordLength(text);
  if (longest === 0) return max;
  const fits = Math.floor(widthPx / (longest * advance));
  return Math.min(max, Math.max(min, fits));
}
