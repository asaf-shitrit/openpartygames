// Web Audio adapter. `AudioBackend` is the seam: the engine schedules against it, tests inject
// a fake, and browsers without Web Audio get the silent engine.
import type { SynthVoice } from "./synth";
import type { CueHandle } from "./types";

/**
 * The slice of the Web Audio API the engine uses. A real `AudioContext` satisfies it, so the
 * adapter needs no casts and tests can drive it with a recording fake.
 */
export interface WebAudioParam {
  value: number;
  setValueAtTime(value: number, startTime: number): WebAudioParam;
  linearRampToValueAtTime(value: number, endTime: number): WebAudioParam;
  exponentialRampToValueAtTime(value: number, endTime: number): WebAudioParam;
  cancelScheduledValues(startTime: number): WebAudioParam;
}

export interface WebAudioNode {
  connect(destination: WebAudioNode): WebAudioNode;
  disconnect(): void;
}

export interface WebGainNode extends WebAudioNode {
  readonly gain: WebAudioParam;
}

export interface WebScheduledSource extends WebAudioNode {
  start(when: number): void;
  stop(when: number): void;
}

export interface WebOscillatorNode extends WebScheduledSource {
  type: OscillatorType;
  readonly frequency: WebAudioParam;
  readonly detune: WebAudioParam;
}

export interface WebBufferSourceNode extends WebScheduledSource {
  buffer: WebAudioBuffer | null;
  readonly playbackRate: WebAudioParam;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
}

export interface WebBiquadFilterNode extends WebAudioNode {
  type: BiquadFilterType;
  readonly frequency: WebAudioParam;
  readonly Q: WebAudioParam;
}

export interface WebAudioBuffer {
  readonly duration: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface WebAudioContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextState;
  readonly destination: WebAudioNode;
  createGain(): WebGainNode;
  createOscillator(): WebOscillatorNode;
  createBufferSource(): WebBufferSourceNode;
  createBiquadFilter(): WebBiquadFilterNode;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): WebAudioBuffer;
  decodeAudioData(data: ArrayBuffer): Promise<WebAudioBuffer>;
  resume(): Promise<void>;
  close(): void;
  addEventListener(type: "statechange", listener: () => void): void;
}

export interface LoopBounds {
  loopStart: number;
  loopEnd: number;
}

export interface AudioBackend {
  currentTime(): number;
  state(): AudioContextState;
  resume(): Promise<void>;
  onStateChange(listener: () => void): () => void;
  destination(): WebAudioNode;
  /** Where cues connect. Defaults to the speakers; the engine points it at its master gain. */
  setOutput(node: WebAudioNode): void;
  createGain(): WebGainNode;
  /** Schedules every voice of one cue and returns a handle that silences them. */
  render(voices: readonly SynthVoice[], at: number, gain: number): CueHandle;
  playSample(buffer: WebAudioBuffer, at: number, gain: number): CueHandle;
  /** A looping buffer source connected to `destination`, ready to `.start(at)`. */
  createLoopingSource(
    buffer: WebAudioBuffer,
    loop: LoopBounds,
    destination: WebAudioNode,
  ): WebBufferSourceNode;
  /** Fetches and decodes one sample. Rejects when the file is missing or undecodable. */
  loadSample(url: string): Promise<WebAudioBuffer>;
  close(): void;
}

export interface AudioContextConstructor {
  new (): AudioContext;
}

/** The browser engine, or null when Web Audio is missing or refuses to start. */
export function webAudioBackend(): AudioBackend | null {
  const contextConstructor = audioContextConstructor();
  if (contextConstructor === null) return null;
  return tryCreateBackend(contextConstructor);
}

function audioContextConstructor(): AudioContextConstructor | null {
  return "AudioContext" in globalThis ? AudioContext : null;
}

function tryCreateBackend(
  contextConstructor: AudioContextConstructor,
): AudioBackend | null {
  try {
    return webAudioBackendFor(new contextConstructor());
  } catch {
    return null;
  }
}

const MIN_GAIN = 0.0001;
const ATTACK_SEC = 0.006;
const TAIL_SEC = 0.03;
const NOISE_SECONDS = 1;

interface TimeWindow {
  startAt: number;
  endAt: number;
}

interface RenderKit {
  context: WebAudioContext;
  destination: WebAudioNode;
  noise: () => WebAudioBuffer;
}

/** Wraps any Web Audio context — a real one, or a recording fake in tests. */
export function webAudioBackendFor(context: WebAudioContext): AudioBackend {
  const stateListeners = new Set<() => void>();
  let noiseBuffer: WebAudioBuffer | null = null;
  const kit: RenderKit = {
    context,
    destination: context.destination,
    noise: () => {
      noiseBuffer ??= createNoise(context);
      return noiseBuffer;
    },
  };

  function notify(): void {
    for (const listener of stateListeners) listener();
  }

  context.addEventListener("statechange", notify);

  return {
    currentTime: () => context.currentTime,
    state: () => context.state,
    resume: () => context.resume(),
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    destination: () => context.destination,
    setOutput(node) {
      kit.destination = node;
    },
    createGain: () => context.createGain(),
    render: (voices, at, gain) => renderVoices(kit, voices, at, gain),
    playSample: (buffer, at, gain) => playBufferSample(kit, buffer, at, gain),
    createLoopingSource: (buffer, loop, destination) =>
      createLoopingSource(kit, buffer, loop, destination),
    loadSample: (url) => loadSample(context, url),
    close: () => context.close(),
  };
}

