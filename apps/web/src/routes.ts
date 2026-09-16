// Pure pathname matching for the two surfaces. Kept separate from React so it is easy to test.
import { ROOM_CODE_RE, normalizeRoomCode } from "@opg/protocol";

export type Route =
  | { kind: "credits" }
  | { kind: "privacy" }
  | { kind: "join" }
  | { kind: "host"; code: string }
  | { kind: "player"; code: string }
  | { kind: "dev-sounds" }
  | { kind: "dev-moments" }
  | { kind: "landing" };

/** Which sound surface a route belongs to: TVs play sound, phones never do. */
export type Surface = "tv" | "phone";

/** TV routes get the browser engine; phones get silence. */
export function routeSurface(route: Route, narrowTouch: boolean): Surface {
  if (route.kind === "join" || route.kind === "player") return "phone";
  if (route.kind === "landing") return narrowTouch ? "phone" : "tv";
  return "tv";
}

function matchHost(segments: string[]): Route | null {
  if (segments.length !== 2) return null;
  const [first, code] = segments;
  if (first !== "host" || !code) return null;
  return { kind: "host", code: normalizeRoomCode(code) };
}

/** Dev-only pages, matched only when `dev` is true so production never routes to them. */
function matchDev(segments: string[], dev: boolean): Route | null {
  if (!dev) return null;
  const [first, second] = segments;
  if (segments.length !== 2 || first !== "dev") return null;
  if (second === "sounds") return { kind: "dev-sounds" };
  if (second === "moments") return { kind: "dev-moments" };
  return null;
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

/** Resolves a pathname to the screen the app should show. Dev pages are off unless `dev`. */
export function matchRoute(
  path: string,
  dev: boolean = import.meta.env.DEV,
): Route {
  const segments = path.split("/").filter(Boolean);
  return (
    matchHost(segments) ??
    matchDev(segments, dev) ??
    matchPage(segments) ?? { kind: "landing" }
  );
}
