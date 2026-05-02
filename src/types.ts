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
  /** Attack ms. */
  attack?: number;
  /** Release ms. */
  release?: number;
}

export interface BusConfig {
  level?: number;
  mute?: boolean;
  concurrency?: ConcurrencyConfig;
  sidechain?: SidechainConfig;
}

export interface MasterConfig {
  /** Headroom in dB applied to the master gain (negative). Default: 0. */
  headroom?: number;
}

export interface EngineConfig {
  buses?: Record<string, BusConfig>;
  master?: MasterConfig;
}

export interface FadeOptions {
  to: number;
  ms: number;
  curve?: FadeCurve;
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
}

export interface LoadSoundOptions {
  /** Default bus for voices spawned by this sound. Default: first declared bus. */
  bus?: string;
  /** AbortSignal for the fetch. */
  signal?: AbortSignal;
}
