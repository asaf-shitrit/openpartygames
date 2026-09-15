import { describe, expect, it, vi } from "vitest";
import { createMusicSampleStore, createSampleStore } from "./loader";
import { AUDIO_CREDITS, MUSIC_CREDITS } from "./credits";
import { FakeAudioBackend } from "../fixtures/audio";

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createSampleStore", () => {
  it("returns null until the sample lands", async () => {
    const backend = new FakeAudioBackend();
    const store = createSampleStore(backend);
    store.load("slam");
    expect(backend.loaded).toEqual(["/audio/slam.mp3"]);
    expect(store.get("slam")).toBeNull();
    await flush();
    expect(store.get("slam")?.duration).toBeCloseTo(0.1, 5);
  });

  it("loads a cue only once", async () => {
    const backend = new FakeAudioBackend();
    const store = createSampleStore(backend);
    store.load("slam");
    store.load("slam");
    await flush();
    store.load("slam");
    expect(backend.loaded).toHaveLength(1);
  });

  it("ignores cues without a sample", () => {
    const backend = new FakeAudioBackend();
    const store = createSampleStore(backend);
    store.load("tick");
    expect(backend.loaded).toEqual([]);
    expect(store.get("tick")).toBeNull();
  });

  it("stays cold when the file is missing, and can retry", async () => {
    const backend = new FakeAudioBackend();
    backend.failLoads = true;
    const store = createSampleStore(backend);
    store.load("slam");
    await flush();
    expect(store.get("slam")).toBeNull();
    backend.failLoads = false;
    store.load("slam");
    await flush();
    expect(store.get("slam")).not.toBeNull();
  });

  it("preloads every cue with a sample", async () => {
    const backend = new FakeAudioBackend();
    const store = createSampleStore(backend);
    store.preload();
    expect(backend.loaded).toHaveLength(AUDIO_CREDITS.length);
    await flush();
    for (const credit of AUDIO_CREDITS) {
      expect(store.get(credit.cue)).not.toBeNull();
    }
  });

  it("drops cached and late results after dispose", async () => {
    const backend = new FakeAudioBackend();
    const store = createSampleStore(backend);
    store.load("slam");
    store.dispose();
    await flush();
    expect(store.get("slam")).toBeNull();
  });
});

describe("createMusicSampleStore", () => {
  it("notifies onLoaded once a music bed finishes decoding", async () => {
    const backend = new FakeAudioBackend();
    const onLoaded = vi.fn<(music: "lobby" | "tension") => void>();
    const store = createMusicSampleStore(backend, onLoaded);
    store.load("lobby");
    expect(backend.loaded).toEqual(["/audio/lobby.mp3"]);
    expect(store.get("lobby")).toBeNull();
    await flush();
    expect(store.get("lobby")).not.toBeNull();
    expect(onLoaded).toHaveBeenCalledWith("lobby");
  });

  it("loads a music bed only once", async () => {
    const backend = new FakeAudioBackend();
    const store = createMusicSampleStore(backend, () => undefined);
    store.load("lobby");
    store.load("lobby");
    await flush();
    store.load("lobby");
    expect(backend.loaded).toHaveLength(1);
  });

  it("preloads every music bed", async () => {
    const backend = new FakeAudioBackend();
    const store = createMusicSampleStore(backend, () => undefined);
    store.preload();
    expect(backend.loaded).toHaveLength(MUSIC_CREDITS.length);
    await flush();
    for (const credit of MUSIC_CREDITS) {
      expect(store.get(credit.music)).not.toBeNull();
    }
  });

  it("drops cached and late results after dispose", async () => {
    const backend = new FakeAudioBackend();
    const store = createMusicSampleStore(backend, () => undefined);
    store.load("lobby");
    store.dispose();
    await flush();
    expect(store.get("lobby")).toBeNull();
  });
});
