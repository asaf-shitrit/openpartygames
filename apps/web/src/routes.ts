// Pure pathname matching for the two surfaces. Kept separate from React so it is easy to test.
import { ROOM_CODE_RE, normalizeRoomCode } from "@opg/protocol";

export type Route =
  | { kind: "credits" }
  | { kind: "privacy" }
  | { kind: "join" }
  | { kind: "host"; code: string }
  | { kind: "player"; code: string }
  | { kind: "landing" };

function matchHost(segments: string[]): Route | null {
  if (segments.length !== 2) return null;
  const [first, code] = segments;
  if (first !== "host" || !code) return null;
  return { kind: "host", code: normalizeRoomCode(code) };
}

function matchPage(segments: string[]): Route | null {
  if (segments.length !== 1) return null;
  const first = segments[0];
  if (first === "credits") return { kind: "credits" };
  if (first === "privacy") return { kind: "privacy" };
  if (first === "join") return { kind: "join" };
  if (first && ROOM_CODE_RE.test(first)) return { kind: "player", code: first };
  return null;
}

/** Resolves a pathname to the screen the app should show. */
export function matchRoute(path: string): Route {
  const segments = path.split("/").filter(Boolean);
  return matchHost(segments) ?? matchPage(segments) ?? { kind: "landing" };
}