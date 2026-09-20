// Pure geometry over plain numbers: pointer-to-grid mapping, simplification and delta encoding.
// happy-dom's Element.getBoundingClientRect() returns an all-zero DOMRect, so every caller passes
// its own rect and these functions never touch the DOM (plan/0003-doodle-bluff.md).
import type { Doodle, GridPoint } from "./types";
import { GRID, MIN_STEP, RDP_EPSILON } from "./types";

/** A plain rect, because happy-dom hands components an all-zero DOMRect. */
export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Maps a client-space pointer position into a 1024-unit grid square, clamped to the box. */
export function gridPointOf(
  clientX: number,
  clientY: number,
  rect: ClientRectLike,
): GridPoint {
  const width = rect.width || 1;
  const height = rect.height || 1;
  const fx = clamp01((clientX - rect.left) / width);
  const fy = clamp01((clientY - rect.top) / height);
  return [Math.round(fx * (GRID - 1)), Math.round(fy * (GRID - 1))];
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Drops a sample within MIN_STEP grid units of the last kept point; always keeps the last point. */
function dropCloseSamples(points: readonly GridPoint[]): GridPoint[] {
  const [first, ...rest] = points;
  if (first === undefined) return [];
  const kept: GridPoint[] = [first];
  let lastKept = first;
  const lastIndex = points.length - 1;
  rest.forEach((point, offset) => {
    const i = offset + 1;
    if (i === lastIndex || distance(lastKept, point) >= MIN_STEP) {
      kept.push(point);
      lastKept = point;
    }
  });
  return kept;
}

function perpendicularDistance(
  point: GridPoint,
  start: GridPoint,
  end: GridPoint,
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  const px = start[0] + t * dx;
  const py = start[1] + t * dy;
  return Math.hypot(point[0] - px, point[1] - py);
}

interface FarthestPoint {
  distance: number;
  index: number;
}

/** The interior point farthest from the start-end chord, among points[1..last-1]. */
function farthestFromChord(
  points: readonly GridPoint[],
  start: GridPoint,
  end: GridPoint,
  last: number,
): FarthestPoint {
  let found: FarthestPoint = { distance: 0, index: 0 };
  for (let i = 1; i < last; i += 1) {
    const point = points[i];
    if (point === undefined) continue; // unreachable: 0 < i < last <= points.length - 1
    const dist = perpendicularDistance(point, start, end);
    if (dist > found.distance) found = { distance: dist, index: i };
  }
  return found;
}

/** Ramer-Douglas-Peucker: keeps only the points that shape the line within epsilon. */
function rdp(points: readonly GridPoint[], epsilon: number): GridPoint[] {
  const last = points.length - 1;
  if (last < 2) return [...points];
  const start = points[0];
  const end = points[last];
  if (start === undefined || end === undefined) return [...points]; // unreachable: last >= 2
  const farthest = farthestFromChord(points, start, end, last);
  if (farthest.distance <= epsilon) return [start, end];
  const left = rdp(points.slice(0, farthest.index + 1), epsilon);
  const right = rdp(points.slice(farthest.index), epsilon);
  return [...left.slice(0, -1), ...right];
}

/**
 * Drops close samples, then Ramer-Douglas-Peucker. Changes point count, never a stroke's `d`,
 * so it never distorts rhythm.
 */
export function simplifyStroke(points: readonly GridPoint[]): GridPoint[] {
  return rdp(dropCloseSamples(points), RDP_EPSILON);
}

/** [x0, y0, dx1, dy1, ...] — first point absolute, later points deltas. */
export function deltaEncode(points: readonly GridPoint[]): number[] {
  const [first, ...rest] = points;
  if (first === undefined) return [];
  const out: number[] = [first[0], first[1]];
  let prev = first;
  for (const point of rest) {
    out.push(point[0] - prev[0], point[1] - prev[1]);
    prev = point;
  }
  return out;
}

/** Inverse of deltaEncode. */
export function deltaDecode(p: readonly number[]): GridPoint[] {
  const [x0, y0] = p;
  if (x0 === undefined || y0 === undefined) return [];
  const points: GridPoint[] = [[x0, y0]];
  let [px, py] = [x0, y0];
  for (let i = 2; i + 1 < p.length; i += 2) {
    const dx = p[i];
    const dy = p[i + 1];
    if (dx === undefined || dy === undefined) break; // unreachable: i + 1 < p.length
    [px, py] = [px + dx, py + dy];
    points.push([px, py]);
  }
  return points;
}

export interface DoodleBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The [0, GRID) box every drawn point falls in; an untouched doodle bounds to a single point. */
export function doodleBounds(doodle: Doodle): DoodleBounds {
  let minX = GRID - 1;
  let minY = GRID - 1;
  let maxX = 0;
  let maxY = 0;
  let touched = false;
  for (const stroke of doodle.s) {
    for (const [x, y] of deltaDecode(stroke.p)) {
      touched = true;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!touched) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}
