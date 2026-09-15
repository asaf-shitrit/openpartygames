import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoundEngine } from "./engine";
import { recipeDurationMs, recipeFor } from "./synth";
import { SILENT_HANDLE } from "./types";
import { FakeAudioBackend } from "../fixtures/audio";

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

function runningEngine() {
  const backend = new FakeAudioBackend();
  const engine = createSoundEngine(backend);
  engine.unlock();
  return { backend, engine };
}

describe("silent engine", () => {
  it("is used when there is no backend", () => {
    const engine = createSoundEngine(null);
    expect(engine.status()).toBe("unsupported");
    expect(engine.play("slam")).toBe(SILENT_HANDLE);
    engine.unlock();
    engine.setMuted(true);
    engine.preload();
    engine.stopAll();
    expect(engine.subscribe(() => undefined)).toBeInstanceOf(Function);
  });
});

describe("live engine", () => {
  it("starts locked and stays silent until unlocked", () => {
    const backend = new FakeAudioBackend();
    const engine = createSoundEngine(backend);
    expect(engine.status()).toBe("locked");
    engine.play("slam");
    expect(backend.renders).toEqual([]);
    expect(backend.context.resumeCount).toBe(0);
    engine.unlock();
    expect(backend.context.resumeCount).toBe(1);
    expect(engine.status()).toBe("running");
  });

  it("notifies subscribers on status changes and stops on unsubscribe", () => {
    const backend = new FakeAudioBackend();
    const engine = createSoundEngine(backend);
    let calls = 0;
    const unsubscribe = engine.subscribe(() => {
      calls += 1;
    });
    engine.unlock();
    expect(calls).toBe(1);
    unsubscribe();
    backend.context.setState("suspended");
    expect(calls).toBe(1);
    expect(engine.status()).toBe("locked");
  });

  it("does not resume an already running context", () => {
    const { backend, engine } = runningEngine();
    engine.unlock();
    expect(backend.context.resumeCount).toBe(1);
  });

  it("adopts a backend that is already running", () => {
    const backend = new FakeAudioBackend();
    backend.context.state = "running";
    const engine = createSoundEngine(backend);
    expect(engine.status()).toBe("running");
    expect(engine.play("slam")).not.toBe(SILENT_HANDLE);
  });

  it("refreshes the status before deciding to play", () => {
    const backend = new FakeAudioBackend();
    const engine = createSoundEngine(backend);
    expect(engine.status()).toBe("locked");
    backend.context.state = "running";
    expect(engine.play("pop")).not.toBe(SILENT_HANDLE);
    expect(engine.status()).toBe("running");
  });

  it("renders a synth cue when the sample has not loaded", () => {
    const { backend, engine } = runningEngine();
    backend.context.currentTime = 3;
    engine.play("whoosh", { delayMs: 500, gain: 0.5 });
    expect(backend.renders).toHaveLength(1);
    const render = backend.renders[0];
    expect(render?.at).toBeCloseTo(3.5, 5);
    expect(render?.gain).toBe(0.5);
    expect(render?.voices).toEqual(recipeFor("whoosh").voices);
  });

  it("clamps a gain above one", () => {
    const { backend, engine } = runningEngine();
    engine.play("pop", { gain: 9 });
    expect(backend.renders[0]?.gain).toBe(1);
  });

  it("prefers a loaded sample and folds in its manifest gain", async () => {
    const { backend, engine } = runningEngine();
    engine.preload();
    await flush();
    engine.play("slam", { gain: 0.5 });
    expect(backend.renders).toEqual([]);
    expect(backend.samples).toHaveLength(1);
    expect(backend.samples[0]?.gain).toBeCloseTo(0.5, 5);
  });

  it("routes cues through its master gain so mute reaches them", () => {
    const { backend } = runningEngine();
    const master = backend.context.gains[0];
    expect(backend.output).toBe(master);
  });

  it("stays silent while muted and moves the master gain", () => {
    const { backend, engine } = runningEngine();
    backend.context.currentTime = 2;
    const master = backend.context.gains[0];
    engine.setMuted(true);
    expect(master?.gain.events.at(-1)).toEqual({
      kind: "set",
      value: 0,
      time: 2,
    });
    expect(engine.play("slam")).toBe(SILENT_HANDLE);
    expect(backend.renders).toEqual([]);
    engine.setMuted(false);
    expect(master?.gain.events.at(-1)?.value).toBe(1);
    expect(engine.play("slam")).not.toBe(SILENT_HANDLE);
  });

  it("stops everything it started, once", () => {
    const { backend, engine } = runningEngine();
    const first = engine.play("slam");
    engine.play("pop");
    first.stop();
    engine.stopAll();
    expect(backend.renders[0]?.stopped).toBe(true);
    expect(backend.renders[1]?.stopped).toBe(true);
    expect(backend.renders).toHaveLength(2);
  });

  it("removes a handle on its own once the voice has finished playing", () => {
    vi.useFakeTimers();
    const { backend, engine } = runningEngine();
    engine.play("pop");
    vi.advanceTimersByTime(recipeDurationMs(recipeFor("pop")) + 1);
    // The voice already ended naturally; stopAll must not find it in the playing set any more.
    engine.stopAll();
    expect(backend.renders[0]?.stopped).toBe(false);
  });

  it("still lets an explicit stop() cancel the expiry timer cleanly", () => {
    vi.useFakeTimers();
    const { backend, engine } = runningEngine();
    const handle = engine.play("pop");
    handle.stop();
    expect(backend.renders[0]?.stopped).toBe(true);
    // The already-cleared expiry timer must not try to remove the handle again later.
    expect(() => {
      vi.advanceTimersByTime(recipeDurationMs(recipeFor("pop")) + 1);
    }).not.toThrow();
  });

  it("preloads every sample file", () => {
    const { backend, engine } = runningEngine();
    engine.preload();
    expect(backend.loaded).toContain("/audio/slam.mp3");
    expect(backend.loaded).toContain("/audio/buzzer.mp3");
    expect(backend.loaded).toContain("/audio/lobby.mp3");
    expect(backend.loaded).toContain("/audio/tension.mp3");
  });
});

