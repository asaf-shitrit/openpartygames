/**
 * How long a phase waits for a player who dropped out after everyone still connected has
 * acted. Short enough that a vote does not wait out a 30-45s timer for someone who left,
 * long enough that a phone locking for a second still gets its vote in on reconnect.
 *
 * A server restart does not trigger this: the Worker's restore grace keeps every seat
 * "connected" for 20s after a restore, so nobody looks missing until that has passed.
 */
export const LEFT_PLAYER_GRACE_MS = 8_000;

/**
 * Pulls a phase's deadline in to `min(current deadline, now + LEFT_PLAYER_GRACE_MS)`.
 * Call it when everyone connected has acted and only disconnected players are missing.
 * Returns the same state object when the deadline is already that close, so the room
 * does not treat a repeat call as a change.
 */
export function pullInDeadline<S extends { deadline: number | null }>(
  state: S,
  now: number,
): S {
  const limit = now + LEFT_PLAYER_GRACE_MS;
  if (state.deadline !== null && state.deadline <= limit) return state;
  return { ...state, deadline: limit };
}
