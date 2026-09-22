// HTTP API client for the worker routes. Untrusted responses are parsed with zod.
import { z } from "zod";
import type {
  ApiErrorCode,
  ContentLanguage,
  CreateRoomResponse,
  RoomInfoResponse,
} from "@opg/protocol";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const API_ERROR_CODES = [
  "full-tonight",
  "rate-limited",
  "not-found",
  "bad-request",
  "internal",
] as const satisfies readonly ApiErrorCode[];

const apiErrorSchema = z.object({ error: z.enum(API_ERROR_CODES) });

const createRoomSchema = z.object({
  code: z.string(),
  hostToken: z.string(),
});

const roomInfoSchema = z.object({
  code: z.string(),
  exists: z.boolean(),
  locked: z.boolean(),
  inGame: z.boolean(),
  playerCount: z.number(),
  joinable: z.boolean(),
});

async function parseJson<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<T | null> {
  try {
    const result = schema.safeParse(await res.json());
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function readError(res: Response): Promise<ApiError> {
  const body = await parseJson(res, apiErrorSchema);
  return new ApiError(
    body?.error ?? "internal",
    `Request failed with ${res.status}`,
  );
}

/**
 * The fetch init for POST /api/rooms; omitting both fields sends no body, matching an
 * older client.
 */
function createRoomInit(
  sharedScreen?: boolean,
  contentLanguage?: ContentLanguage,
): RequestInit {
  if (sharedScreen === undefined && contentLanguage === undefined) {
    return { method: "POST" };
  }
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sharedScreen, contentLanguage }),
  };
}

/**
 * POST /api/rooms — creates a room and returns its code and host token.
 * Omitting `sharedScreen` (the default) makes a shared-screen room, and omitting
 * `contentLanguage` (the default) makes an English-content room, same as an older client.
 */
export async function createRoom(
  sharedScreen?: boolean,
  contentLanguage?: ContentLanguage,
): Promise<CreateRoomResponse> {
  const res = await fetch("/api/rooms", createRoomInit(sharedScreen, contentLanguage));
  if (!res.ok) throw await readError(res);
  const body = await parseJson(res, createRoomSchema);
  if (!body) throw new ApiError("internal", "Unexpected room response");
  return body;
}

/** GET /api/rooms/:code — room info used to validate a join before connecting. */
export async function getRoomInfo(code: string): Promise<RoomInfoResponse> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) throw await readError(res);
  const body = await parseJson(res, roomInfoSchema);
  if (!body) throw new ApiError("internal", "Unexpected room info response");
  return body;
}
