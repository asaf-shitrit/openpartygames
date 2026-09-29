import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGamePreload, useRoomGamePreload } from "./useGamePreload";

describe("useRoomGamePreload", () => {
  const preload = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());

  it("prefers the running game over the lobby's pick", () => {
    preload.mockClear();
    renderHook(() =>
      useRoomGamePreload({ game: { id: "imposter" }, selectedGameId: "doodle-bluff" }, preload),
    );
    expect(preload).toHaveBeenCalledExactlyOnceWith("imposter");
  });

  it("falls back to the lobby's pick, and does nothing before there is a room", () => {
    preload.mockClear();
    renderHook(() =>
      useRoomGamePreload({ game: null, selectedGameId: "real-or-nah" }, preload),
    );
    renderHook(() => useRoomGamePreload(null, preload));
    expect(preload).toHaveBeenCalledExactlyOnceWith("real-or-nah");
  });
});

function spy() {
  return vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
}

describe("useGamePreload", () => {
  it("asks for the game's chunk once the room names the game", () => {
    const preload = spy();
    renderHook(() => useGamePreload("imposter", preload));
    expect(preload).toHaveBeenCalledWith("imposter");
  });

  it("does nothing while the room has no game yet", () => {
    const preload = spy();
    renderHook(() => useGamePreload(undefined, preload));
    renderHook(() => useGamePreload("", preload));
    expect(preload).not.toHaveBeenCalled();
  });

  it("asks again only when the game changes", () => {
    const preload = spy();
    const { rerender } = renderHook(({ id }) => useGamePreload(id, preload), {
      initialProps: { id: "imposter" },
    });
    rerender({ id: "imposter" });
    expect(preload).toHaveBeenCalledTimes(1);
    rerender({ id: "doodle-bluff" });
    expect(preload).toHaveBeenCalledTimes(2);
  });
});
