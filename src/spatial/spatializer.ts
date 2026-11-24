import { glideTo } from '../mixer/curve';
import type { DistanceModel, SpatialOptions } from '../types';

const DEFAULT_REF_DISTANCE = 1;
const DEFAULT_MAX_DISTANCE = 10000;
const DEFAULT_ROLLOFF = 1;
const DEFAULT_DISTANCE_MODEL: DistanceModel = 'inverse';

// Occlusion tuning. The low-pass cutoff sweeps log-style from open to
// muffled because human hearing is logarithmic — a linear sweep on Hz
// would feel front-loaded.
const OCCLUSION_OPEN_HZ = 22050;
const OCCLUSION_MUFFLED_HZ = 500;
// At full occlusion we also drop the spatializer's own gain a bit. Real
// "behind a wall" attenuation is more than just frequency loss.
const OCCLUSION_MAX_GAIN_DROP_DB = 6;
const DEFAULT_GLIDE = 0.02;

/**
 * PannerNode + occlusion biquad wrapper. Inserted between a Voice and
 * its Bus when a play call passes a `spatializer` option.
 *
 * - 2D pan uses `StereoPannerNode` (cheap, just left/right shift).
 * - 3D uses `PannerNode` in HRTF mode (one node per voice — fine for
 *   the dozens of simultaneous voices a typical game holds, expensive
 *   past hundreds), followed by a biquad lowpass for occlusion plus a
 *   gain stage so occlusion can also drop level slightly.
 *
 * 3D config (`refDistance`, `maxDistance`, `rolloffFactor`,
 * `distanceModel`) is configurable per voice via `SpatialOptions` and
 * tunable live via the `set*` methods. Occlusion is a single 0..1 knob
 * that drives the lowpass cutoff plus a small gain dip.
 */
export class Spatializer {
  private ctx: AudioContext;
  private kind: '2d' | '3d';
  private glide: number;
  private input: AudioNode; // what the Voice connects into
  private output: AudioNode; // what we connect to the Bus

  // 2D-only.
  private stereoPan: StereoPannerNode | null = null;
  // 3D-only.
  private panner: PannerNode | null = null;
  private occlusionFilter: BiquadFilterNode | null = null;
  private occlusionGain: GainNode | null = null;

  constructor(ctx: AudioContext, opts: SpatialOptions) {
    this.ctx = ctx;
    this.glide = Math.max(0, opts.glide ?? DEFAULT_GLIDE);
    if (opts.position) {
      const panner = ctx.createPanner();
      panner.panningModel = opts.panningModel ?? 'HRTF';
      panner.distanceModel = opts.distanceModel ?? DEFAULT_DISTANCE_MODEL;
      panner.refDistance = opts.refDistance ?? DEFAULT_REF_DISTANCE;
      panner.maxDistance = opts.maxDistance ?? DEFAULT_MAX_DISTANCE;
      panner.rolloffFactor = opts.rolloffFactor ?? DEFAULT_ROLLOFF;
      const [x, y, z] = opts.position;
      this.setPanner3D(panner, x, y, z, 0);

      // Occlusion chain: panner → biquad → gain → out. The biquad and
      // gain are always on but transparent at occlusion = 0 (cutoff at
      // Nyquist, gain = 1).
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = OCCLUSION_OPEN_HZ;
      filter.Q.value = Math.SQRT1_2; // ~0.707, Butterworth (maximally flat) response
      const gain = ctx.createGain();
      gain.gain.value = 1;
      panner.connect(filter).connect(gain);

      this.panner = panner;
      this.occlusionFilter = filter;
      this.occlusionGain = gain;
      this.input = panner;
      this.output = gain;
      this.kind = '3d';

      if (opts.occlusion != null) this.applyOcclusion(opts.occlusion, 0);
    } else {
      const sp = ctx.createStereoPanner();
      sp.pan.value = clampPan(opts.pan ?? 0);
      this.stereoPan = sp;
      this.input = sp;
      this.output = sp;
      this.kind = '2d';
    }
  }

  /** 2D pan (-1..1). Glides over the `glide` time constant. */
  setPan(pan: number): void {
    if (this.kind !== '2d' || !this.stereoPan) return;
    glideTo(this.stereoPan.pan, clampPan(pan), this.ctx.currentTime, this.glide);
  }

  /** 3D position. Glides over the `glide` time constant. */
  setPosition(x: number, y: number, z: number): void {
    if (this.kind !== '3d' || !this.panner) return;
    this.setPanner3D(this.panner, x, y, z, this.glide);
  }

  /** Change the glide time constant for later moves. 0 jumps. */
  setGlide(seconds: number): void {
    this.glide = Math.max(0, seconds);
  }

  /** Switch the 3D panning algorithm live. No-op on 2D spatializers. */
  setPanningModel(model: PanningModelType): void {
    if (this.panner) this.panner.panningModel = model;
  }

  setRefDistance(d: number): void {
    if (!this.panner) return;
    this.panner.refDistance = Math.max(0, d);
  }

  setMaxDistance(d: number): void {
    if (!this.panner) return;
    this.panner.maxDistance = Math.max(0, d);
  }

  setRolloffFactor(f: number): void {
    if (!this.panner) return;
    this.panner.rolloffFactor = Math.max(0, f);
  }

  setDistanceModel(m: DistanceModel): void {
    if (!this.panner) return;
    this.panner.distanceModel = m;
  }

  /**
   * Set occlusion amount (0..1). Drives the internal lowpass cutoff
   * and a small gain dip — independent of distance attenuation.
   * No-op on 2D spatializers.
   */
  setOcclusion(amount: number): void {
    this.applyOcclusion(amount, this.glide);
  }

  private applyOcclusion(amount: number, glide: number): void {
    if (!this.occlusionFilter || !this.occlusionGain) return;
    const a = clamp01(amount);
    // Logarithmic interp on cutoff so the perceived sweep is even.
    const cutoff = OCCLUSION_OPEN_HZ * (OCCLUSION_MUFFLED_HZ / OCCLUSION_OPEN_HZ) ** a;
    const now = this.ctx.currentTime;
    glideTo(this.occlusionFilter.frequency, cutoff, now, glide);
    const gainLin = 10 ** ((-OCCLUSION_MAX_GAIN_DROP_DB * a) / 20);
    glideTo(this.occlusionGain.gain, gainLin, now, glide);
  }

  /** Connects the spatializer's output into `dest` and returns the input the Voice should use. */
  connectInto(dest: AudioNode): AudioNode {
    this.output.connect(dest);
    return this.input;
  }

  dispose(): void {
    try {
      this.input.disconnect();
      this.occlusionFilter?.disconnect();
      this.occlusionGain?.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private setPanner3D(p: PannerNode, x: number, y: number, z: number, glide: number): void {
    if (typeof p.positionX?.setValueAtTime === 'function') {
      const now = this.ctx.currentTime;
      glideTo(p.positionX, x, now, glide);
      glideTo(p.positionY, y, now, glide);
      glideTo(p.positionZ, z, now, glide);
    } else {
      // Older browsers (Safari < 14.5) — setPosition is deprecated but the only API.
      const legacy = p as unknown as { setPosition?: (x: number, y: number, z: number) => void };
      legacy.setPosition?.(x, y, z);
    }
  }
}

function clampPan(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
