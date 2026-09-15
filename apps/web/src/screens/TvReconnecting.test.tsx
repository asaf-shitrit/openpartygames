import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TvReconnecting } from "./TvReconnecting";

afterEach(cleanup);

describe("TvReconnecting", () => {
  it("announces the reconnect and reassures the room", () => {
    const { container } = render(<TvReconnecting />);
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(
      screen.getByText("Hang tight. The game and scores are safe."),
    ).toBeTruthy();
    const overlay = container.querySelector("output");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-live")).toBe("polite");
  });
});
