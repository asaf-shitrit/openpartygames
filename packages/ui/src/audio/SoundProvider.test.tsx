import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { SoundProvider, topClaim, useCue, useMusic, useSound } from "./SoundProvider";
import type { MusicId } from "./types";
import { FakeSoundEngine } from "../fixtures/audio";

const visibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
}

function wrapperFor(engine: FakeSoundEngine) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SoundProvider engine={engine}>{children}</SoundProvider>;
  };
}

function MuteToggle() {
  const { muted, toggleMuted } = useSound();
  return (
    <button type="button" onClick={toggleMuted}>
      {muted ? "muted" : "loud"}
    </button>
  );
}

async function pressKey(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  });
}

/** Drains the microtask queue, including the coalesced music-claim flush. */
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  if (visibilityDescriptor === undefined) {
    Reflect.deleteProperty(document, "visibilityState");
  } else {
    Object.defineProperty(document, "visibilityState", visibilityDescriptor);
  }
});

describe("useSound without a provider", () => {
  it("reports silence and still persists the mute intent", () => {
    const { result } = renderHook(() => useSound());
    expect(result.current.status).toBe("unsupported");
    expect(result.current.muted).toBe(false);
    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem("opg:muted")).toBe("1");
  });

  it("reads the stored mute flag", () => {
    localStorage.setItem("opg:muted", "1");
    const { result } = renderHook(() => useSound());
    expect(result.current.muted).toBe(true);
  });
});

describe("SoundProvider", () => {
  it("exposes the engine status and follows status changes", () => {
    const engine = new FakeSoundEngine("locked");
    const { result } = renderHook(() => useSound(), {
      wrapper: wrapperFor(engine),
    });
    expect(result.current.status).toBe("locked");
    act(() => engine.setStatus("running"));
    expect(result.current.status).toBe("running");
  });

  it("preloads once and mirrors the stored mute flag", () => {
    const engine = new FakeSoundEngine();
    render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    expect(engine.preloadCount).toBe(1);
    expect(engine.muteHistory).toEqual([false]);
  });

  it("pushes a mute toggle into the engine", async () => {
    const engine = new FakeSoundEngine();
    render(
      <SoundProvider engine={engine}>
        <MuteToggle />
      </SoundProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "loud" }));
    expect(engine.muteHistory).toEqual([false, true]);
    expect(localStorage.getItem("opg:muted")).toBe("1");
  });

  it("follows the engine prop across a route swap", () => {
    const television = new FakeSoundEngine("running");
    const phone = new FakeSoundEngine("locked");
    const { rerender } = render(
      <SoundProvider engine={television}>
        <span>child</span>
      </SoundProvider>,
    );
    expect(television.preloadCount).toBe(1);
    rerender(
      <SoundProvider engine={phone}>
        <span>child</span>
      </SoundProvider>,
    );
    expect(phone.preloadCount).toBe(1);
    expect(phone.muteHistory).toEqual([false]);
  });

  it("unlocks when the page becomes visible", async () => {
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    setVisibility("hidden");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(engine.unlockCount).toBe(0);
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(engine.unlockCount).toBe(1);
  });

  it("removes its visibility listener on unmount", async () => {
    const engine = new FakeSoundEngine("locked");
    const { unmount } = render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    unmount();
    setVisibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(engine.unlockCount).toBe(0);
  });

  it("unlocks on the first key press while locked, then drops the listener", async () => {
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    await pressKey();
    expect(engine.unlockCount).toBe(1);
    await pressKey();
    expect(engine.unlockCount).toBe(1);
  });

  it.each(["pointerup", "touchend", "click"])(
    "unlocks on a %s, which is what counts as a gesture on touch screens",
    async (type) => {
      const engine = new FakeSoundEngine("locked");
      render(
        <SoundProvider engine={engine}>
          <span>child</span>
        </SoundProvider>,
      );
      await act(async () => {
        window.dispatchEvent(new Event(type));
      });
      expect(engine.unlockCount).toBe(1);
    },
  );

  it("unlocks on a pointerdown while locked", async () => {
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    expect(engine.unlockCount).toBe(1);
  });

  it("adds no unlock listener while muted or unsupported", async () => {
    localStorage.setItem("opg:muted", "1");
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    await pressKey();
    expect(engine.unlockCount).toBe(0);
  });

  it("drops the unlock listener on unmount", async () => {
    const engine = new FakeSoundEngine("locked");
    const { unmount } = render(
      <SoundProvider engine={engine}>
        <span>child</span>
      </SoundProvider>,
    );
    unmount();
    await pressKey();
    expect(engine.unlockCount).toBe(0);
  });
});

