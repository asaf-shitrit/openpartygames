import {
  normalizeRoomCode,
  parseCreateRoomRequest,
  ROOM_CODE_RE,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ContentLanguage,
  type CreateRoomResponse,
  type RoomInfoResponse,
} from "@opg/protocol";
import { allowed, type Limiter } from "./limits";

export const DEFAULT_DAILY_ROOM_CAP = 150;
const MAX_CODE_ATTEMPTS = 10;

/** One room Durable Object, as the router needs it. */
export interface RoomStub {
  /**
   * `sharedScreen` defaults to true (a TV room) when omitted, matching today's behaviour.
   * `contentLanguage` defaults to "en" when omitted, same reasoning.
   */
  init(
    code: string,
    hostToken: string,
    sharedScreen?: boolean,
    contentLanguage?: ContentLanguage,
  ): Promise<boolean>;
  info(): Promise<RoomInfoResponse | null>;
  fetch(request: Request): Promise<Response>;
}

export interface RoomNamespace {
  getByName(code: string): RoomStub;
}

export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

/** Today's room allowance, as one operation so the router stays storage-agnostic. */
export interface RoomBudget {
  /** True when another room may be created today. */
  tryConsume(day: string): Promise<boolean>;
}

export interface RouteLimiters {
  create?: Limiter;
  join?: Limiter;
}

/** Everything the router reads from the Worker env, injected so it is testable in plain Node. */
export interface RouteDeps {
  rooms: RoomNamespace;
  budget: RoomBudget;
  limiters: RouteLimiters;
  assets: AssetFetcher;
  now: () => number;
  newHostToken: () => string;
  newRoomCode: () => string;
}

export type HealthResponse = { ok: true };
export type JsonBody =
  | CreateRoomResponse
  | RoomInfoResponse
  | ApiErrorResponse
  | HealthResponse;

type ApiRoute =
  | { kind: "health" }
  | { kind: "create" }
  | { kind: "info"; code: string }
  | { kind: "socket"; code: string };

/** DAILY_ROOM_CAP as a positive integer, falling back to the default. */
export function dailyCap(value: string): number {
  const cap = Number(value);
  return Number.isFinite(cap) && cap > 0
    ? Math.floor(cap)
    : DEFAULT_DAILY_ROOM_CAP;
}

/** The `daily_rooms` day key (UTC) for a timestamp. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function createRouter(
  deps: RouteDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let pathname: string;
    try {
      pathname = new URL(request.url).pathname;
    } catch {
      return apiError("bad-request", 400);
    }
    const route = apiRoute(pathname);
    return route ? handleApi(route, request, deps) : deps.assets.fetch(request);
  };
}

function apiRoute(pathname: string): ApiRoute | null {
  if (pathname === "/api/health") return { kind: "health" };
  if (pathname === "/api/rooms") return { kind: "create" };
  const roomMatch = /^\/api\/rooms\/([^/]+)$/.exec(pathname);
  if (roomMatch) return { kind: "info", code: roomMatch[1] ?? "" };
  const socketMatch = /^\/ws\/([^/]+)$/.exec(pathname);
  if (socketMatch) return { kind: "socket", code: socketMatch[1] ?? "" };
  return null;
}

async function handleApi(
  route: ApiRoute,
  request: Request,
  deps: RouteDeps,
): Promise<Response> {
  if (route.kind === "health") return json({ ok: true });
  if (route.kind === "create") return createRoom(request, deps);
  if (request.method !== "GET") return apiError("bad-request", 405);
  return route.kind === "info"
    ? roomInfo(deps, route.code, request)
    : upgrade(deps, route.code, request);
}

interface CreateRoomFields {
  sharedScreen: boolean;
  contentLanguage: ContentLanguage;
}

/**
 * `sharedScreen` defaults to true (a TV room) and `contentLanguage` to "en" when the body
 * is missing, empty, malformed or omits the field: today's behaviour.
 */
async function parseCreateRoomFields(request: Request): Promise<CreateRoomFields> {
  const text = await request.text();
  const body = parseCreateRoomRequest(text);
  return {
    sharedScreen: body.sharedScreen ?? true,
    contentLanguage: body.contentLanguage ?? "en",
  };
}

async function createRoom(
  request: Request,
  deps: RouteDeps,
): Promise<Response> {
  if (request.method !== "POST") return apiError("bad-request", 405);
  if (!(await allowed(deps.limiters.create, clientKey(request)))) {
    return apiError("rate-limited", 429);
  }

  const fields = await parseCreateRoomFields(request);
  const withinCap = await tryConsumeRoom(deps);
  if (withinCap === null) return apiError("internal", 500);
  if (!withinCap) return apiError("full-tonight", 429);
  return startRoom(deps, deps.newHostToken(), 0, fields);
}

async function tryConsumeRoom(deps: RouteDeps): Promise<boolean | null> {
  try {
    return await deps.budget.tryConsume(dayKey(deps.now()));
  } catch (error) {
    console.error("failed to count today's rooms", error);
    return null;
  }
}

/** Picks a free code, retrying when another active room already owns one. */
async function startRoom(
  deps: RouteDeps,
  hostToken: string,
  attempt: number,
  fields: CreateRoomFields,
): Promise<Response> {
  if (attempt >= MAX_CODE_ATTEMPTS) return apiError("internal", 500);
  const code = deps.newRoomCode();
  if (!(await initRoom(deps, code, hostToken, fields)))
    return startRoom(deps, hostToken, attempt + 1, fields);
  return json({ code, hostToken });
}

async function initRoom(
  deps: RouteDeps,
  code: string,
  hostToken: string,
  fields: CreateRoomFields,
): Promise<boolean> {
  try {
    return await deps.rooms
      .getByName(code)
      .init(code, hostToken, fields.sharedScreen, fields.contentLanguage);
  } catch (error) {
    console.error("failed to initialize room", code, error);
    return false;
  }
}

async function roomInfo(
  deps: RouteDeps,
  rawCode: string,
  request: Request,
): Promise<Response> {
  // Same limiter as sockets: this endpoint is what someone guessing room codes would hit.
  if (!(await allowed(deps.limiters.join, clientKey(request)))) {
    return apiError("rate-limited", 429);
  }
  const code = normalizeRoomCode(rawCode);
  if (!ROOM_CODE_RE.test(code)) return apiError("not-found", 404);
  const info = await deps.rooms.getByName(code).info();
  if (!info) return apiError("not-found", 404);
  return json(info);
}

async function upgrade(
  deps: RouteDeps,
  rawCode: string,
  request: Request,
): Promise<Response> {
  const code = normalizeRoomCode(rawCode);
  if (!ROOM_CODE_RE.test(code)) return apiError("not-found", 404);
  if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
    return apiError("bad-request", 400);
  }
  if (!(await allowed(deps.limiters.join, clientKey(request)))) {
    return apiError("rate-limited", 429);
  }
  return deps.rooms.getByName(code).fetch(request);
}

function json(body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function apiError(error: ApiErrorCode, status: number): Response {
  return json({ error }, status);
}

function clientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}