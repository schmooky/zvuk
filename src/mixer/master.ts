import { waitAudio } from '../runtime/wait';
import type { AudioLevel, FadeCurve, MasterConfig, MasterLimiterConfig } from '../types';
import { applyRamp } from './curve';

/**
 * The Master stage: headroom gain, then the master fader (volume and mute),
 * then an optional soft limiter, then the destination. Buses connect their
 * output to master.input. Reach it with `engine.master`.
 *
 * Headroom is a static gain offset; the limiter is a fast-attack
 * DynamicsCompressorNode that catches most peaks the headroom can't tame when
 * heavy FX stack on top of busy mixes. Note it is best-effort, not a true
 * brick-wall limiter — with a finite attack and no lookahead, transient peaks
 * above the threshold can still pass, so it does not guarantee a hard ceiling.
 */
export class Master {
  readonly input: GainNode;
  /** Master fader: volume × mute. Sits after headroom, before the limiter. */
  private fader: GainNode;
  private _volume: number;
  private _muted: boolean;
  private headroomDb: number;
  private ctx: AudioContext;
  private limiterNode: DynamicsCompressorNode | null = null;
  private limiterCfg: MasterLimiterConfig | null;
  private destination: AudioNode;
  private _meterAnalyser: AnalyserNode | null = null;
  private _meterBuf: Float32Array | null = null;

  constructor(ctx: AudioContext, config: MasterConfig = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.headroomDb = config.headroom ?? 0;
    this.input.gain.value = dbToLinear(this.headroomDb);
    this.fader = ctx.createGain();
    this._volume = clamp01(config.volume ?? 1);
    this._muted = config.mute ?? false;
    this.fader.gain.value = this._muted ? 0 : this._volume;
    this.input.connect(this.fader);
    this.destination = ctx.destination;
    this.limiterCfg = config.limiter ?? null;
    this.rewire();
  }

  /** Master volume (0..1). The setter ramps over 10 ms. */
  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = clamp01(v);
    if (!this._muted) applyRamp(this.fader.gain, this.ctx.currentTime, this._volume, 0.01, 'linear');
  }

  /** Mute everything. Volume is kept and comes back on unmute. */
  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    if (this._muted === v) return;
    this._muted = v;
    applyRamp(this.fader.gain, this.ctx.currentTime, v ? 0 : this._volume, 0.01, 'linear');
  }

  /**
   * Fade the master volume to `target` over `duration` seconds. While muted
   * the target is stored and applied on unmute.
   */
  fadeTo(target: number, duration: number, curve: FadeCurve = 'linear'): Promise<void> {
    this._volume = clamp01(target);
    if (this._muted) return waitAudio(this.ctx, duration);
    applyRamp(this.fader.gain, this.ctx.currentTime, this._volume, duration, curve);
    return waitAudio(this.ctx, duration);
  }

  setHeadroom(db: number): void {
    this.headroomDb = db;
    // 10 ms, same as bus level/mute. A raw gain.value write pops.
    applyRamp(this.input.gain, this.ctx.currentTime, dbToLinear(db), 0.01, 'linear');
  }

  get headroom(): number {
    return this.headroomDb;
  }

  /**
   * Enable or update the master limiter. Pass `null` to disable.
   * The limiter sits between master gain and destination.
   */
  setLimiter(cfg: MasterLimiterConfig | null): void {
    this.limiterCfg = cfg;
    this.rewire();
  }

  /** Live gain reduction in dB. 0 if no limiter is engaged. */
  get reduction(): number {
    return this.limiterNode?.reduction ?? 0;
  }

  /**
   * Live amplitude readout on the master input. Returns `{ rms, peak }`
   * as linear values in [0..1]. The first call lazily attaches an
   * AnalyserNode as a passive sibling of the master gain — no audio-path
   * change. Same shape as `bus.meter()` and `voice.level()`.
   */
  meter(): AudioLevel {
    if (!this._meterAnalyser) {
      const a = this.ctx.createAnalyser();
      a.fftSize = 1024;
      this.input.connect(a);
      this._meterAnalyser = a;
      this._meterBuf = new Float32Array(a.fftSize);
    }
    const buf = this._meterBuf as Float32Array;
    this._meterAnalyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const s = buf[i] ?? 0;
      sumSq += s * s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sumSq / buf.length), peak };
  }

  dispose(): void {
    for (const n of [this.input, this.fader, this.limiterNode, this._meterAnalyser]) {
      try {
        n?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.limiterNode = null;
    this._meterAnalyser = null;
    this._meterBuf = null;
  }

  private rewire(): void {
    try {
      this.fader.disconnect();
    } catch {
      /* fresh */
    }
    try {
      this.limiterNode?.disconnect();
    } catch {
      /* fresh */
    }
    this.limiterNode = null;
    if (this.limiterCfg) {
      const cfg = this.limiterCfg;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = cfg.threshold ?? -1;
      limiter.knee.value = 0;
      limiter.ratio.value = Math.max(20, cfg.ratio ?? 20);
      limiter.attack.value = cfg.attack ?? 0.001;
      limiter.release.value = cfg.release ?? 0.05;
      this.fader.connect(limiter);
      limiter.connect(this.destination);
      this.limiterNode = limiter;
    } else {
      this.fader.connect(this.destination);
    }
  }
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
