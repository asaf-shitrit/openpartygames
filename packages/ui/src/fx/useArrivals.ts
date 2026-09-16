// Tracks who just voted or submitted, so their avatar can pop in once. A reconnect
// (the whole list appearing on mount) reports no arrivals.
import { useState } from "react";

/** Ids in next that were not in prev, in next's order. */
export function arrivalsBetween(
  prev: readonly string[],
  next: readonly string[],
): string[] {
  const previousIds = new Set(prev);
  return next.filter((id) => !previousIds.has(id));
}

interface ArrivalsState {
  previous: readonly string[];
  arrivals: readonly string[];
}

/** Returns ids that arrived since the previous render's list. Nothing is reported on mount. */
export function useArrivals(ids: readonly string[]): readonly string[] {
  const [state, setState] = useState<ArrivalsState>(() => ({
    previous: ids,
    arrivals: [],
  }));
  if (state.previous !== ids) {
    const arrivals = arrivalsBetween(state.previous, ids);
    setState({ previous: ids, arrivals });
    return arrivals;
  }
  return state.arrivals;
}
