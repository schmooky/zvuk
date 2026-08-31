export type FadeCurve = 'linear' | 'equal-power' | 'easeIn' | 'easeOut' | 'easeInOut';

/**
 * Live amplitude readout, returned by `voice.level()` and `bus.meter()`.
 * Values are linear (0..1). Convert to dB with `20 * log10(value)`.
 *
 * - `rms` — root-mean-square over the most recent ~10 ms window. Smooth,
 *   matches what a VU meter shows.
 * - `peak` — maximum absolute sample in the same window. Fast-moving,
 *   matches what a peak meter / clip indicator shows.
 *
 * Both numbers come from a single AnalyserNode read; calling `level()` more
 * than ~60 Hz is wasted work because the underlying time-domain buffer
 * doesn't refresh faster than the audio thread fills it.
 */
export interface AudioLevel {
  rms: number;
  peak: number;
}

export interface ConcurrencyConfig {
  /** Max simultaneous voices on this bus. */
  max: number;
  /** Voice-stealing strategy when max is reached. Default: 'oldest'. */
  steal?: 'oldest' | 'lowest-priority' | 'quietest' | 'none';
}

export interface SidechainConfig {
  /** Bus name to listen to. When that bus is loud, this bus is ducked. */
  from: string;
  /** Amount of duck (0..1, where 1 = fully muted at peak source). */
  amount: number;
  /** Attack in seconds. */
  attack?: number;
  /** Release in seconds. */
  release?: number;
}

export interface BusConfig {
  level?: number;
  mute?: boolean;
  concurrency?: ConcurrencyConfig;
  sidechain?: SidechainConfig;
}

export interface SendOptions {
  /** Send level (0..1). Default 1. */
  amount?: number;
  /**
   * Tap the source bus's output (post-fader, post-FX) when `true`,
   * or input (pre-fader, pre-FX) when `false`. Default `true` — almost
   * always what you want. Pre-fader sends are mainly useful for
   * monitoring buses that should hear the dry signal regardless of how
   * the user has faded the source bus down.
   */
  post?: boolean;
}

export interface MasterLimiterConfig {
  /** Threshold in dB. Default -1 (just below 0 dBFS). */
  threshold?: number;
  /** Compression ratio. Default 20 (high — limiter-like, but not a true brick wall). */
  ratio?: number;
  /** Attack in seconds. Default 0.001 (fast — catches the transient). */
  attack?: number;
  /** Release in seconds. Default 0.05. */
  release?: number;
}

export interface MasterConfig {
  /** Headroom in dB applied to the master gain (negative). Default: 0. */
  headroom?: number;
  /** Optional fast-attack soft limiter on the master output (best-effort peak control). */
  limiter?: MasterLimiterConfig;
}

/**
 * Anything an `AssetResolver` is allowed to return:
 * - `AudioBuffer` — already decoded, used as-is.
 * - `ArrayBuffer` — encoded bytes; zvuk decodes via the engine's AudioContext.
 * - `string` — a URL; zvuk fetches and decodes via its normal loader (and
 *    the cache).
 * - `undefined` / `null` — explicit "I don't have this" — falls through to
 *    the URL list passed to `loadSound` (or throws if none was given).
 */
export type ResolvedAsset = AudioBuffer | ArrayBuffer | string;

export interface ResolveAssetContext {
  /** The name passed to `engine.loadSound(name, ...)`. */
  readonly name: string;
  /** The URL or URL list passed to `engine.loadSound(name, urls)`. */
  readonly url: string | readonly string[];
  /** Forwarded from `LoadSoundOptions.signal`. */
  readonly signal?: AbortSignal;
}

/**
 * Hook for adopting buffers from an external asset system (Pixi assetpack,
 * IndexedDB cache, custom manifest) instead of (or in addition to) zvuk's
 * URL fetcher. Returning `undefined`/`null` falls through to the URL fetch,
 * so resolvers can mix cached and uncached sounds without branching at the
 * call site.
 *
 * The resolver runs before any fetch — if it returns a buffer or URL, the
 * URL list passed to `loadSound` is only used as the resolution key.
 */
export type AssetResolver = (
  ctx: ResolveAssetContext,
) => ResolvedAsset | undefined | null | Promise<ResolvedAsset | undefined | null>;

