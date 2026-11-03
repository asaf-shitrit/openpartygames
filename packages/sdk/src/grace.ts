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
 * What a grace pull-in remembers so a returning player can get the original deadline back:
 * `from` is the deadline the pull-in set, `to` the one it replaced (null when the phase had
 * none). It only counts while the state's deadline is still `from`, so a later phase that
 * carries the field along by accident never restores a stale deadline.
 */
export interface GraceRestore {
  from: number;
  to: number | null;
}

interface GraceState {
  deadline: number | null;
  graceRestore?: GraceRestore | undefined;
}

/**
 * Pulls a phase's deadline in to `min(current deadline, now + LEFT_PLAYER_GRACE_MS)`.
 * Call it when everyone connected has acted and only disconnected players are missing.
 * Returns the same state object when the deadline is already that close, so the room
 * does not treat a repeat call as a change. A real pull-in records the replaced deadline
 * in `graceRestore` for {@link restoreDeadline}.
 */
export function pullInDeadline<S extends GraceState>(state: S, now: number): S {
  const limit = now + LEFT_PLAYER_GRACE_MS;
  if (state.deadline !== null && state.deadline <= limit) return state;
  return {
    ...state,
    deadline: limit,
    graceRestore: { from: limit, to: state.deadline },
  };
}

/**
 * Undoes a {@link pullInDeadline} when a player who had not acted is connected again: the
 * deadline goes back to the original one. The original is never later than it was, so the
 * returning player gets at most what was left of the phase. If the original has already
 * passed, the grace deadline stays so the player still gets the rest of the grace. Returns
 * the same state object when there is nothing to restore.
 */
export function restoreDeadline<S extends GraceState>(state: S, now: number): S {
  const mark = state.graceRestore;
  if (mark === undefined || state.deadline !== mark.from) return state;
  if (mark.to !== null && mark.to <= now) return state;
  return { ...state, deadline: mark.to, graceRestore: undefined };
}