describe("music", () => {
  it("defers a request until the engine unlocks, then starts looping", async () => {
    const backend = new FakeAudioBackend();
    const engine = createSoundEngine(backend);
    engine.playMusic("lobby");
    await flush();
    expect(backend.loopSources).toHaveLength(0);
    engine.unlock();
    await flush();
    expect(backend.loopSources).toHaveLength(1);
    expect(backend.loopSources[0]?.loopStart).toBe(0);
    expect(backend.loopSources[0]?.loopEnd).toBeCloseTo(44.91, 5);
  });

  it("does nothing when the same id is already playing", async () => {
    const { backend, engine } = runningEngine();
    engine.playMusic("lobby");
    await flush();
    engine.playMusic("lobby");
    await flush();
    expect(backend.loopSources).toHaveLength(1);
  });

  it("crossfades from one bed to another", async () => {
    const { backend, engine } = runningEngine();
    engine.playMusic("lobby");
    await flush();
    const first = backend.loopSources[0];
    engine.playMusic("tension");
    await flush();
    expect(backend.loopSources).toHaveLength(2);
    expect(first?.stoppedAt).not.toBeNull();
    expect(backend.loopSources[1]?.loopEnd).toBeCloseTo(40, 5);
  });

  it("fades out and stops the active bed on null", async () => {
    const { backend, engine } = runningEngine();
    engine.playMusic("lobby");
    await flush();
    engine.playMusic(null);
    expect(backend.loopSources[0]?.stoppedAt).not.toBeNull();
  });

  it("ducks the music bus for a loud cue and schedules its recovery", () => {
    const { backend, engine } = runningEngine();
    const musicBus = backend.context.gains[1];
    engine.play("slam");
    const events = musicBus?.gain.events ?? [];
    expect(
      events.some((event) => event.kind === "linear" && event.value === 0.12),
    ).toBe(true);
    expect(
      events.some((event) => event.kind === "linear" && event.value === 0.35),
    ).toBe(true);
  });

  it("leaves the music bus alone for a cue that is not in DUCKING_CUES", () => {
    const { backend, engine } = runningEngine();
    const musicBus = backend.context.gains[1];
    engine.play("pop");
    expect(musicBus?.gain.events).toEqual([]);
  });
});
