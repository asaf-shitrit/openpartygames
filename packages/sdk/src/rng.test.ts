import { describe, expect, it } from "vitest";
import { createRng, restoreRng } from "./rng";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() returns floats in [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) stays within [0, n)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it("int(1) is always 0", () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) expect(rng.int(1)).toBe(0);
  });

  it("shuffle does not mutate its input", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    createRng(4).shuffle(input);
    expect(input).toEqual(copy);
  });

  it("shuffle is a deterministic permutation", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const outA = createRng(11).shuffle(input);
    const outB = createRng(11).shuffle(input);
    expect(outA).toEqual(outB);
    expect(new Set(outA)).toEqual(new Set(input));
  });

  it("shuffle can change the order and handles empty/single arrays", () => {
    expect(createRng(5).shuffle([])).toEqual([]);
    expect(createRng(5).shuffle(["only"])).toEqual(["only"]);
    const input = Array.from({ length: 40 }, (_, i) => i);
    const out = createRng(5).shuffle(input);
    expect(out).not.toEqual(input);
  });

  it("pick returns an element of the array", () => {
    const rng = createRng(8);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
  });

  it("pick throws on an empty array", () => {
    expect(() => createRng(1).pick([])).toThrow(
      "rng.pick called with an empty array",
    );
  });

  it("state() is a JSON-safe unsigned 32-bit integer", () => {
    const rng = createRng(-1);
    rng.next();
    const state = rng.state();
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBeGreaterThanOrEqual(0);
    expect(state).toBeLessThanOrEqual(0xffffffff);
    expect(JSON.parse(JSON.stringify(state))).toBe(state);
  });

  it("restoreRng continues the exact sequence", () => {
    const original = createRng(4242);
    original.next();
    original.next();
    original.next();
    const state = original.state();

    const restored = restoreRng(state);
    const expectedNext = original.next();
    expect(restored.next()).toBe(expectedNext);

    const peer = createRng(4242);
    peer.next();
    peer.next();
    peer.next();
    expect(restoreRng(state).next()).toBe(peer.next());
  });

  it("restoreRng on a fresh state matches createRng output", () => {
    const state = createRng(55).state();
    const restored = restoreRng(state);
    const fresh = createRng(55);
    expect(Array.from({ length: 5 }, () => restored.next())).toEqual(
      Array.from({ length: 5 }, () => fresh.next()),
    );
  });
});
