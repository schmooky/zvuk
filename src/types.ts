export type FadeCurve = 'linear' | 'equal-power' | 'easeIn' | 'easeOut' | 'easeInOut';

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

export interface MasterLimiterConfig {
  /** Threshold in dB. Default -1 (just below 0 dBFS). */
  threshold?: number;
  /** Compression ratio. Default 20 (brick-wall). */
  ratio?: number;
  /** Attack in seconds. Default 0.001 (fast — catches the transient). */
  attack?: number;
  /** Release in seconds. Default 0.05. */
  release?: number;
}

export interface MasterConfig {
  /** Headroom in dB applied to the master gain (negative). Default: 0. */
  headroom?: number;
  /** Optional brick-wall limiter on the master output. */
  limiter?: MasterLimiterConfig;
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

export interface EngineConfig {
  buses?: Record<string, BusConfig>;
  master?: MasterConfig;
  voice?: VoiceDefaults;
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
  jitter?: number;
}

export interface SpatialOptions {
  /** [-1, 1] stereo pan (2D). Mutually exclusive with `position`. */
  pan?: number;
  /** [x, y, z] world-space position (3D). Mutually exclusive with `pan`. */
  position?: [number, number, number];
}

export interface PlayOptions {
  /** Initial volume (0..1). Default 1. */
  volume?: number | VoiceJitter;
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
   * the same perceived loudness as other normalized sounds. Pass `true` for
   * defaults or an options object to tune the target.
   */
  normalize?: boolean | LoudnessOptions;
}
