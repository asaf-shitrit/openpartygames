import { describe, expect, it } from "vitest";
import { matchRoute, routeSurface } from "./routes";

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

  it("maps the dev pages only when the dev flag is on", () => {
    expect(matchRoute("/dev/sounds", true)).toEqual({ kind: "dev-sounds" });
    expect(matchRoute("/dev/moments", true)).toEqual({ kind: "dev-moments" });
    expect(matchRoute("/dev/sounds", false)).toEqual({ kind: "landing" });
    expect(matchRoute("/dev/moments", false)).toEqual({ kind: "landing" });
    expect(matchRoute("/dev/other", true)).toEqual({ kind: "landing" });
    expect(matchRoute("/dev", true)).toEqual({ kind: "landing" });
  });
});

describe("routeSurface", () => {
  it("gives phones the silent surface", () => {
    expect(routeSurface({ kind: "join" }, false)).toBe("phone");
    expect(routeSurface({ kind: "player", code: "BKTZ" }, false)).toBe("phone");
  });

  it("puts the landing on the phone surface only on a narrow touch screen", () => {
    expect(routeSurface({ kind: "landing" }, true)).toBe("phone");
    expect(routeSurface({ kind: "landing" }, false)).toBe("tv");
  });

  it("gives every other route the TV surface", () => {
    expect(routeSurface({ kind: "host", code: "BKTZ" }, false)).toBe("tv");
    expect(routeSurface({ kind: "host", code: "BKTZ" }, true)).toBe("tv");
    expect(routeSurface({ kind: "credits" }, false)).toBe("tv");
    expect(routeSurface({ kind: "privacy" }, false)).toBe("tv");
    expect(routeSurface({ kind: "dev-sounds" }, false)).toBe("tv");
    expect(routeSurface({ kind: "dev-moments" }, false)).toBe("tv");
  });
});
