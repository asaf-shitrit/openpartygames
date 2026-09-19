// Doodle rendering: the shared shell the pad, the phone's read-only view, the TV and the gallery
// all call. Takes a narrow structural context (a real CanvasRenderingContext2D satisfies it) so
// painting can be tested with a plain recording object, no cast required — the exact pattern
// confetti-paint.ts uses (plan/0003-doodle-bluff.md).
import { deltaDecode } from "./geometry";
import type { Doodle, GridPoint, Stroke } from "./types";
import { GRID } from "./types";

/** The drawing surface paintDoodle needs; a real CanvasRenderingContext2D satisfies it. */
export interface DoodleCanvasContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
}

export interface DoodleBox {
  width: number;
  height: number;
  /** Stroke width in the box's own units; defaults to 4, the kit's ink-border weight. */
  lineWidth?: number;
}

/** How much of the doodle to paint: strokes before `current` are done, `current` is `fraction` in. */
export interface DoodleUpTo {
  complete: number;
  current: number | null;
  fraction: number;
}

/** Bundled so paintDoodle and its helpers stay within the four-parameter lint ceiling. */
export interface DoodlePaintOptions {
  inks: readonly string[];
  box: DoodleBox;
  upTo?: DoodleUpTo;
}

function scalePoint([x, y]: GridPoint, box: DoodleBox): GridPoint {
  return [(x / (GRID - 1)) * box.width, (y / (GRID - 1)) * box.height];
}

/** Points of a partially-drawn stroke, rounding up so a stroke always shows at least its start. */
function pointsUpToFraction(points: readonly GridPoint[], fraction: number): GridPoint[] {
  if (points.length <= 1) return [...points];
  const count = Math.min(
    points.length,
    Math.max(1, Math.ceil(fraction * (points.length - 1)) + 1),
  );
  return points.slice(0, count);
}

/** Which points of this stroke to draw, or null to skip it entirely. */
function visiblePoints(
  stroke: Stroke,
  index: number,
  upTo: DoodleUpTo | undefined,
): GridPoint[] | null {
  const points = deltaDecode(stroke.p);
  if (!upTo) return points;
  if (index < upTo.complete) return points;
  if (index === upTo.current) return pointsUpToFraction(points, upTo.fraction);
  return null;
}

function strokePath(ctx: DoodleCanvasContext, points: readonly GridPoint[], box: DoodleBox): void {
  const [head, ...rest] = points;
  if (head === undefined) return; // unreachable: paintStroke only calls this with points.length > 0
  ctx.beginPath();
  const [startX, startY] = scalePoint(head, box);
  ctx.moveTo(startX, startY);
  if (rest.length === 0) {
    ctx.lineTo(startX, startY);
  } else {
    for (const point of rest) {
      const [x, y] = scalePoint(point, box);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

function paintStroke(
  ctx: DoodleCanvasContext,
  stroke: Stroke,
  points: readonly GridPoint[],
  view: Pick<DoodlePaintOptions, "inks" | "box">,
): void {
  if (points.length === 0) return;
  ctx.strokeStyle = view.inks[stroke.c] ?? view.inks[0] ?? "#2B2B2B";
  ctx.lineWidth = view.box.lineWidth ?? 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokePath(ctx, points, view.box);
}

/** Clears the box and paints every visible stroke, in draw order. */
export function paintDoodle(
  ctx: DoodleCanvasContext,
  doodle: Doodle,
  options: DoodlePaintOptions,
): void {
  const { inks, box, upTo } = options;
  ctx.save();
  ctx.clearRect(0, 0, box.width, box.height);
  doodle.s.forEach((stroke, index) => {
    const points = visiblePoints(stroke, index, upTo);
    if (points) paintStroke(ctx, stroke, points, { inks, box });
  });
  ctx.restore();
}
