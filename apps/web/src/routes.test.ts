import { describe, expect, it } from "vitest";
import { matchRoute } from "./routes";

describe("matchRoute", () => {
  it("maps the root to the landing screen", () => {
    expect(matchRoute("/")).toEqual({ kind: "landing" });
  });

  it("maps /join to the phone join form", () => {
    expect(matchRoute("/join")).toEqual({ kind: "join" });
  });

  it("maps a room code to the player app", () => {
    expect(matchRoute("/BKTZ")).toEqual({ kind: "player", code: "BKTZ" });
  });

  it("maps /host/<code> to the host app and normalizes the code", () => {
    expect(matchRoute("/host/bktz")).toEqual({ kind: "host", code: "BKTZ" });
  });

  it("maps /credits and /privacy to their pages", () => {
    expect(matchRoute("/credits")).toEqual({ kind: "credits" });
    expect(matchRoute("/privacy")).toEqual({ kind: "privacy" });
  });

  it("falls back to the landing screen for unknown paths", () => {
    expect(matchRoute("/nope")).toEqual({ kind: "landing" });
    expect(matchRoute("/join/extra")).toEqual({ kind: "landing" });
    expect(matchRoute("/BATZ")).toEqual({ kind: "landing" });
    expect(matchRoute("/host")).toEqual({ kind: "landing" });
    expect(matchRoute("/host/BKTZ/extra")).toEqual({ kind: "landing" });
  });
});