/**
 * External ticker for driving the scheduler's task dispatch — typically
 * a host's existing render loop (Pixi `app.ticker`, GSAP `gsap.ticker`).
 *
 * The scheduler subscribes lazily: only while there are pending tasks. When
 * the queue drains, it unsubscribes so a 60 Hz host loop isn't waking the
 * scheduler 60 times per second to do nothing.
 *
 * Without a `TickSource`, the scheduler dispatches via `setTimeout` — see
 * the "Runtime timing" guide for trade-offs around browser timer
 * throttling and tab visibility.
 *
 * @example Pixi v8
 * ```ts
 * const tickSource: TickSource = {
 *   subscribe(handler) {
 *     app.ticker.add(handler);
 *     return () => app.ticker.remove(handler);
 *   },
 * };
 * createEngine({ tickSource });
 * ```
 *
 * @example GSAP
 * ```ts
 * const tickSource: TickSource = {
 *   subscribe(handler) {
 *     gsap.ticker.add(handler);
 *     return () => gsap.ticker.remove(handler);
 *   },
 * };
 * ```
 */
export interface TickSource {
  /** Register a tick handler. Returns an unsubscribe function. */
  subscribe(handler: () => void): () => void;
}

export interface VoiceDefaults {
  /**
   * Default click-free fade-out duration applied by `voice.stop()`, in
   * seconds. Web Audio cuts source nodes mid-waveform, which produces a
   * digital click on non-zero crossings — a tiny linear ramp on the gain
   * stage before the source actually stops eliminates that. Default 0.008
   * (8 ms): inaudible as fade, sufficient as click suppressor.
   *
   * Override per-call with `voice.stop({ fade: 0 })` for hard cuts (sample-
   * accurate timing, intentional staccato), or `{ fade: 0.05 }` for longer
   * tails. Set 0 here to opt the whole engine out of click-free behaviour.
   */
  stopFade?: number;
}

export interface EngineConfig<TBusName extends string = string> {
  buses?: Record<TBusName, BusConfig>;
  master?: MasterConfig;
  voice?: VoiceDefaults;
  /**
   * Hint to the underlying `AudioContext` about the desired latency /
   * battery trade-off. Maps to `AudioContextOptions.latencyHint`:
   *
   * - `'interactive'` — the default Web Audio behaviour. Right call for
   *   game audio, slot machines, anything where 60 fps reactive sound
   *   matters more than power consumption.
   * - `'playback'` — longer buffers, lower CPU, higher latency. Right
   *   call for music players, podcasting tools, anything where the user
   *   isn't expecting input-to-sound to feel "instant."
   * - `'balanced'` — the browser picks.
   * - A number — explicit latency in seconds. Browsers honour it on a
   *   best-effort basis.
   *
   * Default: undefined (the browser picks; usually `'interactive'`).
   */
  latencyHint?: AudioContextLatencyCategory | number;
  /**
   * External ticker (e.g. Pixi `app.ticker`, GSAP `gsap.ticker`) that drives
   * scheduler dispatch. Without one, the scheduler uses `setTimeout` —
   * which browsers throttle to ~1 Hz on hidden tabs. Inject a host ticker
   * to align dispatch to your render loop and avoid spawning a parallel rAF
   * loop. See the "Runtime timing" guide for the full trade-off.
   */
  tickSource?: TickSource;
  /**
   * Adopt buffers from an external asset system instead of (or in addition
   * to) zvuk's URL fetcher. Called once per `loadSound` / `loadSprite` call
   * before any fetch. Return:
   *
   * - `AudioBuffer` — used as-is.
   * - `ArrayBuffer` — decoded via the engine's AudioContext.
   * - `string` — treated as a URL; fetched and decoded normally.
   * - `undefined` / `null` — miss; falls through to the URL list passed to
   *   `loadSound`. Resolvers can mix cached and uncached sounds without
   *   branching at the call site.
   *
   * Useful for: Pixi `Assets.cache`, IndexedDB persistence, manifest-driven
   * loading, custom CDN proxies. See the "Asset resolution" guide for
   * complete recipes.
   */
  resolveAsset?: AssetResolver;
  /**
   * When `true` (default), the engine listens for `visibilitychange` and
   * suspends the AudioContext while the tab/window is hidden, then resumes
   * automatically on return. This is also the iOS Safari workaround for
   * suspension-on-blur.
   *
   * Set to `false` if you want music to keep playing across tab switches —
   * e.g. background music players where a brief navigation away from the
   * page shouldn't pause playback. Audio continues running on the Web Audio
   * thread regardless of tab visibility.
   */
  autoPauseOnHidden?: boolean;
  /**
   * Decoded-buffer cache limits. Decoded audio costs 4 bytes per sample per
   * channel, so a few minutes of stereo 48 kHz is tens of megabytes and an
   * entry count says nothing useful about memory.
   *
   * Defaults: 64 MiB, 128 entries. The cache is LRU on both.
   */
  cache?: CacheConfig;
}

