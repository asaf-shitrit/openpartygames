import { describe, expect, it, vi } from "vitest";
import { limiter, makeRoutes } from "./fixtures/router";
import { dailyCap, DEFAULT_DAILY_ROOM_CAP } from "./routes";

const IP = { "CF-Connecting-IP": "1.2.3.4" };

describe("dailyCap", () => {
  it("reads the env value and falls back for zero, negative or nonsense caps", () => {
    expect(dailyCap("150")).toBe(150);
    expect(dailyCap("7.9")).toBe(7);
    expect(dailyCap("0")).toBe(DEFAULT_DAILY_ROOM_CAP);
    expect(dailyCap("-3")).toBe(DEFAULT_DAILY_ROOM_CAP);
    expect(dailyCap("lots")).toBe(DEFAULT_DAILY_ROOM_CAP);
  });
});

describe("GET /api/health", () => {
  it("answers ok", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/api/health");

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual({ ok: true });
  });
});

describe("POST /api/rooms", () => {
  it("counts the day and returns a fresh code with a host token", async () => {
    const routes = makeRoutes({ codes: ["BCDF"] });
    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual({
      code: "BCDF",
      hostToken: "host-1",
    });
    expect(routes.budgetDays).toEqual(["2023-11-14"]);
    expect(routes.rooms.initCalls).toEqual([
      { code: "BCDF", hostToken: "host-1" },
    ]);
  });

  it("is rate limited before counting when the limiter says no", async () => {
    const routes = makeRoutes();
    const keys: string[] = [];
    routes.createLimiter = limiter(false, keys);

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(429);
    expect(JSON.parse(await response.text())).toEqual({
      error: "rate-limited",
    });
    expect(keys).toEqual(["1.2.3.4"]);
    expect(routes.budgetDays).toEqual([]);
  });

  it("answers full-tonight when today's cap is reached", async () => {
    const routes = makeRoutes();
    routes.budgetAllows = false;

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(429);
    expect(JSON.parse(await response.text())).toEqual({
      error: "full-tonight",
    });
    expect(routes.rooms.initCalls).toEqual([]);
  });

  it("answers internal when the daily counter fails", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const routes = makeRoutes();
    routes.budgetFails = true;

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(500);
    expect(JSON.parse(await response.text())).toEqual({ error: "internal" });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("retries another code when the first is already taken", async () => {
    const routes = makeRoutes({
      codes: ["BCDF", "GHJK", "LMNP"],
      taken: ["BCDF", "GHJK"],
    });

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(JSON.parse(await response.text())).toEqual({
      code: "LMNP",
      hostToken: "host-1",
    });
    expect(routes.rooms.initCalls.map((call) => call.code)).toEqual([
      "BCDF",
      "GHJK",
      "LMNP",
    ]);
  });

  it("gives up after ten taken codes", async () => {
    const routes = makeRoutes({
      codes: ["BCDF", "GHJK"],
      taken: ["BCDF", "GHJK"],
    });

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(500);
    expect(JSON.parse(await response.text())).toEqual({ error: "internal" });
    expect(routes.rooms.initCalls).toHaveLength(10);
  });

  it("answers internal when the room cannot be initialized", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const routes = makeRoutes({ codes: ["BCDF"] });
    routes.rooms.getByName = () => ({
      init: async () => {
        throw new Error("class not deployed");
      },
      info: async () => null,
      fetch: async () => new Response(null, { status: 404 }),
    });

    const response = await routes.request("POST", "/api/rooms", IP);

    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("rejects other methods", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/api/rooms");

    expect(response.status).toBe(405);
    expect(JSON.parse(await response.text())).toEqual({ error: "bad-request" });
  });
});

describe("GET /api/rooms/:code", () => {
  it("returns room info for a valid code", async () => {
    const routes = makeRoutes();
    routes.rooms.info = {
      code: "BCDF",
      exists: true,
      locked: false,
      inGame: false,
      playerCount: 3,
      joinable: true,
    };

    const response = await routes.request("GET", "/api/rooms/bcdf", IP);

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toMatchObject({
      code: "BCDF",
      playerCount: 3,
    });
  });

  it("404s an unknown room", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/api/rooms/BCDF", IP);

    expect(response.status).toBe(404);
    expect(JSON.parse(await response.text())).toEqual({ error: "not-found" });
  });

  it("404s a code that cannot exist, without asking the room", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/api/rooms/nope", IP);

    expect(response.status).toBe(404);
    expect(routes.rooms.infoCalls).toBe(0);
  });

  it("is rate limited by the join limiter", async () => {
    const routes = makeRoutes();
    routes.joinLimiter = limiter(false);

    const response = await routes.request("GET", "/api/rooms/BCDF", IP);

    expect(response.status).toBe(429);
    expect(JSON.parse(await response.text())).toEqual({
      error: "rate-limited",
    });
  });
});

describe("GET /ws/:code", () => {
  it("forwards an upgrade to the room stub", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/ws/bcdf", {
      ...IP,
      Upgrade: "websocket",
    });

    expect(response.status).toBe(200);
    expect(routes.rooms.forwarded).toEqual(["https://party.test/ws/bcdf"]);
  });

  it("400s without an Upgrade header", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/ws/BCDF", IP);

    expect(response.status).toBe(400);
    expect(JSON.parse(await response.text())).toEqual({ error: "bad-request" });
    expect(routes.rooms.forwarded).toEqual([]);
  });

  it("404s an invalid code before checking the upgrade", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/ws/nope", IP);

    expect(response.status).toBe(404);
  });

  it("is rate limited by the join limiter", async () => {
    const routes = makeRoutes();
    routes.joinLimiter = limiter(false);

    const response = await routes.request("GET", "/ws/BCDF", {
      ...IP,
      Upgrade: "websocket",
    });

    expect(response.status).toBe(429);
    expect(routes.rooms.forwarded).toEqual([]);
  });
});

describe("other paths", () => {
  it("falls through to the asset fetcher", async () => {
    const routes = makeRoutes();
    const response = await routes.request("GET", "/play/imposter");

    expect(response.status).toBe(200);
    expect(routes.assets.requests).toEqual([
      "https://party.test/play/imposter",
    ]);
  });
});
