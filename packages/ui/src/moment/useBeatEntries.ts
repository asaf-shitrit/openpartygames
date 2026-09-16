// Fires side effects (sound, haptics) exactly once per beat entered live.
import { useEffect, useRef } from "react";
import type { Beat } from "./timeline";
import type { Moment } from "./useMoment";

/**
 * Calls onEnter once for each beat entered live. Past beats seen at mount never fire, and a
 * rebuilt beat list (a kick resizing the ceremony) never replays the beat already playing:
 * the last beat handled is tracked by id, not by position. If a late timer jumps several
 * beats at once, only the newest fires.
 */
export function useBeatEntries(
  beats: readonly Beat[],
  moment: Moment,
  onEnter: (beat: Beat) => void,
): void {
  const onEnterRef = useRef(onEnter);
  /** Id of the last beat handled; null means nothing has been handled yet. */
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    const index = moment.index;
    if (index < 0) return;
    const beat = beats[index];
    if (beat === undefined || beat.id === firedRef.current) return;
    // Mounting, or re-keying, into a beat that is already old never fires its cue.
    if (!moment.live) return;
    firedRef.current = beat.id;
    onEnterRef.current(beat);
  }, [beats, moment.index, moment.live]);
}
