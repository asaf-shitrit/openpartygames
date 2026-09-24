// Picking a heading size that fits the space it has.
//
// Content decides how long a word is: a pack can ship "flight attendant" where the design was
// drawn with "zebra". A fixed font size is a bet that every word is short, and the bet loses
// off the right edge of a phone. This sizes the text instead.
//
// The estimate: measured in a real browser, in the running app, against the exact Permanent
// Marker font file this package ships (packages/ui's @fontsource/permanent-marker), by forcing
// the face to finish loading and then comparing a span's rendered width to a canvas
// `measureText` call using the same font string — the two agree, and so does the same file
// loaded in isolation from a data URI, so this is the font's own metrics, not a measurement
// artifact. Most English words run a glyph advance around 0.5-0.6 of the font size, but a word
// concentrated in wide letters like m and w runs higher — real pack words already shipped in
// packs/imposter measure "owl" 0.66 and "mop" 0.65; "mammogram" and "meowmeow" (not shipped,
// but plausible) measure 0.69 and 0.70. All of those clear the old constant, 0.62, meaning it
// could already undersize a container for a word on the shelf today, not just a hypothetical
// one. The ratio below carries a further margin over the worst word found, so one a little more
// concentrated than anything shipped today still fits.
// e2e/layout/text-fit-model.spec.ts holds this ratio against the real packs and the real
// Permanent Marker font file in a browser (forcing the font to finish loading first, the same
// way), since checking it needs both and this file stays dependency-free.
//
// It sizes to the longest word rather than the whole string, because the containers that use
// it wrap. Two big lines read better on a phone than one shrunk to nothing.

/** Average glyph advance as a fraction of font size, with margin, for Permanent Marker. */
export const MARKER_ADVANCE = 0.75;

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
