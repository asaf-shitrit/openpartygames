// Hand-rolled confetti physics: seeded particle bursts that launch upward and
// outward from an origin, then flutter down under gravity and air drag.
// Pure and deterministic so a reconnect (or a test) replays the same burst.

export type ParticleKind = "scrap" | "star" | "squiggle";

export interface Particle {
  id: number;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  wobble: number;
  life: number;
}

export interface BurstOptions {
  count: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  colors: readonly string[];
  seed: number;
  spread?: number;
}

export interface ConfettiBounds {
  width: number;
  height: number;
}

export const CONFETTI_CAP = { tv: 160, phone: 60 } as const;

const KINDS: readonly ParticleKind[] = ["scrap", "star", "squiggle"];
const DEFAULT_SPREAD_DEG = 140;
const MIN_SPEED_PX_S = 260;
const SPEED_RANGE_PX_S = 360;
const MIN_SIZE_PX = 8;
const SIZE_RANGE_PX = 14;
const MIN_LIFE_MS = 2500;
const LIFE_RANGE_MS = 1000;
const SPIN_RANGE_DEG_S = 240;
const MIN_WOBBLE = 0.4;
const WOBBLE_RANGE = 1.1;

const GRAVITY_PX_S2 = 700;
const DRAG_PER_S = 0.86;
const WOBBLE_FORCE_PX_S2 = 40;
const WOBBLE_FREQ_PER_MS = 1 / 260;
export const MAX_DT_MS = 50;

/** Small seeded PRNG (mulberry32). Never Math.random. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[], fallback: T): T {
  const index = Math.floor(rng() * items.length);
  return items[index] ?? fallback;
}

function launchVelocity(rng: () => number, spreadDeg: number) {
  const angleDeg = -90 + (rng() - 0.5) * spreadDeg;
  const angleRad = (angleDeg * Math.PI) / 180;
  const speed = MIN_SPEED_PX_S + rng() * SPEED_RANGE_PX_S;
  return { vx: Math.cos(angleRad) * speed, vy: Math.sin(angleRad) * speed };
}

function spawnOne(
  rng: () => number,
  id: number,
  options: BurstOptions,
): Particle {
  const { vx, vy } = launchVelocity(rng, options.spread ?? DEFAULT_SPREAD_DEG);
  return {
    id,
    kind: pick(rng, KINDS, "scrap"),
    x: options.originX,
    y: options.originY,
    vx,
    vy,
    rotation: rng() * 360,
    spin: (rng() - 0.5) * SPIN_RANGE_DEG_S,
    size: MIN_SIZE_PX + rng() * SIZE_RANGE_PX,
    color: pick(rng, options.colors, "#2B2B2B"),
    wobble: MIN_WOBBLE + rng() * WOBBLE_RANGE,
    life: MIN_LIFE_MS + rng() * LIFE_RANGE_MS,
  };
}

/** Launches `count` particles from the origin, fanned upward and outward. */
export function spawnBurst(options: BurstOptions): Particle[] {
  const rng = seededRandom(options.seed);
  const particles: Particle[] = [];
  for (let index = 0; index < options.count; index += 1) {
    particles.push(spawnOne(rng, index, options));
  }
  return particles;
}

function bounceOffEdges(x: number, vx: number, width: number): number {
  if (width <= 0) return vx;
  if (x < 0 || x > width) return vx * -0.5;
  return vx;
}

function integrate(
  particle: Particle,
  dtMs: number,
  bounds: ConfettiBounds,
): Particle {
  const dtS = dtMs / 1000;
  const wobbleForce =
    Math.sin(particle.life * WOBBLE_FREQ_PER_MS + particle.rotation) *
    particle.wobble *
    WOBBLE_FORCE_PX_S2;
  const dragFactor = Math.pow(DRAG_PER_S, dtS);
  const vx = (particle.vx + wobbleForce * dtS) * dragFactor;
  const vy = particle.vy + GRAVITY_PX_S2 * dtS;
  const x = particle.x + vx * dtS;
  return {
    ...particle,
    x,
    y: particle.y + vy * dtS,
    vx: bounceOffEdges(x, vx, bounds.width),
    vy,
    rotation: particle.rotation + particle.spin * dtS,
    life: Math.max(0, particle.life - dtMs),
  };
}

/**
 * Advances every particle by dtMs: gravity, air drag, a sideways wobble
 * (paper flutter) and spin; life decreases. Returns new particles, never
 * mutating the input. dtMs is clamped so a hidden tab can't teleport particles.
 */
export function stepParticles(
  particles: readonly Particle[],
  dtMs: number,
  bounds: ConfettiBounds,
): Particle[] {
  const clamped = Math.min(Math.max(dtMs, 0), MAX_DT_MS);
  return particles.map((particle) => integrate(particle, clamped, bounds));
}

/** True when every particle is below the bottom edge or out of life. */
export function settled(
  particles: readonly Particle[],
  bounds: ConfettiBounds,
): boolean {
  return particles.every(
    (particle) => particle.life <= 0 || particle.y > bounds.height,
  );
}
