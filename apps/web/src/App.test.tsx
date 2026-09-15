import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { resetFakeSockets } from "./screens/fixtures/socket";

function renderAt(path: string) {
  window.history.pushState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  resetFakeSockets();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App routing", () => {
  it("renders the TV landing at the root", () => {
    renderAt("/");
    expect(screen.getByText("Party games for")).toBeTruthy();
  });

  it("renders the phone join form at /join", () => {
    renderAt("/join");
    expect(screen.getByText("Join a game")).toBeTruthy();
  });

  it("renders the player app at a room code", () => {
    renderAt("/BKTZ");
    expect(screen.getByText("Join a game")).toBeTruthy();
  });

  it("renders the host app at /host/<code>", () => {
    renderAt("/host/BKTZ");
    expect(
      screen.getByText("This room is hosted on another screen"),
    ).toBeTruthy();
  });

  it("renders the credits page", () => {
    renderAt("/credits");
    expect(screen.getByText("Credits")).toBeTruthy();
  });

  it("renders the privacy page", () => {
    renderAt("/privacy");
    expect(screen.getByText("Privacy")).toBeTruthy();
  });
});