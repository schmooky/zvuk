import { BusNotFoundError, EngineClosedError, SoundNotFoundError } from '../errors';
import { Parameter } from '../params/parameter';
import { pickSource } from '../runtime/codecs';
import { AudioContextHost, type EngineState } from '../runtime/context';
import { Decoder, type DecodeOptions } from '../runtime/decode';
import { Scheduler } from '../runtime/scheduler';
import { Sound } from '../sources/sound';
import type { Voice } from '../sources/voice';
import { Spatializer } from '../spatial/spatializer';
import type { EngineConfig, LoadSoundOptions, SpatialOptions } from '../types';
import { Bus } from './bus';
import { Master } from './master';
import { Snapshot, type SnapshotState } from './snapshot';

export interface Engine {
  readonly state: EngineState;
  readonly now: number;
  /** Live AudioContext. Constructs one on first read. Throws if engine is closed. */
  readonly context: AudioContext;

  unlock(): Promise<void>;
  close(): Promise<void>;

  /**
   * Load and decode an audio asset.
   *
   * Pass an array of URLs to ship a codec ladder — e.g. ['coin.webm', 'coin.m4a'].
   * The first URL the browser can decode wins; this is how you serve Opus to
   * everyone except older iOS Safari without bloating the bundle.
   */
  loadSound(name: string, url: string | readonly string[], options?: LoadSoundOptions): Promise<Sound>;
  /** Register a Sound from an AudioBuffer you constructed yourself (procedural, custom-decoded, time-stretched). */
  createSound(name: string, buffer: AudioBuffer, options?: { bus?: string }): Sound;
  /** Drop a sound from the registry. Active voices keep playing until they end naturally. */
  removeSound(name: string): void;
  hasSound(name: string): boolean;

  sound(name: string): Sound;
  bus(name: string): Bus;

  scheduleAt(audioTime: number, fn: () => void): () => void;

  /** All currently active voices (across all buses). */
  activeVoices(): readonly Voice[];

  onStateChange(fn: (s: EngineState) => void): () => void;

  /** Get or create a named Parameter. */
  parameter(name: string, initial?: number): Parameter;

  /** Capture the current mix state into a named Snapshot. */
  captureSnapshot(name: string): Snapshot;

  /** Build a Snapshot from explicit state without capturing the live engine. */
  snapshot(name: string, state: SnapshotState): Snapshot;
}

/**
 * Construct a new engine. Does NOT touch the AudioContext — that happens on
 * the first unlock() or play() call. Safe to call before any user gesture.
 */
export function createEngine(config: EngineConfig = {}): Engine {
  return new EngineImpl(config);
}

