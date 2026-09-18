import type { RoomInfoResponse } from "@opg/protocol";
import type { Limiter } from "../limits";
import {
  createRouter,
  type AssetFetcher,
  type RoomBudget,
  type RoomNamespace,
  type RoomStub,
  type RouteDeps,
} from "../routes";

export class FakeRooms implements RoomNamespace {
  readonly taken: Set<string>;
  readonly initCalls: { code: string; hostToken: string; sharedScreen: boolean }[] =
    [];
  readonly forwarded: string[] = [];
  infoCalls = 0;
  info: RoomInfoResponse | null = null;

  constructor(taken: string[] = []) {
    this.taken = new Set(taken);
  }

  getByName(_code: string): RoomStub {
    return {
      init: async (initCode, hostToken, sharedScreen = true) => {
        this.initCalls.push({ code: initCode, hostToken, sharedScreen });
        return !this.taken.has(initCode);
      },
      info: async () => {
        this.infoCalls += 1;
        return this.info;
      },
      fetch: async (request) => {
        this.forwarded.push(request.url);
        return new Response("upgraded", { status: 200 });
      },
    };
  }
}

export class FakeAssets implements AssetFetcher {
  readonly requests: string[] = [];

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request.url);
    return new Response("assets", { status: 200 });
  }
}

export function limiter(success: boolean, keys: string[] = []): Limiter {
  return {
    limit: async ({ key }) => {
      keys.push(key);
      return { success };
    },
  };
}

/** Router dependencies wired to fakes, with knobs the tests flip. */
export class RoutesHarness {
  readonly rooms: FakeRooms;
  readonly assets = new FakeAssets();
  readonly budgetDays: string[] = [];
  readonly codes: string[];
  budgetAllows = true;
  budgetFails = false;
  createLimiter: Limiter | undefined;
  joinLimiter: Limiter | undefined;
  private time = 1_700_000_000_000;
  private hostSeq = 0;
  private codeIndex = 0;

  constructor(options: { codes?: string[]; taken?: string[] } = {}) {
    this.codes = options.codes ?? ["BCDF", "GHJK", "LMNP", "QRST"];
    this.rooms = new FakeRooms(options.taken ?? []);
  }

  /** `body` is sent verbatim, so a test can send well-formed JSON, an empty string or garbage text. */
  request(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string,
  ): Promise<Response> {
    const request = new Request(`https://party.test${path}`, {
      method,
      headers,
      body,
    });
    return createRouter(this.deps())(request);
  }

  private deps(): RouteDeps {
    return {
      rooms: this.rooms,
      budget: this.budget(),
      limiters: { create: this.createLimiter, join: this.joinLimiter },
      assets: this.assets,
      now: () => this.time,
      newHostToken: () => `host-${++this.hostSeq}`,
      newRoomCode: () => this.nextCode(),
    };
  }

  private budget(): RoomBudget {
    return {
      tryConsume: async (day: string): Promise<boolean> => {
        this.budgetDays.push(day);
        if (this.budgetFails) throw new Error("d1 unavailable");
        return this.budgetAllows;
      },
    };
  }

  private nextCode(): string {
    const code = this.codes[this.codeIndex % this.codes.length] ?? "BCDF";
    this.codeIndex += 1;
    return code;
  }
}

export function makeRoutes(options: {
  codes?: string[];
  taken?: string[];
} = {}): RoutesHarness {
  return new RoutesHarness(options);
}