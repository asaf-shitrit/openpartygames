// The hop from the join form ("/" or "/join") to the room page ("/<CODE>").
//
// Tapping Join on the form already says "this name, this room", but the room page is a
// different screen with its own socket, so the name has to travel with the navigation. One
// slot per room code, taken exactly once: a later visit to the same room (a reload, a back
// button) is a reconnect and must not join again under a stale name.

function handoffKey(code: string): string {
  return `opg:autojoin:${code}`;
}

/** Remembers that the join form just asked to join `code` as `name`. */
export function stashJoin(code: string, name: string): void {
  try {
    sessionStorage.setItem(handoffKey(code), name);
  } catch {
    // Storage blocked: the room page falls back to its own form, prefilled where it can be.
  }
}

/** The name the join form left for `code`, once; null when it left none. */
export function takeJoin(code: string): string | null {
  try {
    const name = sessionStorage.getItem(handoffKey(code));
    sessionStorage.removeItem(handoffKey(code));
    return name === null || name === "" ? null : name;
  } catch {
    return null;
  }
}
