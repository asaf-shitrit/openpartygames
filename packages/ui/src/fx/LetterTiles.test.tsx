import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LetterTiles, tileSizeFor } from "./LetterTiles";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("tileSizeFor", () => {
  it("keeps the preferred size when the row fits", () => {
    expect(tileSizeFor(5, 1500, 72)).toBe(72);
  });

  it("shrinks the size so the row fits the available width", () => {
    const size = tileSizeFor(30, 1500, 72);
    expect(size).toBeLessThan(72);
    expect(size * 30 * 1.16).toBeLessThanOrEqual(1500 + 1);
  });

  it("caps the length used for sizing at 40", () => {
    expect(tileSizeFor(200, 1500, 72)).toBe(tileSizeFor(40, 1500, 72));
  });
});

describe("LetterTiles", () => {
  it("renders one tile per length, capped at 40", () => {
    const { container } = render(<LetterTiles length={60} live={false} />);
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBe(
      40,
    );
  });

  it("labels blank tiles with the length by default", () => {
    render(<LetterTiles length={7} live={false} />);
    expect(screen.getByLabelText("7 letters")).toBeTruthy();
  });

  it("labels fully revealed tiles with the letters", () => {
    render(
      <LetterTiles length={5} letters="apple" revealed={5} live={false} />,
    );
    expect(screen.getByLabelText("APPLE")).toBeTruthy();
  });

  it("uses a caller label when given", () => {
    render(<LetterTiles length={4} live={false} label="Your guess" />);
    expect(screen.getByLabelText("Your guess")).toBeTruthy();
  });

  it("shows letters only up to the revealed count", () => {
    const { container } = render(
      <LetterTiles length={5} letters="apple" revealed={2} live={false} />,
    );
    const glyphs = container.querySelectorAll(".opg-marker");
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0]?.textContent).toBe("A");
    expect(glyphs[1]?.textContent).toBe("P");
  });

  it("counts emoji and accents as one tile each", () => {
    const { container } = render(
      <LetterTiles length={2} letters="é🎉" revealed={2} live={false} />,
    );
    expect(container.querySelectorAll(".opg-marker")).toHaveLength(2);
  });

  it("pops tiles added after mount when live", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const { rerender } = render(<LetterTiles length={2} live />);
    spy.mockClear();
    rerender(<LetterTiles length={4} live />);
    expect(spy).toHaveBeenCalled();
  });

  it("does not pop tiles present at mount", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(<LetterTiles length={4} live />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("flips in letters revealed after mount when live", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const { rerender } = render(
      <LetterTiles length={5} letters="apple" revealed={0} live />,
    );
    spy.mockClear();
    rerender(<LetterTiles length={5} letters="apple" revealed={2} live />);
    expect(spy).toHaveBeenCalled();
  });

  it("does not animate settled tiles when not live", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <LetterTiles length={5} letters="apple" revealed={5} live={false} />,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
