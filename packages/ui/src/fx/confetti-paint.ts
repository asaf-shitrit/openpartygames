// Doodle-notebook confetti rendering: ink-outlined paper scraps, marker stars
// and squiggles. Takes a narrow structural context (a real
// CanvasRenderingContext2D satisfies it) so painting can be tested with a
// plain recording object, no cast required.
import type { Particle } from "./confetti-physics";

const INK = "#2B2B2B";

/** The drawing surface Confetti needs; a real CanvasRenderingContext2D satisfies it. */
export interface ConfettiCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
}

export interface ConfettiPainter {
  clear(width: number, height: number): void;
  drawParticle(particle: Particle): void;
}

function drawScrap(ctx: ConfettiCanvasContext, particle: Particle): void {
  const half = particle.size / 2;
  ctx.beginPath();
  ctx.moveTo(-half * 0.9, -half);
  ctx.lineTo(half, -half * 0.75);
  ctx.lineTo(half * 0.85, half);
  ctx.lineTo(-half, half * 0.8);
  ctx.closePath();
  ctx.fillStyle = particle.color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = particle.size / 8;
  ctx.stroke();
}

const STAR_POINTS = 5;

function drawStar(ctx: ConfettiCanvasContext, particle: Particle): void {
  const outer = particle.size / 2;
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let point = 0; point < STAR_POINTS * 2; point += 1) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = (Math.PI * point) / STAR_POINTS - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = particle.color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = particle.size / 8;
  ctx.stroke();
}

function drawSquiggle(ctx: ConfettiCanvasContext, particle: Particle): void {
  const half = particle.size / 2;
  const outlinePath = (): void => {
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.quadraticCurveTo(-half / 2, -half, 0, 0);
    ctx.quadraticCurveTo(half / 2, half, half, 0);
  };
  outlinePath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = particle.size / 4;
  ctx.stroke();
  outlinePath();
  ctx.strokeStyle = particle.color;
  ctx.lineWidth = particle.size / 8;
  ctx.stroke();
}

function drawParticleMark(ctx: ConfettiCanvasContext, particle: Particle): void {
  if (particle.kind === "star") return drawStar(ctx, particle);
  if (particle.kind === "squiggle") return drawSquiggle(ctx, particle);
  return drawScrap(ctx, particle);
}

/** Builds a `ConfettiPainter` from a canvas 2D context, scaled by `dpr`. */
export function canvasPainter(
  ctx: ConfettiCanvasContext,
  dpr: number,
): ConfettiPainter {
  return {
    clear(width, height) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    },
    drawParticle(particle) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate((particle.rotation * Math.PI) / 180);
      drawParticleMark(ctx, particle);
      ctx.restore();
    },
  };
}