class EngineImpl implements Engine {
  private host = new AudioContextHost();
  private decoder = new Decoder(() => this.host.touch());
  private scheduler: Scheduler | null = null;
  private master: Master | null = null;
  private buses = new Map<string, Bus>();
  private busOrder: string[] = [];
  private sounds = new Map<string, Sound>();
  private voices = new Map<string, Set<Voice>>();
  private parameters = new Map<string, Parameter>();
  private config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
    const declared = Object.keys(config.buses ?? {});
    this.busOrder = declared.length > 0 ? declared : ['default'];
    for (const name of this.busOrder) this.voices.set(name, new Set());
  }

  get state(): EngineState {
    return this.host.state;
  }

  get now(): number {
    return this.host.now;
  }

  get context(): AudioContext {
    return this.host.touch();
  }

  async unlock(): Promise<void> {
    await this.host.unlock();
    this.ensureGraph();
  }

  async close(): Promise<void> {
    if (this.host.state === 'closed') return;
    for (const set of this.voices.values()) {
      for (const v of set) v.stop();
      set.clear();
    }
    this.scheduler?.dispose();
    this.scheduler = null;
    for (const bus of this.buses.values()) {
      for (const fx of bus.fx()) fx.dispose();
      bus.dispose();
    }
    this.buses.clear();
    this.master?.dispose();
    this.master = null;
    this.sounds.clear();
    this.parameters.clear();
    this.decoder.clear();
    await this.host.close();
  }

  async loadSound(
    name: string,
    url: string | readonly string[],
    options: LoadSoundOptions = {},
  ): Promise<Sound> {
    if (this.host.state === 'closed') throw new EngineClosedError();
    this.host.touch();
    this.ensureGraph();

    const resolvedUrl = typeof url === 'string' ? url : pickSource(url);
    const decodeOpts: DecodeOptions = { signal: options.signal };
    const buffer = await this.decoder.load(resolvedUrl, decodeOpts);

    return this.createSound(name, buffer, { bus: options.bus });
  }

  createSound(name: string, buffer: AudioBuffer, options: { bus?: string } = {}): Sound {
    if (this.host.state === 'closed') throw new EngineClosedError();
    this.host.touch();
    this.ensureGraph();

    const defaultBus = options.bus ?? this.busOrder[0]!;
    if (!this.buses.has(defaultBus)) throw new BusNotFoundError(defaultBus);

    const sound = new Sound(name, {
      ctx: this.host.touch(),
      buffer,
      defaultBus,
      resolveBusInput: (busName) => {
        const bus = this.buses.get(busName);
        if (!bus) throw new BusNotFoundError(busName);
        return bus.input;
      },
      resolveSpatializer: (_busName, opts) => {
        if (!opts) return undefined;
        return new Spatializer(this.host.touch(), opts as SpatialOptions);
      },
      trackVoice: (v, busName) => {
        this.voices.get(busName)?.add(v);
        this.buses.get(busName)?.trackVoice(v);
      },
      releaseVoice: (v, busName) => {
        this.voices.get(busName)?.delete(v);
        this.buses.get(busName)?.releaseVoice(v);
      },
      applyConcurrency: (v, busName) => {
        const bus = this.buses.get(busName);
        if (!bus) return true;
        let rejected = false;
        const stolen = bus.applyConcurrencyOnSpawn(v, () => {
          rejected = true;
        });
        if (stolen) {
          // Synchronously deregister the victim — its onended fires in a microtask
          // and concurrency assertions need to be true the instant play() returns.
          this.voices.get(busName)?.delete(stolen);
          bus.releaseVoice(stolen);
        }
        if (rejected) {
          this.voices.get(busName)?.delete(v);
          bus.releaseVoice(v);
        }
        return !rejected;
      },
    });

    this.sounds.set(name, sound);
    return sound;
  }

  removeSound(name: string): void {
    this.sounds.delete(name);
  }

  hasSound(name: string): boolean {
    return this.sounds.has(name);
  }

  sound(name: string): Sound {
    const s = this.sounds.get(name);
    if (!s) throw new SoundNotFoundError(name);
    return s;
  }

  bus(name: string): Bus {
    this.ensureGraph();
    const b = this.buses.get(name);
    if (!b) throw new BusNotFoundError(name);
    return b;
  }

  scheduleAt(audioTime: number, fn: () => void): () => void {
    this.host.touch();
    this.ensureGraph();
    return this.scheduler!.scheduleAt(audioTime, fn);
  }

  activeVoices(): readonly Voice[] {
    const all: Voice[] = [];
    for (const set of this.voices.values()) for (const v of set) all.push(v);
    return all;
  }

  onStateChange(fn: (s: EngineState) => void): () => void {
    return this.host.onStateChange(fn);
  }

  parameter(name: string, initial = 0): Parameter {
    let p = this.parameters.get(name);
    if (!p) {
      p = new Parameter(name, initial);
      this.parameters.set(name, p);
    }
    return p;
  }

  captureSnapshot(name: string): Snapshot {
    const buses: Record<string, { level: number; muted: boolean }> = {};
    for (const [n, b] of this.buses) buses[n] = { level: b.level, muted: b.muted };
    const parameters: Record<string, number> = {};
    for (const [n, p] of this.parameters) parameters[n] = p.value;
    return this.snapshot(name, { buses, parameters });
  }

  snapshot(name: string, state: SnapshotState): Snapshot {
    return new Snapshot(
      name,
      state,
      (busName) => this.buses.get(busName),
      (paramName) => this.parameters.get(paramName),
    );
  }

  /**
   * Lazily instantiate the bus graph against the live AudioContext. Called
   * from any path that touches the context (unlock, loadSound, bus, ...).
   */
  private ensureGraph(): void {
    if (this.master) return;
    const ctx = this.host.touch();
    this.master = new Master(ctx, this.config.master);
    this.scheduler = new Scheduler(this.host);

    for (const name of this.busOrder) {
      const cfg = this.config.buses?.[name] ?? {};
      const bus = new Bus(ctx, name, cfg);
      bus.output.connect(this.master.input);
      this.buses.set(name, bus);
      if (!this.voices.has(name)) this.voices.set(name, new Set());
    }
  }
}
