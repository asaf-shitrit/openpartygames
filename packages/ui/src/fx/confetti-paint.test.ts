import { describe, expect, it } from "vitest";
import type { Particle } from "./confetti-physics";
import type { ConfettiCanvasContext } from "./confetti-paint";
import { canvasPainter } from "./confetti-paint";

function particle(overrides: Partial<Particle> = {}): Particle {
  return {
    id: 1,
    kind: "scrap",
    x: 10,
    y: 20,
    vx: 0,
    vy: 0,
    rotation: 30,
    spin: 0,
    size: 16,
    color: "#FFE45C",
    wobble: 1,
    life: 2000,
    ...overrides,
  };
}

function recordingContext() {
  const calls: string[] = [];
  const ctx: ConfettiCanvasContext = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: () => calls.push("translate"),
    rotate: () => calls.push("rotate"),
    setTransform: () => calls.push("setTransform"),
    clearRect: () => calls.push("clearRect"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    quadraticCurveTo: () => calls.push("quadraticCurveTo"),
    closePath: () => calls.push("closePath"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
  };
  return { ctx, calls };
}

describe("canvasPainter", () => {
  it("clear() scales by dpr, then clears the logical rect", () => {
    const { ctx, calls } = recordingContext();
    const painter = canvasPainter(ctx, 2);
    painter.clear(800, 600);
    expect(calls).toEqual(["setTransform", "clearRect"]);
  });

  it("draws a scrap as a filled, stroked quad wrapped in save/restore", () => {
    const { ctx, calls } = recordingContext();
    canvasPainter(ctx, 1).drawParticle(particle({ kind: "scrap" }));
    expect(calls[0]).toBe("save");
    expect(calls.at(-1)).toBe("restore");
    expect(calls).toContain("fill");
    expect(calls).toContain("stroke");
    expect(calls).toContain("closePath");
  });

  it("draws a star as a filled, stroked path", () => {
    const { ctx, calls } = recordingContext();
    canvasPainter(ctx, 1).drawParticle(particle({ kind: "star" }));
    expect(calls[0]).toBe("save");
    expect(calls.at(-1)).toBe("restore");
    expect(calls).toContain("fill");
    expect(calls.filter((call) => call === "lineTo").length).toBeGreaterThan(
      5,
    );
  });

  it("draws a squiggle as an ink-outlined colored stroke, never filled", () => {
    const { ctx, calls } = recordingContext();
    canvasPainter(ctx, 1).drawParticle(particle({ kind: "squiggle" }));
    expect(calls[0]).toBe("save");
    expect(calls.at(-1)).toBe("restore");
    expect(calls).not.toContain("fill");
    expect(calls.filter((call) => call === "stroke")).toHaveLength(2);
  });

  it("sets the ink outline color and a size-scaled line width", () => {
    const setStrokeStyles: string[] = [];
    const { ctx, calls } = recordingContext();
    Object.defineProperty(ctx, "strokeStyle", {
      set(value: string) {
        setStrokeStyles.push(value);
      },
      get() {
        return setStrokeStyles.at(-1) ?? "";
      },
    });
    canvasPainter(ctx, 1).drawParticle(particle({ kind: "scrap", size: 16 }));
    expect(setStrokeStyles).toContain("#2B2B2B");
    expect(calls).toContain("stroke");
  });

  it("translates and rotates to the particle's position and heading", () => {
    const { ctx, calls } = recordingContext();
    canvasPainter(ctx, 1).drawParticle(particle());
    expect(calls).toContain("translate");
    expect(calls).toContain("rotate");
  });
});
