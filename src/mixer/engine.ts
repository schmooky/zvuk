import {
  BusNotFoundError,
  EngineClosedError,
  PreloadError,
  type PreloadFailure,
  SoundNotFoundError,
} from '../errors';
import { Parameter } from '../params/parameter';
import { pickSource, pickSourceOrder } from '../runtime/codecs';
import { AudioContextHost, type EngineState } from '../runtime/context';
import { type DecodeOptions, Decoder } from '../runtime/decode';
import { applyLoudnessNormalization } from '../runtime/loudness';
import { Scheduler } from '../runtime/scheduler';
import { Music } from '../sources/music';
import { Sound } from '../sources/sound';
import { Sprite, type SpriteMap } from '../sources/sprite';
import { StreamSound } from '../sources/stream';
import type { Voice } from '../sources/voice';
import { Spatializer } from '../spatial/spatializer';
import type {
  AudioLevel,
  EngineConfig,
  LoadSoundOptions,
  MusicLoadOptions,
  MusicParts,
  PreloadItem,
  PreloadOptions,
  SpatialOptions,
} from '../types';
import { Bus } from './bus';
import { BusGroup } from './bus-group';
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
   *
   * If `createEngine({ resolveAsset })` is configured, the resolver is
   * consulted first — it can return an `AudioBuffer`, `ArrayBuffer`, or
   * `string` URL, or `undefined`/`null` to fall through to the URL list.
   */
  loadSound(name: string, url: string | readonly string[], options?: LoadSoundOptions): Promise<Sound>;
  /**
   * Bulk-load a batch of sounds with a shared progress reporter. Use this
   * to drive a loading screen — the `onProgress` callback fires once per
   * item as it settles, and the returned promise resolves when every item
   * has either succeeded or failed.
   *
   * If any items fail, the promise rejects with `PreloadError` after every
   * item has settled (a single broken asset doesn't short-circuit the rest
   * of the screen). On success the items are registered as if you'd called
   * `engine.loadSound(...)` for each.
   *
   * Concurrency is capped (default 4) so the rest of the page's fetches
   * aren't starved by a 100-asset preload competing for the browser's
   * per-host connection budget.
   */
  preload(items: readonly PreloadItem[], options?: PreloadOptions): Promise<void>;
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
   * Load a three-part music asset — optional intro, mandatory loop, optional
   * outro — and register it as a `Music` source. Use this for combat/win/menu
   * music where you need a stinger that plays once, a body that loops cleanly,
   * and (optionally) an outro that fires at the next loop boundary so the
   * music ends musically instead of cutting off mid-bar.
   *
   * Each part accepts the same shape as `loadSound`'s second argument —
   * a single URL or a codec ladder — and is loaded through the same
   * decoder cache, so codec fallback and `resolveAsset` apply per part.
   */
  loadMusic(name: string, parts: MusicParts, options?: MusicLoadOptions): Promise<Music>;
  /** Look up a previously loaded music asset. Throws SoundNotFoundError on miss. */
  music(name: string): Music;
  /** True if `name` was loaded as a music asset. */
  hasMusic(name: string): boolean;

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
   * Define (with `members`) or look up (without) a `BusGroup` — a logical
   * handle that addresses several buses at once. Setting `group.level` or
   * `group.muted`, calling `group.fadeTo`, or `group.solo()` applies to
   * every member in parallel. Doesn't change the audio graph; pure
   * convenience for sub-mixes that always move together.
   */
  busGroup(name: string, members?: readonly Bus[]): BusGroup;

  /**
   * Live amplitude readout on the master input. Same `{ rms, peak }`
   * shape as `bus.meter()` and `voice.level()`, just at the top of the
   * chain. First call lazily attaches a passive AnalyserNode tap.
   */
  masterMeter(): AudioLevel;

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
  private host: AudioContextHost;
  private decoder: Decoder;
  private scheduler: Scheduler | null = null;
  private master: Master | null = null;
  private buses = new Map<string, Bus>();
  private busOrder: string[] = [];
  private sounds = new Map<string, Sound>();
  private sprites = new Map<string, Sprite>();
  private streams = new Map<string, StreamSound>();
  private musics = new Map<string, Music>();
  private busGroups = new Map<string, BusGroup>();
  private soloedBuses = new Set<Bus>();
  private voices = new Map<string, Set<Voice>>();
  private parameters = new Map<string, Parameter>();
  private config: EngineConfig;

  constructor(config: EngineConfig) {
    this.config = config;
    this.host = new AudioContextHost({ autoPauseOnHidden: config.autoPauseOnHidden });
    this.decoder = new Decoder(() => this.host.touch());
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
    this.musics.clear();
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

    const decodeOpts: DecodeOptions = { signal: options.signal };
    let buffer = await this.resolveBuffer(name, url, decodeOpts);

    if (options.normalize) {
      buffer = applyLoudnessNormalization(buffer, options.normalize);
    }

    return this.createSound(name, buffer, { bus: options.bus });
  }

  private async resolveBuffer(
    name: string,
    url: string | readonly string[],
    decodeOpts: DecodeOptions,
  ): Promise<AudioBuffer> {
    const resolver = this.config.resolveAsset;
    if (resolver) {
      const resolved = await resolver({ name, url, signal: decodeOpts.signal });
      if (resolved != null) {
        if (resolved instanceof AudioBuffer) return resolved;
        if (resolved instanceof ArrayBuffer) {
          // ArrayBuffer carries no MIME hint — decodeAudioData sniffs it.
          return await this.host.touch().decodeAudioData(resolved);
        }
        if (typeof resolved === 'string') {
          return await this.decoder.load(resolved, decodeOpts);
        }
      }
      // null/undefined: explicit miss → fall through to the URL list.
    }
    const urls = typeof url === 'string' ? [url] : pickSourceOrder(url);
    return await this.decoder.loadFirst(urls, decodeOpts);
  }

  async preload(items: readonly PreloadItem[], options: PreloadOptions = {}): Promise<void> {
    if (this.host.state === 'closed') throw new EngineClosedError();
    if (items.length === 0) return;
    const concurrency = Math.max(1, options.concurrency ?? 4);
    const onProgress = options.onProgress;
    const batchSignal = options.signal;
    const total = items.length;
    let completed = 0;
    const failures: PreloadFailure[] = [];

    let nextIdx = 0;
    const workerCount = Math.min(concurrency, total);
    const workers: Promise<void>[] = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(
        (async () => {
          while (true) {
            const idx = nextIdx++;
            if (idx >= total) return;
            if (batchSignal?.aborted) {
              throw batchSignal.reason ?? new DOMException('preload aborted', 'AbortError');
            }
            const item = items[idx]!;
            const itemSignal = combineSignals(batchSignal, item.options?.signal);
            const opts: LoadSoundOptions = { ...(item.options ?? {}), signal: itemSignal };
            try {
              await this.loadSound(item.name, item.url, opts);
              completed++;
              onProgress?.({ name: item.name, status: 'loaded', completed, total });
            } catch (e) {
              if ((e as Error).name === 'AbortError') throw e;
              completed++;
              failures.push({ name: item.name, cause: e });
              onProgress?.({ name: item.name, status: 'failed', error: e, completed, total });
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
    if (failures.length > 0) throw new PreloadError(failures);
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

  async loadMusic(name: string, parts: MusicParts, options: MusicLoadOptions = {}): Promise<Music> {
    if (this.host.state === 'closed') throw new EngineClosedError();
    this.host.touch();
    this.ensureGraph();

    const decodeOpts: DecodeOptions = { signal: options.signal };
    const loopBuf = await this.resolveBuffer(`__music:${name}:loop`, parts.loop, decodeOpts);
    const introBuf = parts.intro
      ? await this.resolveBuffer(`__music:${name}:intro`, parts.intro, decodeOpts)
      : undefined;
    const outroBuf = parts.outro
      ? await this.resolveBuffer(`__music:${name}:outro`, parts.outro, decodeOpts)
      : undefined;

    const buffers = {
      intro: introBuf
        ? options.normalize
          ? applyLoudnessNormalization(introBuf, options.normalize)
          : introBuf
        : undefined,
      loop: options.normalize ? applyLoudnessNormalization(loopBuf, options.normalize) : loopBuf,
      outro: outroBuf
        ? options.normalize
          ? applyLoudnessNormalization(outroBuf, options.normalize)
          : outroBuf
        : undefined,
    };

    const busName = options.bus ?? this.busOrder[0]!;
    const bus = this.buses.get(busName);
    if (!bus) throw new BusNotFoundError(suggest(busName, [...this.buses.keys()]));

    const music = new Music(name, {
      ctx: this.host.touch(),
      buffers,
      destination: bus.input,
      loopCrossfade: options.loopCrossfade ?? 0,
      defaultStopFade: this.config.voice?.stopFade,
    });
    this.musics.set(name, music);
    return music;
  }

  music(name: string): Music {
    const m = this.musics.get(name);
    if (!m) throw new SoundNotFoundError(suggest(name, [...this.musics.keys()]));
    return m;
  }

  hasMusic(name: string): boolean {
    return this.musics.has(name);
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
      defaultStopFade: this.config.voice?.stopFade,
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

  busGroup(name: string, members?: readonly Bus[]): BusGroup {
    if (members != null) {
      // Define (or redefine) the group.
      const group = new BusGroup(name, members);
      this.busGroups.set(name, group);
      return group;
    }
    const existing = this.busGroups.get(name);
    if (!existing) {
      throw new BusNotFoundError(suggest(name, [...this.busGroups.keys()]));
    }
    return existing;
  }

  masterMeter(): AudioLevel {
    this.ensureGraph();
    return this.master!.meter();
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
    this.scheduler = new Scheduler(this.host, this.config.tickSource);

    for (const name of this.busOrder) {
      const cfg = this.config.buses?.[name] ?? {};
      const bus = new Bus(ctx, name, cfg);
      bus.output.connect(this.master.input);
      bus.notifySoloChange = (b, soloed) => this.handleSoloChange(b, soloed);
      this.buses.set(name, bus);
      if (!this.voices.has(name)) this.voices.set(name, new Set());
    }
  }

  /**
   * Coordinate the global solo rule. When any bus is in the solo set,
   * every non-soloed bus is muted via `applySoloVeil(true)`. When the
   * solo set drains, every bus is restored via `applySoloVeil(false)` —
   * which honours the bus's own `muted` setting independently.
   */
  private handleSoloChange(bus: Bus, soloed: boolean): void {
    if (soloed) this.soloedBuses.add(bus);
    else this.soloedBuses.delete(bus);

    const anySoloed = this.soloedBuses.size > 0;
    for (const b of this.buses.values()) {
      if (!anySoloed) {
        b.applySoloVeil(false);
      } else {
        b.applySoloVeil(!this.soloedBuses.has(b));
      }
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

/**
 * Compose two AbortSignals: the result aborts when either source aborts.
 * Returns the lone signal if only one is given (no allocation), or undefined
 * if neither is given.
 */
function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ac = new AbortController();
  const onAbortA = (): void => ac.abort(a.reason);
  const onAbortB = (): void => ac.abort(b.reason);
  a.addEventListener('abort', onAbortA, { once: true });
  b.addEventListener('abort', onAbortB, { once: true });
  return ac.signal;
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