export interface CacheConfig {
  /** Ceiling on decoded bytes held in the cache. Default 64 MiB. */
  maxBytes?: number;
  /** Ceiling on cached entries, applied alongside `maxBytes`. Default 128. */
  maxEntries?: number;
}

export interface FadeOptions {
  to: number;
  /** Fade duration in seconds. */
  duration: number;
  curve?: FadeCurve;
}

export interface StopOptions {
  /**
   * Click-free fade-out duration (seconds) to apply before the source node
   * actually stops. Default: the engine's `voice.stopFade` (0.008 if not
   * configured). Pass `0` for an immediate hard cut.
   */
  fade?: number;
}

export interface VoiceJitter {
  /**
   * Center value the jitter varies around. Defaults to 1 (the neutral
   * volume / playback rate). Set it to combine a base with jitter, e.g.
   * `{ base: 1.5, jitter: 0.1 }` plays at 1.5 ± 0.1 per voice.
   */
  base?: number;
  /** Maximum ± random deviation from `base`, drawn once per voice. */
  jitter?: number;
}

/**
 * Distance-attenuation curve. Mirrors `PannerNode.distanceModel`:
 * - `'inverse'` (default) — natural-sounding rolloff, matches outdoor sound.
 * - `'linear'` — straight-line attenuation between `refDistance` and `maxDistance`.
 * - `'exponential'` — steeper than inverse; useful for tight environments.
 */
export type DistanceModel = 'linear' | 'inverse' | 'exponential';

export interface SpatialOptions {
  /** [-1, 1] stereo pan (2D). Mutually exclusive with `position`. */
  pan?: number;
  /** [x, y, z] world-space position (3D). Mutually exclusive with `pan`. */
  position?: [number, number, number];
  /**
   * Distance below which the source is at full volume. Default 1.
   * 3D only; ignored when `pan` is used.
   */
  refDistance?: number;
  /**
   * Distance beyond which `'linear'` attenuation reaches zero. The
   * `'inverse'` and `'exponential'` models keep falling off but use this
   * as the curve's anchor. Default 10000.
   * 3D only; ignored when `pan` is used.
   */
  maxDistance?: number;
  /**
   * How aggressively distance attenuates the sound. 1 is the natural
   * rolloff for the chosen `distanceModel`; higher values produce a
   * more dramatic falloff. Default 1.
   * 3D only; ignored when `pan` is used.
   */
  rolloffFactor?: number;
  /** Distance-attenuation curve. Default `'inverse'`. 3D only. */
  distanceModel?: DistanceModel;
  /**
   * Occlusion amount (0..1). Drives an internal low-pass filter that
   * sweeps cutoff from 22050 Hz (transparent) down to ~500 Hz (heavily
   * muffled), plus a small gain dip — the standard "behind a wall"
   * effect. Independent of distance attenuation; combine via a
   * `Parameter` if you want one knob to drive both.
   * 3D only; ignored when `pan` is used.
   */
  occlusion?: number;
}

export interface PlayOptions {
  /** Initial volume (0..1). Default 1. */
  volume?: number | VoiceJitter;
  /**
   * Fade-in duration (seconds) applied to the voice's gain at start.
   * Default 0 (instant). Convenience for "drop in smoothly" — the dual
   * of the click-free stop fade. Equivalent to playing at `volume: 0`
   * and immediately calling `voice.fade({ to: volume, duration: fadeIn })`.
   */
  fadeIn?: number;
  /** Playback rate. 1 = source speed. Random jitter optional. */
  pitch?: number | VoiceJitter;
  /** Loop the voice. Default false. */
  loop?: boolean;
  /** Override the default bus for this voice. */
  bus?: string;
  /** Voice priority — higher = more likely to survive stealing. Default 0. */
  priority?: number;
  /** AbortSignal — voice stops when aborted. */
  signal?: AbortSignal;
  /** 2D pan or 3D position. Inserts a Spatializer between the voice and its bus. */
  spatializer?: SpatialOptions;
  /** Offset into the buffer (seconds) to start at. Default 0. Used by Sprite. */
  offset?: number;
  /** If set, voice auto-stops after this many seconds. Used by Sprite. */
  duration?: number;
  /** When loop=true, start of the loop region (seconds). */
  loopStart?: number;
  /** When loop=true, end of the loop region (seconds). */
  loopEnd?: number;
  /**
   * Equal-power crossfade duration (seconds) at the loop boundary. When
   * `loop` is true and this is non-zero, zvuk spawns a parallel buffer
   * source at every loop point and ramps between them — masking the click
   * that AudioBufferSourceNode's native loop produces when the region
   * doesn't end on a zero crossing.
   *
   * Default `0` (off — native hard-cut loop). Cost is one extra
   * AudioBufferSourceNode + GainNode per loop iteration; with default
   * Web Audio dispatch this is well under 1% CPU per voice.
   *
   * Ignored if `loop` is false, or if the loop region is shorter than
   * twice the crossfade window (silent fallback to native loop).
   */
  loopCrossfade?: number;
}

