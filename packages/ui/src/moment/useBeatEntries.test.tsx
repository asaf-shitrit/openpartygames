import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import type { Beat } from "./timeline";
import type { Moment } from "./useMoment";
import { useBeatEntries } from "./useBeatEntries";

const BEATS: readonly Beat[] = [
  { id: "a", atMs: 0 },
  { id: "b", atMs: 100 },
  { id: "c", atMs: 200 },
  { id: "d", atMs: 300 },
];

const OTHER_BEATS: readonly Beat[] = [
  { id: "x", atMs: 0 },
  { id: "y", atMs: 100 },
];

function momentAt(index: number, live: boolean): Moment {
  return {
    index,
    beatId: index < 0 ? null : (BEATS[index]?.id ?? null),
    elapsedMs: index * 100,
    live,
  };
}

interface Props {
  beats: readonly Beat[];
  moment: Moment;
  onEnter: (beat: Beat) => void;
}

function renderEntries(initial: Props) {
  return renderHook(
    (props: Props) => useBeatEntries(props.beats, props.moment, props.onEnter),
    { initialProps: initial },
  );
}

afterEach(cleanup);

describe("useBeatEntries", () => {
  it("fires each beat once while advancing", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    const { rerender } = renderEntries({
      beats: BEATS,
      moment: momentAt(0, true),
      onEnter,
    });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenLastCalledWith(BEATS[0]);

    rerender({ beats: BEATS, moment: momentAt(1, true), onEnter });
    rerender({ beats: BEATS, moment: momentAt(1, true), onEnter });
    expect(onEnter).toHaveBeenCalledTimes(2);

    rerender({ beats: BEATS, moment: momentAt(2, true), onEnter });
    expect(onEnter).toHaveBeenCalledTimes(3);
    expect(onEnter).toHaveBeenLastCalledWith(BEATS[2]);
  });

  it("fires the current beat on a fresh mount", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    renderEntries({ beats: BEATS, moment: momentAt(1, true), onEnter });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(BEATS[1]);
  });

  it("never fires past beats seen at mount", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    const { rerender } = renderEntries({
      beats: BEATS,
      moment: momentAt(2, false),
      onEnter,
    });
    expect(onEnter).not.toHaveBeenCalled();

    rerender({ beats: BEATS, moment: momentAt(3, true), onEnter });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(BEATS[3]);
  });

  it("fires only the newest beat after a jump", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    const { rerender } = renderEntries({
      beats: BEATS,
      moment: momentAt(0, true),
      onEnter,
    });
    rerender({ beats: BEATS, moment: momentAt(3, true), onEnter });
    expect(onEnter).toHaveBeenCalledTimes(2);
    expect(onEnter).toHaveBeenLastCalledWith(BEATS[3]);
  });

  it("does not re-fire when the callback identity changes", () => {
    const first = vi.fn<(beat: Beat) => void>();
    const second = vi.fn<(beat: Beat) => void>();
    const { rerender } = renderEntries({
      beats: BEATS,
      moment: momentAt(1, true),
      onEnter: first,
    });
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ beats: BEATS, moment: momentAt(1, true), onEnter: second });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("resets when the beats change", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    const { rerender } = renderEntries({
      beats: BEATS,
      moment: momentAt(1, true),
      onEnter,
    });
    expect(onEnter).toHaveBeenCalledTimes(1);
    rerender({
      beats: OTHER_BEATS,
      moment: { index: 1, beatId: "y", elapsedMs: 100, live: true },
      onEnter,
    });
    expect(onEnter).toHaveBeenCalledTimes(2);
    expect(onEnter).toHaveBeenLastCalledWith(OTHER_BEATS[1]);
  });

  it("does nothing before the first beat", () => {
    const onEnter = vi.fn<(beat: Beat) => void>();
    renderEntries({ beats: BEATS, moment: momentAt(-1, false), onEnter });
    expect(onEnter).not.toHaveBeenCalled();
  });
});
