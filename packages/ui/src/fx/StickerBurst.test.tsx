import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StickerBurst, stickerAt } from "./StickerBurst";

afterEach(cleanup);

describe("stickerAt", () => {
  it("is deterministic", () => {
    expect(stickerAt(7, 360)).toEqual(stickerAt(7, 360));
  });

  it("starts the fan at the same tilt every time", () => {
    expect(stickerAt(0, 360).rotate).toBe(-180);
  });

  it("keeps placements inside the burst area", () => {
    for (let index = 0; index < 24; index += 1) {
      const placement = stickerAt(index, 360);
      expect(Math.abs(placement.x)).toBeLessThanOrEqual(360);
      expect(Math.abs(placement.y)).toBeLessThanOrEqual(360);
    }
  });

  it("spreads placements apart", () => {
    expect(stickerAt(0, 360)).not.toEqual(stickerAt(1, 360));
  });
});

describe("StickerBurst", () => {
  it("renders the requested number of stickers", () => {
    const { container } = render(<StickerBurst live count={4} />);
    expect(container.querySelectorAll(".opg-fx-sticker")).toHaveLength(4);
  });

  it("pops with a stagger only when live", () => {
    const { container, rerender } = render(<StickerBurst live count={2} />);
    const stickers = container.querySelectorAll<HTMLElement>(".opg-fx-sticker");
    expect(stickers[0]?.style.animationDelay).toBe("0ms");
    expect(stickers[1]?.style.animationDelay).toBe("40ms");
    rerender(<StickerBurst live={false} count={2} />);
    expect(container.querySelectorAll(".opg-fx-sticker")).toHaveLength(0);
  });

  it("renders settled stickers with no animation when not live", () => {
    const { container } = render(<StickerBurst live={false} count={3} />);
    const overlay = container.firstElementChild;
    expect(overlay?.children).toHaveLength(3);
    const first = overlay?.children[0];
    if (!(first instanceof HTMLElement)) throw new Error("expected sticker");
    expect(first.getAttribute("class")).toBeNull();
    expect(first.style.animationDelay).toBe("");
  });

  it("places each sticker from the center deterministically", () => {
    const { container } = render(<StickerBurst live count={2} />);
    const stickers = container.querySelectorAll<HTMLElement>(".opg-fx-sticker");
    const first = stickerAt(0, 360);
    expect(stickers[0]?.style.translate).toBe(`${first.x}px ${first.y}px`);
    expect(stickers[0]?.style.rotate).toBe(`${first.rotate}deg`);
  });

  it("hides the burst from assistive tech", () => {
    const { container } = render(<StickerBurst live count={1} />);
    const overlay = container.firstElementChild;
    if (!(overlay instanceof HTMLElement)) throw new Error("expected overlay");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
  });
});
