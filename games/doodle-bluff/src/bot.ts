// A deterministic scribble a bot submits through the real chunk action, so the chunk path, the
// `from` check and doodle-done are all exercised by runBotPlaythrough.
import { GAP_MS_CAP, GRID, MAX_INK_INDEX, STROKE_MS_CAP, type Rng, type Stroke } from "@opg/sdk";

const BOT_STROKES = 5;
const BOT_POINTS_PER_STROKE = 40;
const BOT_STEP = 70;
/** Strokes start away from the edges, so a long walk has room before it has to turn back. */
const BOT_MARGIN = 200;

/** A step of up to BOT_STEP either way that keeps `at` inside the grid. */
function botStep(rng: Rng, at: number): number {
  const lo = Math.max(-BOT_STEP, -at);
  const hi = Math.min(BOT_STEP, GRID - 1 - at);
  return lo + rng.int(hi - lo + 1);
}

function botStroke(rng: Rng): Stroke {
  let x = BOT_MARGIN + rng.int(GRID - 2 * BOT_MARGIN);
  let y = BOT_MARGIN + rng.int(GRID - 2 * BOT_MARGIN);
  const p: number[] = [x, y];
  for (let i = 1; i < BOT_POINTS_PER_STROKE; i += 1) {
    const dx = botStep(rng, x);
    const dy = botStep(rng, y);
    x += dx;
    y += dy;
    p.push(dx, dy);
  }
  return {
    c: rng.int(MAX_INK_INDEX + 1),
    d: rng.int(STROKE_MS_CAP + 1),
    g: rng.int(GAP_MS_CAP + 1),
    p,
  };
}

/** Five strokes of forty points each, on the grid and well under every cap. */
export function botDoodle(rng: Rng): Stroke[] {
  const strokes: Stroke[] = [];
  for (let i = 0; i < BOT_STROKES; i += 1) strokes.push(botStroke(rng));
  return strokes;
}
