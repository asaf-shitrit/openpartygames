import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DevRoute from "./DevRoute";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("DevRoute", () => {
  it("renders the sound board in sounds mode", () => {
    render(<DevRoute mode="sounds" />);
    expect(screen.getByText("Sound board")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock sound" })).toBeTruthy();
  });

  it("renders the moment player in moments mode", () => {
    render(<DevRoute mode="moments" />);
    expect(screen.getByText("Moments")).toBeTruthy();
  });
});