export interface LoudnessOptions {
  /** Target RMS (linear, 0..1). Default 0.1 (~ -20 dBFS). */
  targetRms?: number;
  /** Hard ceiling for the resulting peak; gain is reduced to stay below it. Default 0.99. */
  peakCeiling?: number;
}

export interface LoadSoundOptions {
  /** Default bus for voices spawned by this sound. Default: first declared bus. */
  bus?: string;
  /** AbortSignal for the fetch. */
  signal?: AbortSignal;
  /**
   * Run RMS-based loudness normalization on the decoded buffer so it sits at
   * the same RMS level as other normalized sounds. (Full-band RMS, not
   * perceptual/LUFS.) Pass `true` for defaults or an options object to tune
   * the target.
   */
  normalize?: boolean | LoudnessOptions;
}

/**
 * A three-part music asset: optional intro stinger, mandatory loop body,
 * optional outro tail. Modelled on the Wwise / FMOD pattern every casino
 * slot, action game, and rhythm game uses for combat/win/menu music.
 *
 * Each part accepts a single URL or a codec ladder — the same shape as
 * `engine.loadSound`'s second argument.
 */
export interface MusicParts {
  intro?: string | readonly string[];
  loop: string | readonly string[];
  outro?: string | readonly string[];
}

export interface MusicLoadOptions extends LoadSoundOptions {
  /**
   * Equal-power crossfade (seconds) at the loop boundary. Mirrors
   * `PlayOptions.loopCrossfade` — masks the click that would otherwise
   * fire if the loop region doesn't end on a zero crossing. Default `0`.
   */
  loopCrossfade?: number;
}

export interface MusicPlayOptions {
  /** Initial volume (0..1). Default 1. */
  volume?: number;
  /**
   * Fade-in duration (seconds) applied to the music's gain stage at start.
   * Default 0 (instant). Convenience for "drop into the menu" style intros.
   */
  fadeIn?: number;
}

export interface SkipToOutroOptions {
  /**
   * - `'loop-end'` (default) — finish the current loop iteration, then play
   *   the outro at the natural loop boundary. Musical, no click.
   * - `'now'` — fade out whatever's playing right now (~50 ms equal-power)
   *   and start the outro immediately. Right call for "user pressed Stop"
   *   where waiting feels unresponsive.
   */
  at?: 'loop-end' | 'now';
}

export type MusicState = 'intro' | 'loop' | 'outro' | 'ended';

/**
 * One entry in a `engine.preload(...)` batch. Mirrors `engine.loadSound`'s
 * signature so callers can hand the same data to either path.
 */
export interface PreloadItem {
  /** Sound name, registered on `engine.sound(name)` after preload completes. */
  name: string;
  /** URL or codec ladder — same shape as `engine.loadSound`. */
  url: string | readonly string[];
  /** Per-item options (bus, normalize, etc.). Forwarded to `loadSound`. */
  options?: LoadSoundOptions;
}

export interface PreloadProgressEvent {
  /** Name of the item that just completed (success or failure). */
  readonly name: string;
  /** Outcome — `'loaded'` on decode success, `'failed'` otherwise. */
  readonly status: 'loaded' | 'failed';
  /** Error attached when `status === 'failed'`. */
  readonly error?: unknown;
  /** Items settled so far (loaded + failed). */
  readonly completed: number;
  /** Total items in the batch. */
  readonly total: number;
}

export interface PreloadOptions {
  /**
   * Cancels the whole preload. In-flight fetches receive the abort; pending
   * items aren't started. The promise rejects with the signal's abort reason.
   */
  signal?: AbortSignal;
  /**
   * Maximum concurrent loads. Default 4 — chosen for balance with browser
   * connection limits (typically 6 per host) so the rest of the page's
   * fetches don't starve. Lower for cheap mobile data plans, higher when
   * you control the host and want to saturate.
   */
  concurrency?: number;
  /**
   * Fires once per item as it settles. Use this to drive a loading-screen
   * progress bar. The event is cumulative — `event.completed / event.total`
   * is a fraction in [0..1].
   */
  onProgress?: (event: PreloadProgressEvent) => void;
}
