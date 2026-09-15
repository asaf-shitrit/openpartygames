// Fires side effects (sound, haptics) exactly once per beat entered live.
import { useEffect, useRef } from "react";
import type { Beat } from "./timeline";
import type { Moment } from "./useMoment";

function beatsKey(beats: readonly Beat[]): string {
  return beats.map((beat) => `${beat.id}@${beat.atMs}`).join("|");
}

/**
 * Calls onEnter once for each beat entered live. Past beats seen at mount never fire.
 * If a late timer jumps several beats at once, only the newest fires.
 */
export function useBeatEntries(
  beats: readonly Beat[],
  moment: Moment,
  onEnter: (beat: Beat) => void,
): void {
  const onEnterRef = useRef(onEnter);
  const beatsRef = useRef(beats);
  const key = beatsKey(beats);
  const keyRef = useRef(key);
  /** Index of the last beat already handled; -1 means nothing handled for this key yet. */
  const firedRef = useRef(-1);

  useEffect(() => {
    onEnterRef.current = onEnter;
    beatsRef.current = beats;
  });

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      firedRef.current = -1;
    }
    const index = moment.index;
    if (index < 0 || index <= firedRef.current) return;
    const first = firedRef.current < 0;
    firedRef.current = index;
    if (first && !moment.live) return;
    const beat = beatsRef.current[index];
    if (beat !== undefined) onEnterRef.current(beat);
  }, [key, moment.index, moment.live]);
}
