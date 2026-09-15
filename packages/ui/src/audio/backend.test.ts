import { afterEach, describe, expect, it, vi } from "vitest";
import { webAudioBackend, webAudioBackendFor } from "./backend";
import type { SynthVoice } from "./synth";
import { FakeAudioBuffer, FakeAudioContext } from "../fixtures/audio";

const TAIL_SEC = 0.03;
const ATTACK_SEC = 0.006;

function tone(overrides: Partial<SynthVoice> = {}): SynthVoice {
  return {
    kind: "tone",
    offsetMs: 100,
    durationMs: 200,
    gain: 0.5,
    fromHz: 400,
    toHz: 800,
    wave: "square",
    rate: 1,
    filter: null,
    ...overrides,
  };
}

function noise(overrides: Partial<SynthVoice> = {}): SynthVoice {
  return {
    kind: "noise",
    offsetMs: 0,
    durationMs: 120,
    gain: 0.4,
    fromHz: 0,
    toHz: 0,
    wave: "sine",
    rate: 0.9,
    filter: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

function first<T>(items: readonly T[]): T {
  const [value] = items;
  if (value === undefined) throw new Error("expected at least one item");
  return value;
}

describe("webAudioBackend", () => {
  it("returns null when the browser has no AudioContext", () => {
    expect(webAudioBackend()).toBeNull();
  });
});

describe("webAudioBackendFor", () => {
  it("mirrors the context clock, state and resume", async () => {
    const context = new FakeAudioContext();
    context.currentTime = 4.5;
    const backend = webAudioBackendFor(context);
    expect(backend.currentTime()).toBe(4.5);
    expect(backend.state()).toBe("suspended");
    await backend.resume();
    expect(backend.state()).toBe("running");
    expect(context.resumeCount).toBe(1);
    backend.close();
    expect(context.closeCount).toBe(1);
  });

  it("notifies state listeners until they unsubscribe", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    let calls = 0;
    const unsubscribe = backend.onStateChange(() => {
      calls += 1;
    });
    context.setState("running");
    expect(calls).toBe(1);
    unsubscribe();
    context.setState("suspended");
    expect(calls).toBe(1);
  });

  it("schedules a tone envelope and sweep", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([tone()], 10, 0.5);
    const oscillator = first(context.oscillators);
    expect(oscillator.type).toBe("square");
    expect(oscillator.startedAt).toBeCloseTo(10.1, 5);
    expect(oscillator.stoppedAt).toBeCloseTo(10.1 + 0.2 + TAIL_SEC, 5);
    const sweep = oscillator.frequency.events;
    expect(sweep.map((event) => [event.kind, event.value])).toEqual([
      ["set", 400],
      ["exponential", 800],
    ]);
    expect(first(sweep).time).toBeCloseTo(10.1, 5);
    expect(sweep.at(-1)?.time).toBeCloseTo(10.3, 5);
  });

  it("shapes the amplitude envelope and wiring", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    const handle = backend.render([tone()], 10, 0.5);
    const oscillator = first(context.oscillators);
    const amp = first(context.gains);
    const envelope = amp.gain.events;
    expect(envelope.map((event) => [event.kind, event.value])).toEqual([
      ["set", 0],
      ["linear", 0.25],
      ["exponential", 0.0001],
    ]);
    expect(envelope[1]?.time).toBeCloseTo(10.1 + ATTACK_SEC, 5);
    expect(envelope[2]?.time).toBeCloseTo(10.3, 5);
    expect(oscillator.connections).toEqual([amp]);
    expect(amp.connections).toEqual([context.destination]);
    handle.stop();
    expect(oscillator.connections).toEqual([]);
  });

  it("routes cues to the output the engine sets instead of the speakers", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    const master = context.createGain();
    backend.setOutput(master);
    backend.render([tone()], 0, 1);
    backend.playSample(context.createBuffer(1, 10, 44100), 0, 1);
    const [, voiceAmp, sampleAmp] = context.gains;
    expect(voiceAmp?.connections).toEqual([master]);
    expect(sampleAmp?.connections).toEqual([master]);
  });

  it("leaves a steady tone on a single set value", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([tone({ fromHz: 500, toHz: 500 })], 0, 1);
    expect(context.oscillators[0]?.frequency.events).toEqual([
      { kind: "set", value: 500, time: 0.1 },
    ]);
  });

  it("clamps gains into 0..1", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([tone()], 0, 5);
    expect(context.gains[0]?.gain.events[1]?.value).toBe(1);
    backend.render([tone()], 0, -3);
    expect(context.gains[1]?.gain.events[1]?.value).toBe(0);
  });

  it("reuses one cached noise buffer and sets playback rate", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([noise(), noise({ offsetMs: 200 })], 0, 1);
    expect(context.createBufferCalls).toBe(1);
    const source = context.sources[0];
    expect(source?.buffer).not.toBeNull();
    expect(source?.playbackRate.events).toEqual([
      { kind: "set", value: 0.9, time: 0 },
    ]);
    expect(source?.loop).toBe(false);
  });

  it("loops a noise voice that outlasts the buffer", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([noise({ durationMs: 1500 })], 0, 1);
    expect(context.sources[0]?.loop).toBe(true);
  });

  it("fills the noise buffer with nonzero samples", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render([noise()], 0, 1);
    const buffer = context.sources[0]?.buffer;
    if (buffer === null || buffer === undefined) throw new Error("no buffer");
    const data = buffer.getChannelData(0);
    expect(data.some((value) => value !== 0)).toBe(true);
  });

  it("routes a filtered voice through a biquad filter", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    backend.render(
      [
        noise({
          filter: { type: "bandpass", fromHz: 3000, toHz: 1200, q: 2 },
        }),
      ],
      0,
      1,
    );
    const filter = context.filters[0];
    expect(filter?.type).toBe("bandpass");
    expect(filter?.Q.value).toBe(2);
    expect(filter?.frequency.events).toEqual([
      { kind: "set", value: 3000, time: 0 },
      { kind: "exponential", value: 1200, time: 0.12 },
    ]);
    expect(context.sources[0]?.connections).toEqual([filter]);
    expect(filter?.connections).toEqual([context.gains[0]]);
  });

  it("plays a sample with its own gain and stop time", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    const buffer = new FakeAudioBuffer(9600, 48_000);
    const handle = backend.playSample(buffer, 5, 0.7);
    const source = context.sources[0];
    expect(source?.startedAt).toBe(5);
    expect(source?.stoppedAt).toBeCloseTo(5 + 0.2 + TAIL_SEC, 5);
    expect(context.gains[0]?.gain.events).toEqual([
      { kind: "set", value: 0.7, time: 5 },
    ]);
    handle.stop();
    expect(source?.connections).toEqual([]);
  });

  it("stops every voice in a rendered cue", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    const handle = backend.render(
      [tone(), tone({ offsetMs: 0, kind: "noise" })],
      0,
      1,
    );
    handle.stop();
    expect(context.oscillators[0]?.connections).toEqual([]);
    expect(context.sources[0]?.connections).toEqual([]);
  });

  it("fetches and decodes a sample", async () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    const bytes = new ArrayBuffer(8);
    const fetchMock = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(
        new Response(bytes, { headers: { "content-type": "audio/mpeg" } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const decoded = await backend.loadSample("/audio/slam.mp3");
    expect(fetchMock).toHaveBeenCalledWith("/audio/slam.mp3");
    expect(context.decoded).toHaveLength(1);
    expect(decoded.duration).toBeCloseTo(0.1, 5);
  });

  it("rejects a missing file instead of decoding the app's HTML fallback", async () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>(() =>
        Promise.resolve(
          new Response("<!doctype html>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        ),
      ),
    );
    await expect(backend.loadSample("/audio/gone.mp3")).rejects.toThrow(
      "no audio sample",
    );
    expect(context.decoded).toEqual([]);
  });

  it("rejects an error response", async () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>(() =>
        Promise.resolve(new Response("", { status: 404 })),
      ),
    );
    await expect(backend.loadSample("/audio/gone.mp3")).rejects.toThrow(
      "no audio sample",
    );
  });

  it("exposes the destination and creates gain nodes", () => {
    const context = new FakeAudioContext();
    const backend = webAudioBackendFor(context);
    expect(backend.destination()).toBe(context.destination);
    expect(backend.createGain()).toBe(context.gains[0]);
  });
});
