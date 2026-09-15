import { describe, expect, it } from "vitest";
import {
  CONFETTI_CAP,
  MAX_DT_MS,
  seededRandom,
  settled,
  spawnBurst,
  stepParticles,
} from "./confetti-physics";

const BOUNDS = { width: 400, height: 300 };
const COLORS = ["#FFE45C", "#D7372B"];

function burst(seed: number, count = 20) {
  return spawnBurst({
    count,
    originX: 200,
    originY: 100,
    width: BOUNDS.width,
    height: BOUNDS.height,
    colors: COLORS,
    seed,
  });
}

describe("seededRandom", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const sequenceA = [a(), a(), a()];
    const sequenceB = [b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces values in [0, 1)", () => {
    const rng = seededRandom(42);
    for (let i = 0; i < 50; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("spawnBurst", () => {
  it("is deterministic for the same seed", () => {
    expect(burst(3)).toEqual(burst(3));
  });

  it("differs for different seeds", () => {
    expect(burst(3)).not.toEqual(burst(4));
  });

  it("honors the requested count", () => {
    expect(burst(1, 37)).toHaveLength(37);
    expect(burst(1, 0)).toHaveLength(0);
  });

  it("launches every particle from the origin", () => {
    for (const particle of burst(9)) {
      expect(particle.x).toBe(200);
      expect(particle.y).toBe(100);
    }
  });

  it("launches upward (negative vy) at spawn", () => {
    for (const particle of burst(5)) {
      expect(particle.vy).toBeLessThan(0);
    }
  });
});

describe("stepParticles", () => {
  it("does not mutate the input", () => {
    const particles = burst(2, 5);
    const snapshot = JSON.parse(JSON.stringify(particles));
    stepParticles(particles, 16, BOUNDS);
    expect(particles).toEqual(snapshot);
  });

  it("clamps dtMs so a hidden tab can't teleport particles", () => {
    const particles = burst(2, 1);
    const clamped = stepParticles(particles, 5000, BOUNDS);
    const normal = stepParticles(particles, MAX_DT_MS, BOUNDS);
    expect(clamped[0]?.y).toBeCloseTo(normal[0]?.y ?? NaN, 5);
    expect(clamped[0]?.life).toBe(normal[0]?.life);
  });

  it("moves particles up first, then down under gravity", () => {
    let particles = burst(11, 1);
    const startY = particles[0]?.y ?? 0;
    particles = stepParticles(particles, 16, BOUNDS);
    const earlyY = particles[0]?.y ?? 0;
    expect(earlyY).toBeLessThan(startY);

    for (let i = 0; i < 100; i += 1) {
      particles = stepParticles(particles, 16, BOUNDS);
    }
    const laterY = particles[0]?.y ?? 0;
    expect(laterY).toBeGreaterThan(earlyY);
  });
});

describe("settled", () => {
  it("is false right after spawn", () => {
    expect(settled(burst(1), BOUNDS)).toBe(false);
  });

  it("becomes true within about 3.5s of 16ms steps", () => {
    let particles = burst(1, 40);
    let elapsedMs = 0;
    while (elapsedMs < 5000 && !settled(particles, BOUNDS)) {
      particles = stepParticles(particles, 16, BOUNDS);
      elapsedMs += 16;
    }
    expect(settled(particles, BOUNDS)).toBe(true);
    expect(elapsedMs).toBeLessThanOrEqual(5000);
  });

  it("is vacuously true for an empty burst", () => {
    expect(settled([], BOUNDS)).toBe(true);
  });
});

describe("CONFETTI_CAP", () => {
  it("caps the TV at 160 and the phone at 60", () => {
    expect(CONFETTI_CAP.tv).toBe(160);
    expect(CONFETTI_CAP.phone).toBe(60);
  });
});