describe("useCue", () => {
  it("plays a cue on the provider's engine", () => {
    const engine = new FakeSoundEngine();
    const { result } = renderHook(() => useCue(), {
      wrapper: wrapperFor(engine),
    });
    act(() => {
      result.current("slam", { delayMs: 10, gain: 0.5 });
    });
    expect(engine.plays).toEqual([
      {
        cue: "slam",
        options: { delayMs: 10, gain: 0.5 },
        stopped: false,
        stopCount: 0,
      },
    ]);
  });

  it("stops every cue still playing when it unmounts", () => {
    const engine = new FakeSoundEngine();
    const { result, unmount } = renderHook(() => useCue(), {
      wrapper: wrapperFor(engine),
    });
    act(() => {
      result.current("slam");
      result.current("pop");
    });
    expect(engine.plays.map((play) => play.stopped)).toEqual([false, false]);
    unmount();
    expect(engine.plays.map((play) => play.stopped)).toEqual([true, true]);
  });

  it("does not stop a handle that was already stopped", () => {
    const engine = new FakeSoundEngine();
    const { result, unmount } = renderHook(() => useCue(), {
      wrapper: wrapperFor(engine),
    });
    const first = result.current("slam");
    result.current("pop");
    act(() => first.stop());
    unmount();
    expect(engine.plays.map((play) => play.stopCount)).toEqual([1, 1]);
  });

  it("returns a silent handle outside a provider", () => {
    const { result } = renderHook(() => useCue());
    const handle = result.current("pop");
    expect(() => handle.stop()).not.toThrow();
  });
});

function MusicClaimA() {
  useMusic("lobby");
  return null;
}

function MusicClaimB() {
  useMusic("tension");
  return null;
}

function StackedClaims({ showSecond }: { showSecond: boolean }) {
  return (
    <>
      <MusicClaimA />
      {showSecond ? <MusicClaimB /> : null}
    </>
  );
}

function SameMusicClaimTwice() {
  useMusic("lobby");
  useMusic("lobby");
  return null;
}

function SwapClaim({ showA }: { showA: boolean }) {
  return showA ? <MusicClaimA /> : <MusicClaimB />;
}

function ClaimA({ music }: { music: MusicId }) {
  useMusic(music);
  return null;
}

/** A: mounts alone, then B and C join one at a time so each stage gets its own flush. */
function ReorderScenario({
  stage,
  aMusic,
}: {
  stage: 1 | 2 | 3;
  aMusic: MusicId;
}) {
  return (
    <>
      <ClaimA music={aMusic} />
      {stage >= 2 ? <MusicClaimB /> : null}
      {stage >= 3 ? <ClaimA music="lobby" key="c" /> : null}
    </>
  );
}

describe("topClaim", () => {
  it("is null with no claims and the last entry once there are some", () => {
    expect(topClaim([])).toBeNull();
    expect(topClaim(["lobby"])).toBe("lobby");
    expect(topClaim(["lobby", "tension"])).toBe("tension");
  });
});

describe("useMusic", () => {
  it("claims the bus on mount and releases it on unmount", async () => {
    const engine = new FakeSoundEngine();
    const { unmount } = renderHook(() => useMusic("lobby"), {
      wrapper: wrapperFor(engine),
    });
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby"]);
    unmount();
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby", null]);
  });

  it("moves its claim to the top when the id changes, in one coalesced call", async () => {
    const engine = new FakeSoundEngine();
    const { rerender } = renderHook(
      ({ music }: { music: MusicId }) => useMusic(music),
      {
        wrapper: wrapperFor(engine),
        initialProps: { music: "lobby" },
      },
    );
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby"]);
    rerender({ music: "tension" });
    await flushMicrotasks();
    // The cleanup (null) and the new claim (tension) land in the same commit, so they
    // coalesce into a single crossfade rather than a drop to silence and back.
    expect(engine.musicCalls).toEqual(["lobby", "tension"]);
  });

  it("stacks claims from two sibling components and unstacks on unmount", async () => {
    const engine = new FakeSoundEngine();
    const { rerender } = render(<StackedClaims showSecond={true} />, {
      wrapper: wrapperFor(engine),
    });
    await flushMicrotasks();
    // Both siblings mount in the same commit, so only the final top claim ever reaches the
    // engine — "lobby" is never played.
    expect(engine.musicCalls).toEqual(["tension"]);
    rerender(<StackedClaims showSecond={false} />);
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["tension", "lobby"]);
  });

  it("calls playMusic only when the top claim actually changes", async () => {
    const engine = new FakeSoundEngine();
    render(<SameMusicClaimTwice />, { wrapper: wrapperFor(engine) });
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby"]);
  });

  it("coalesces an unmount and a mount in the same commit into one playMusic call", async () => {
    const engine = new FakeSoundEngine();
    const { rerender } = render(<SwapClaim showA={true} />, {
      wrapper: wrapperFor(engine),
    });
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby"]);
    rerender(<SwapClaim showA={false} />);
    await flushMicrotasks();
    // One component unmounts (dropping "lobby") and another mounts ("tension") in the same
    // commit; the engine should see one crossfade straight to the final id, not a dip to null.
    expect(engine.musicCalls).toEqual(["lobby", "tension"]);
  });

  it("moves an existing claim to the top of the stack when its music changes", async () => {
    const engine = new FakeSoundEngine();
    const { rerender } = render(<ReorderScenario stage={1} aMusic="lobby" />, {
      wrapper: wrapperFor(engine),
    });
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby"]);

    rerender(<ReorderScenario stage={2} aMusic="lobby" />);
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby", "tension"]);

    rerender(<ReorderScenario stage={3} aMusic="lobby" />);
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby", "tension", "lobby"]);

    // A is at the bottom of the stack holding "lobby"; C (top) also holds "lobby". Moving A to
    // "tension" only reaches the engine if A is re-inserted above C, not left in place.
    rerender(<ReorderScenario stage={3} aMusic="tension" />);
    await flushMicrotasks();
    expect(engine.musicCalls).toEqual(["lobby", "tension", "lobby", "tension"]);
  });
});
