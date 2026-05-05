import { BusNotFoundError, EngineClosedError, SoundNotFoundError } from '../errors';
import { Parameter } from '../params/parameter';
import { pickSource, pickSourceOrder } from '../runtime/codecs';
import { AudioContextHost, type EngineState } from '../runtime/context';
import { type DecodeOptions, Decoder } from '../runtime/decode';
import { applyLoudnessNormalization } from '../runtime/loudness';
import { Scheduler } from '../runtime/scheduler';
import { Sound } from '../sources/sound';
import { Sprite, type SpriteMap } from '../sources/sprite';
import { StreamSound } from '../sources/stream';
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
   * The list is walked in order (codecs the browser claims it can play
   * float to the front), and the first URL that successfully fetches AND
   * decodes wins. A 404, network error, or decode failure on one URL falls
   * through to the next — so a broken CDN entry or under-reported codec
   * doesn't bring the whole sound down.
   *
   * If every URL fails, throws AggregateDecodeError (a subclass of
   * DecodeError) with per-URL causes attached. If only one URL was given,
   * the underlying DecodeError is rethrown verbatim.
   */
  loadSound(name: string, url: string | readonly string[], options?: LoadSoundOptions): Promise<Sound>;
  /** Register a Sound from an AudioBuffer you constructed yourself (procedural, custom-decoded, time-stretched). */
  createSound(name: string, buffer: AudioBuffer, options?: { bus?: string }): Sound;
  /** Drop a sound from the registry. Active voices keep playing until they end naturally. */
  removeSound(name: string): void;
  hasSound(name: string): boolean;

  /**
   * Load a single buffer with a region map; spawn region-bound voices via
   * `engine.sprite('cascade').play('match-3', ...)`.
   */
  loadSprite(
    name: string,
    url: string | readonly string[],
    regions: SpriteMap,
    options?: LoadSoundOptions,
  ): Promise<Sprite>;
  /** Look up a previously loaded sprite. Throws SoundNotFoundError on miss. */
  sprite(name: string): Sprite;
  /** True if `name` was loaded as a sprite. */
  hasSprite(name: string): boolean;

  /**
   * Stream a long media file via HTMLAudioElement + MediaElementAudioSource.
   * Use for music tracks > 30s — avoids decoding the whole file into RAM,
   * and is the only safe path on iOS for multi-minute assets.
   */
  loadStream(name: string, url: string | readonly string[], options?: LoadSoundOptions): StreamSound;
  /** Look up a registered stream. */
  stream(name: string): StreamSound;
  hasStream(name: string): boolean;

  sound(name: string): Sound;
  bus(name: string): Bus;

  /**
   * Crossfade helper. Stops `from` over `duration` seconds while playing `to`
   * over the same window with `equal-power` curves so the perceived loudness
   * stays flat.
   *
   * Returns the new Voice. If `to` is already playing, its level is faded up
   * from 0 instead of starting fresh.
   */
  crossfade(from: string, to: string, options?: CrossfadeOptions): Voice;

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

export interface CrossfadeOptions {
  /** Crossfade duration in seconds. Default 1.5. */
  duration?: number;
  /** Bus to play `to` on (and to look up `from` on). Defaults to the sound's defaults. */
  bus?: string;
  /** Loop the new voice. Default true (music swap is the canonical use case). */
  loop?: boolean;
  /** Curve. Default 'equal-power' so the sum stays at constant power. */
  curve?: 'linear' | 'equal-power';
  /** Override target volume of the incoming voice (0..1). Default 1. */
  toVolume?: number;
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
  private sprites = new Map<string, Sprite>();
  private streams = new Map<string, StreamSound>();
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
    this.sprites.clear();
    for (const s of this.streams.values()) s.dispose();
    this.streams.clear();
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

    const urls = typeof url === 'string' ? [url] : pickSourceOrder(url);
    const decodeOpts: DecodeOptions = { signal: options.signal };
    let buffer = await this.decoder.loadFirst(urls, decodeOpts);

    if (options.normalize) {
      buffer = applyLoudnessNormalization(buffer, options.normalize);
    }

