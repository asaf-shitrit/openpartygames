// The QR code is how most people join. Nothing tested it.
//
// `QrCodeSvg` hand-builds an SVG path from the `qrcode` library's bit matrix with its own
// row/column loop. A transposition or an off-by-one there produces a QR-shaped image that
// scans wrong, or not at all — and every gate stays green, because the layout suite measures
// rectangles and screenshots compare pixels, and neither decodes anything. Developers type the
// room code; guests scan it. So the people who would notice are the ones not testing it.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { create } from "qrcode";
import { LocaleProvider } from "@opg/i18n";
import { QrCodeSvg } from "./QrCodeSvg";

afterEach(cleanup);

const CODE = "BCDF";

interface Matrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
  darkCount: number;
}

/** The library's own matrix, read independently of how the component walks it. */
function matrixFor(value: string): Matrix {
  const qr = create(value);
  const size = qr.modules.size;
  const data = qr.modules.data;
  const isDark = (row: number, col: number): boolean =>
    Boolean(data[row * size + col]);
  let darkCount = 0;
  for (let i = 0; i < size * size; i += 1) if (data[i]) darkCount += 1;
  return { size, isDark, darkCount };
}

/**
 * A module that is dark one way round and light the other.
 *
 * This is what makes the orientation check real rather than a restatement of the component's
 * own loop: at such a position, a correct renderer and a transposed one disagree about which
 * of two specific commands appears in the path.
 */
function asymmetricModule(matrix: Matrix) {
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (row === col) continue;
      if (matrix.isDark(row, col) && !matrix.isDark(col, row)) {
        return { row, col };
      }
    }
  }
  throw new Error("this QR matrix is symmetric, so it cannot detect a transposition");
}

function renderQr(value: string) {
  const { container } = render(
    <LocaleProvider>
      <QrCodeSvg value={value} />
    </LocaleProvider>,
  );
  const svg = container.querySelector("svg");
  const path = container.querySelector("path");
  if (!svg || !path) throw new Error("no QR svg rendered");
  return { svg, d: path.getAttribute("d") ?? "" };
}

describe("QrCodeSvg", () => {
  const matrix = matrixFor(CODE);

  it("sizes its viewBox to the module grid", () => {
    const { svg } = renderQr(CODE);
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${matrix.size} ${matrix.size}`);
  });

  it("draws one square per dark module and no more", () => {
    const { d } = renderQr(CODE);
    // An off-by-one in either loop bound changes this count; the shape still looks like a QR.
    expect(d.split("M").length - 1).toBe(matrix.darkCount);
  });

  it("puts each module at x=column, y=row, not the other way round", () => {
    const { row, col } = asymmetricModule(matrix);
    const { d } = renderQr(CODE);
    // Dark at (row, col) and light at (col, row), so exactly one of these may appear. A
    // transposed renderer produces the other one and still scans as *something*.
    expect(d).toContain(`M${col} ${row}h1v1h-1z`);
    expect(d).not.toContain(`M${row} ${col}h1v1h-1z`);
  });

  it("names itself with the code it encodes", () => {
    const { svg } = renderQr(CODE);
    // The whole point of the image is this string; a screen reader should get it too.
    expect(svg.textContent).toContain(CODE);
  });
});
