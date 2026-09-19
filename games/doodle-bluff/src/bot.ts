// A deterministic scribble a bot submits through the real chunk action, so the chunk path, the
// `from` check and doodle-done are all exercised by runBotPlaythrough.
import type { Rng } from "@opg/sdk";
import { GAP_MS_CAP, GRID, MAX_INK_INDEX, STROKE_MS_CAP, type Stroke } from "./state";

const BOT_STROKES = 3;
const BOT_POINTS_PER_STROKE = 8;
const BOT_STEP = 20;

function botStroke(rng: Rng): Stroke {
  const p: number[] = [rng.int(GRID), rng.int(GRID)];
  for (let i = 1; i < BOT_POINTS_PER_STROKE; i += 1) {
    p.push(rng.int(2 * BOT_STEP + 1) - BOT_STEP, rng.int(2 * BOT_STEP + 1) - BOT_STEP);
  }
  return {
    c: rng.int(MAX_INK_INDEX + 1),
    d: rng.int(STROKE_MS_CAP + 1),
    g: rng.int(GAP_MS_CAP + 1),
    p,
  };
}

/** Three strokes of eight points each, well under every cap. */
export function botDoodle(rng: Rng): Stroke[] {
  const strokes: Stroke[] = [];
  for (let i = 0; i < BOT_STROKES; i += 1) strokes.push(botStroke(rng));
  return strokes;
}
