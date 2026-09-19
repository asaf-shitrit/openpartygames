// The stroke model exists twice on purpose: packages/ui/src/doodle owns it for the pad and the
// renderer, and this package repeats it so the rules stay free of React — apps/worker imports a
// game definition, and it must not pull the UI kit in with it.
//
// Repeating it means the phone could encode a drawing the server then refuses, and nothing would
// say so. This test is what stops that: the two must agree, value for value.
import { describe, expect, it } from "vitest";
import * as kit from "@opg/ui";
import {
  GAP_MS_CAP,
  GRID,
  MAX_POINTS_PER_DOODLE,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
} from "./state";

describe("the rules' stroke model matches the kit's", () => {
  const pairs: ReadonlyArray<readonly [string, number, number]> = [
    ["GRID", GRID, kit.GRID],
    ["STROKE_MS_CAP", STROKE_MS_CAP, kit.STROKE_MS_CAP],
    ["GAP_MS_CAP", GAP_MS_CAP, kit.GAP_MS_CAP],
    ["MAX_STROKES_PER_DOODLE", MAX_STROKES_PER_DOODLE, kit.MAX_STROKES_PER_DOODLE],
    ["MAX_POINTS_PER_STROKE", MAX_POINTS_PER_STROKE, kit.MAX_POINTS_PER_STROKE],
    ["MAX_POINTS_PER_DOODLE", MAX_POINTS_PER_DOODLE, kit.MAX_POINTS_PER_DOODLE],
  ];

  for (const [name, mine, theirs] of pairs) {
    it(`${name} agrees`, () => {
      expect(mine).toBe(theirs);
    });
  }
});