function createLoopingSource(
  kit: RenderKit,
  buffer: WebAudioBuffer,
  loop: LoopBounds,
  destination: WebAudioNode,
): WebBufferSourceNode {
  const source = kit.context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = loop.loopStart;
  source.loopEnd = loop.loopEnd;
  source.connect(destination);
  return source;
}

function voiceWindow(voice: SynthVoice, at: number): TimeWindow {
  const startAt = at + voice.offsetMs / 1000;
  return { startAt, endAt: startAt + voice.durationMs / 1000 };
}

function scheduleEnvelope(
  gainParam: WebAudioParam,
  window: TimeWindow,
  peak: number,
): void {
  gainParam.setValueAtTime(0, window.startAt);
  gainParam.linearRampToValueAtTime(peak, window.startAt + ATTACK_SEC);
  gainParam.exponentialRampToValueAtTime(MIN_GAIN, window.endAt);
}

function scheduleSweep(
  param: WebAudioParam,
  fromHz: number,
  toHz: number,
  window: TimeWindow,
): void {
  param.setValueAtTime(fromHz, window.startAt);
  if (fromHz !== toHz) {
    param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, toHz), window.endAt);
  }
}

function createToneSource(
  kit: RenderKit,
  voice: SynthVoice,
  window: TimeWindow,
): WebScheduledSource {
  const oscillator = kit.context.createOscillator();
  oscillator.type = voice.wave;
  scheduleSweep(oscillator.frequency, voice.fromHz, voice.toHz, window);
  return oscillator;
}

function createNoiseSource(
  kit: RenderKit,
  voice: SynthVoice,
  window: TimeWindow,
): WebScheduledSource {
  const sample = kit.noise();
  const source = kit.context.createBufferSource();
  source.buffer = sample;
  source.loop = window.endAt - window.startAt > sample.duration;
  source.playbackRate.setValueAtTime(voice.rate, window.startAt);
  return source;
}

function createSource(
  kit: RenderKit,
  voice: SynthVoice,
  window: TimeWindow,
): WebScheduledSource {
  if (voice.kind === "tone") return createToneSource(kit, voice, window);
  return createNoiseSource(kit, voice, window);
}

function createFilter(
  kit: RenderKit,
  amp: WebGainNode,
  voice: SynthVoice,
  window: TimeWindow,
): WebAudioNode {
  if (voice.filter === null) return amp;
  const filter = kit.context.createBiquadFilter();
  filter.type = voice.filter.type;
  filter.Q.value = voice.filter.q;
  scheduleSweep(
    filter.frequency,
    voice.filter.fromHz,
    voice.filter.toHz,
    window,
  );
  filter.connect(amp);
  return filter;
}

function renderVoice(
  kit: RenderKit,
  voice: SynthVoice,
  at: number,
  gain: number,
): () => void {
  const window = voiceWindow(voice, at);
  const amp = kit.context.createGain();
  scheduleEnvelope(amp.gain, window, clamp(gain * voice.gain));
  const head = createFilter(kit, amp, voice, window);
  const source = createSource(kit, voice, window);
  source.connect(head);
  source.start(window.startAt);
  source.stop(window.endAt + TAIL_SEC);
  amp.connect(kit.destination);
  return () => source.disconnect();
}

function renderVoices(
  kit: RenderKit,
  voices: readonly SynthVoice[],
  at: number,
  gain: number,
): CueHandle {
  const stops = voices.map((voice) => renderVoice(kit, voice, at, gain));
  return {
    stop() {
      for (const stop of stops) stop();
    },
  };
}

function playBufferSample(
  kit: RenderKit,
  buffer: WebAudioBuffer,
  at: number,
  gain: number,
): CueHandle {
  const source = kit.context.createBufferSource();
  source.buffer = buffer;
  const amp = kit.context.createGain();
  amp.gain.setValueAtTime(clamp(gain), at);
  source.connect(amp);
  amp.connect(kit.destination);
  source.start(at);
  source.stop(at + buffer.duration + TAIL_SEC);
  return {
    stop() {
      source.disconnect();
    },
  };
}

function loadSample(
  context: WebAudioContext,
  url: string,
): Promise<WebAudioBuffer> {
  return fetch(url)
    .then((response) => {
      // A missing file comes back as the SPA's index.html with a 200, so check the type too.
      if (!response.ok || isHtml(response)) {
        throw new Error(`no audio sample at ${url}`);
      }
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data));
}

function isHtml(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createNoise(context: WebAudioContext): WebAudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * NOISE_SECONDS));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  fillNoise(buffer.getChannelData(0));
  return buffer;
}

function fillNoise(data: Float32Array): void {
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
}