    return this.createSound(name, buffer, { bus: options.bus });
  }

  async loadSprite(
    name: string,
    url: string | readonly string[],
    regions: SpriteMap,
    options: LoadSoundOptions = {},
  ): Promise<Sprite> {
    const sound = await this.loadSound(`__sprite:${name}`, url, options);
    const sprite = new Sprite(name, sound, regions);
    this.sprites.set(name, sprite);
    return sprite;
  }

  sprite(name: string): Sprite {
    const s = this.sprites.get(name);
    if (!s) throw new SoundNotFoundError(suggest(name, [...this.sprites.keys()]));
    return s;
  }

  hasSprite(name: string): boolean {
    return this.sprites.has(name);
  }

  loadStream(name: string, url: string | readonly string[], options: LoadSoundOptions = {}): StreamSound {
    if (this.host.state === 'closed') throw new EngineClosedError();
    this.host.touch();
    this.ensureGraph();
    const resolvedUrl = typeof url === 'string' ? url : pickSource(url);
    const bus = options.bus ?? this.busOrder[0]!;
    const busObj = this.buses.get(bus);
    if (!busObj) throw new BusNotFoundError(suggest(bus, [...this.buses.keys()]));
    const stream = new StreamSound(name, this.host.touch(), resolvedUrl, busObj.input);
    this.streams.set(name, stream);
    return stream;
  }

  stream(name: string): StreamSound {
    const s = this.streams.get(name);
    if (!s) throw new SoundNotFoundError(suggest(name, [...this.streams.keys()]));
    return s;
  }

  hasStream(name: string): boolean {
    return this.streams.has(name);
  }

  crossfade(from: string, to: string, options: CrossfadeOptions = {}): Voice {
    const duration = options.duration ?? 1.5;
    const curve = options.curve ?? 'equal-power';
    const toVolume = options.toVolume ?? 1;
    const target = this.sound(to);
    const newVoice = target.play({
      bus: options.bus,
      loop: options.loop ?? true,
      volume: 0,
    });
    void newVoice.fade({ to: toVolume, duration, curve });
    const outgoing = this.activeVoices().filter((v) => v !== newVoice && v.sourceName === from);
    for (const v of outgoing) {
      void v.fade({ to: 0, duration, curve }).then(() => v.stop());
    }
    return newVoice;
  }

  createSound(name: string, buffer: AudioBuffer, options: { bus?: string } = {}): Sound {
    if (this.host.state === 'closed') throw new EngineClosedError();
    this.host.touch();
    this.ensureGraph();

    const defaultBus = options.bus ?? this.busOrder[0]!;
    if (!this.buses.has(defaultBus)) throw new BusNotFoundError(suggest(defaultBus, [...this.buses.keys()]));

    const sound = new Sound(name, {
      ctx: this.host.touch(),
      buffer,
      defaultBus,
      resolveBusInput: (busName) => {
        const bus = this.buses.get(busName);
        if (!bus) throw new BusNotFoundError(suggest(busName, [...this.buses.keys()]));
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
    if (!s) throw new SoundNotFoundError(suggest(name, [...this.sounds.keys()]));
    return s;
  }

  bus(name: string): Bus {
    this.ensureGraph();
    const b = this.buses.get(name);
    if (!b) throw new BusNotFoundError(suggest(name, [...this.buses.keys()]));
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

/**
 * Build a friendlier "did you mean?" message when a name lookup misses.
 * Uses Levenshtein distance on the candidate set; if a close match exists,
 * it's surfaced in the error so a typo doesn't waste anyone's afternoon.
 */
function suggest(missing: string, candidates: readonly string[]): string {
  if (candidates.length === 0) return missing;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(missing, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  // Allow up to ceil(longer / 2) edits — generous enough to catch transposes
  // ("sxf"/"sfx" = 2 edits, both length 3) but tight enough that "xyz" doesn't
  // suggest "music".
  const longest = Math.max(missing.length, best?.length ?? 0);
  const threshold = Math.max(1, Math.ceil(longest / 2));
  if (best && bestDist <= threshold) {
    return `${missing}"; did you mean "${best}`;
  }
  return missing;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
