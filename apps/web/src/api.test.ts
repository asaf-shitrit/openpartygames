import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createRoom, getRoomInfo } from "./api";

function stubFetch(...responses: Response[]) {
  const mock = vi.fn<typeof fetch>();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRoom", () => {
  it("returns the parsed room code and host token", async () => {
    const mock = stubFetch(Response.json({ code: "BKTZ", hostToken: "tok" }));
    await expect(createRoom()).resolves.toEqual({
      code: "BKTZ",
      hostToken: "tok",
    });
    expect(mock).toHaveBeenCalledWith("/api/rooms", { method: "POST" });
  });

  it("maps a server error body to ApiError.code", async () => {
    stubFetch(Response.json({ error: "full-tonight" }, { status: 503 }));
    await expect(createRoom()).rejects.toMatchObject({
      name: "ApiError",
      code: "full-tonight",
    });
  });

  it("falls back to internal when the error body is not a known code", async () => {
    stubFetch(Response.json({ error: "teapot" }, { status: 500 }));
    await expect(createRoom()).rejects.toMatchObject({ code: "internal" });
  });

  it("falls back to internal when the error body is not JSON", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 500 }));
    await expect(createRoom()).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects an ok response with an unexpected body shape", async () => {
    stubFetch(Response.json({ code: "BKTZ" }));
    await expect(createRoom()).rejects.toMatchObject({
      code: "internal",
      message: "Unexpected room response",
    });
  });
});

describe("getRoomInfo", () => {
  it("requests the encoded room code and parses room info", async () => {
    const info = {
      code: "BKTZ",
      exists: true,
      locked: false,
      inGame: false,
      playerCount: 2,
      joinable: true,
    };
    const mock = stubFetch(Response.json(info));
    await expect(getRoomInfo("b k")).resolves.toEqual(info);
    expect(mock).toHaveBeenCalledWith("/api/rooms/b%20k");
  });

  it("maps a 404 to not-found", async () => {
    stubFetch(Response.json({ error: "not-found" }, { status: 404 }));
    await expect(getRoomInfo("BKTZ")).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects an ok response with an unexpected body shape", async () => {
    stubFetch(Response.json({ code: "BKTZ", exists: "yes" }));
    await expect(getRoomInfo("BKTZ")).rejects.toMatchObject({
      message: "Unexpected room info response",
    });
  });
});