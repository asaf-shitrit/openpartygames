// Recording fakes for audio tests. happy-dom has no AudioContext, so the backend, engine and
// moments all run against these instead of mocking modules.
import type {
  AudioBackend,
  LoopBounds,
  WebAudioBuffer,
  WebAudioContext,
  WebAudioNode,
  WebAudioParam,
  WebBiquadFilterNode,
  WebBufferSourceNode,
  WebGainNode,
  WebOscillatorNode,
} from "../audio/backend";
import type { SynthVoice } from "../audio/synth";
import type {
  CueHandle,
  CueId,
  CueOptions,
  MusicId,
  SoundEngine,
  SoundStatus,
} from "../audio/types";

export interface ParamEvent {
  kind: "set" | "linear" | "exponential" | "cancel";
  value: number;
  time: number;
}

/** Records every automation call so tests can assert the envelope a voice schedules. */
export class FakeAudioParam implements WebAudioParam {
  value = 0;
  readonly events: ParamEvent[] = [];

  setValueAtTime(value: number, time: number): WebAudioParam {
    this.value = value;
    this.events.push({ kind: "set", value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): WebAudioParam {
    this.value = value;
    this.events.push({ kind: "linear", value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): WebAudioParam {
    this.value = value;
    this.events.push({ kind: "exponential", value, time });
    return this;
  }

  cancelScheduledValues(time: number): WebAudioParam {
    this.events.push({ kind: "cancel", value: this.value, time });
    return this;
  }
}

export class FakeAudioNode implements WebAudioNode {
  readonly connections: WebAudioNode[] = [];

  connect(destination: WebAudioNode): WebAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.connections.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode implements WebGainNode {
  readonly gain = new FakeAudioParam();
}

export class FakeOscillatorNode
  extends FakeAudioNode
  implements WebOscillatorNode
{
  type: OscillatorType = "sine";
  readonly frequency = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  start(when: number): void {
    this.startedAt = when;
  }

  stop(when: number): void {
    this.stoppedAt = when;
  }
}

export class FakeBufferSourceNode
  extends FakeAudioNode
  implements WebBufferSourceNode
{
  buffer: WebAudioBuffer | null = null;
  readonly playbackRate = new FakeAudioParam();
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  start(when: number): void {
    this.startedAt = when;
  }

  stop(when: number): void {
    this.stoppedAt = when;
  }
}

export class FakeBiquadFilterNode
  extends FakeAudioNode
  implements WebBiquadFilterNode
{
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}

export class FakeAudioBuffer implements WebAudioBuffer {
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  readonly label: string;
  private readonly data: Float32Array;

  constructor(length = 4800, sampleRate = 48_000, label = "") {
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.label = label;
    this.data = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeAudioContext implements WebAudioContext {
  currentTime = 0;
  sampleRate = 48_000;
  state: AudioContextState = "suspended";
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly decoded: ArrayBuffer[] = [];
  resumeCount = 0;
  closeCount = 0;
  createBufferCalls = 0;
  readonly events = new Set<() => void>();

  createGain(): WebGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): WebOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): WebBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.sources.push(node);
    return node;
  }

  createBiquadFilter(): WebBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBuffer(
    _channels: number,
    length: number,
    sampleRate: number,
  ): WebAudioBuffer {
    this.createBufferCalls += 1;
    return new FakeAudioBuffer(length, sampleRate);
  }

  decodeAudioData(data: ArrayBuffer): Promise<WebAudioBuffer> {
    this.decoded.push(data);
    return Promise.resolve(
      new FakeAudioBuffer(4800, this.sampleRate, "decoded"),
    );
  }

  resume(): Promise<void> {
    this.resumeCount += 1;
    this.setState("running");
    return Promise.resolve();
  }

  close(): void {
    this.closeCount += 1;
    this.setState("closed");
  }

  addEventListener(_type: "statechange", listener: () => void): void {
    this.events.add(listener);
  }

  setState(state: AudioContextState): void {
    this.state = state;
    for (const listener of this.events) listener();
  }
}

export interface RenderedCue {
  voices: readonly SynthVoice[];
  at: number;
  gain: number;
  stopped: boolean;
}

export interface PlayedSample {
  buffer: WebAudioBuffer;
  at: number;
  gain: number;
  stopped: boolean;
}

/** An AudioBackend that records instead of making sound. */
export class FakeAudioBackend implements AudioBackend {
  readonly context = new FakeAudioContext();
  readonly renders: RenderedCue[] = [];
  readonly samples: PlayedSample[] = [];
  readonly loopSources: FakeBufferSourceNode[] = [];
  readonly loaded: string[] = [];
  failLoads = false;

  currentTime(): number {
    return this.context.currentTime;
  }

  state(): AudioContextState {
    return this.context.state;
  }

  resume(): Promise<void> {
    return this.context.resume();
  }

  onStateChange(listener: () => void): () => void {
    this.context.addEventListener("statechange", listener);
    return () => {
      this.context.events.delete(listener);
    };
  }

  destination(): WebAudioNode {
    return this.context.destination;
  }

  /** The node cues are routed to, as set by the engine. */
  output: WebAudioNode | null = null;

  setOutput(node: WebAudioNode): void {
    this.output = node;
  }

  createGain(): WebGainNode {
    return this.context.createGain();
  }

  render(voices: readonly SynthVoice[], at: number, gain: number): CueHandle {
    const entry: RenderedCue = { voices, at, gain, stopped: false };
    this.renders.push(entry);
    return {
      stop() {
        entry.stopped = true;
      },
    };
  }

  playSample(buffer: WebAudioBuffer, at: number, gain: number): CueHandle {
    const entry: PlayedSample = { buffer, at, gain, stopped: false };
    this.samples.push(entry);
    return {
      stop() {
        entry.stopped = true;
      },
    };
  }

  createLoopingSource(
    buffer: WebAudioBuffer,
    loop: LoopBounds,
    destination: WebAudioNode,
  ): WebBufferSourceNode {
    const source = new FakeBufferSourceNode();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = loop.loopStart;
    source.loopEnd = loop.loopEnd;
    source.connect(destination);
    this.context.sources.push(source);
    this.loopSources.push(source);
    return source;
  }

  loadSample(url: string): Promise<WebAudioBuffer> {
    this.loaded.push(url);
    if (this.failLoads) return Promise.reject(new Error(`missing ${url}`));
    return Promise.resolve(
      new FakeAudioBuffer(4800, this.context.sampleRate, url),
    );
  }

  close(): void {
    this.context.close();
  }
}

export interface FakePlay {
  cue: CueId;
  options: CueOptions | undefined;
  stopped: boolean;
  stopCount: number;
}

/** A SoundEngine that records cues instead of playing them. */
export class FakeSoundEngine implements SoundEngine {
  readonly plays: FakePlay[] = [];
  readonly musicCalls: (MusicId | null)[] = [];
  readonly muteHistory: boolean[] = [];
  readonly listeners = new Set<() => void>();
  unlockCount = 0;
  preloadCount = 0;
  stopAllCount = 0;
  private current: SoundStatus;
  private muted = false;

  constructor(status: SoundStatus = "running") {
    this.current = status;
  }

  status(): SoundStatus {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setStatus(status: SoundStatus): void {
    this.current = status;
    for (const listener of this.listeners) listener();
  }

  unlock(): void {
    this.unlockCount += 1;
    this.setStatus("running");
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.muteHistory.push(value);
  }

  isMuted(): boolean {
    return this.muted;
  }

  preload(): void {
    this.preloadCount += 1;
  }

  play(cue: CueId, options?: CueOptions): CueHandle {
    const entry: FakePlay = { cue, options, stopped: false, stopCount: 0 };
    this.plays.push(entry);
    return {
      stop() {
        entry.stopped = true;
        entry.stopCount += 1;
      },
    };
  }

  playMusic(id: MusicId | null): void {
    this.musicCalls.push(id);
  }

  stopAll(): void {
    this.stopAllCount += 1;
  }
}
