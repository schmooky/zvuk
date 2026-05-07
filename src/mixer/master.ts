import type { AudioLevel, MasterConfig, MasterLimiterConfig } from '../types';

/**
 * The Master stage. Headroom-aware gain into an optional brick-wall limiter,
 * then to destination. Buses connect their output to master.input.
 *
 * Headroom is a static gain offset; the limiter is a fast-attack
 * DynamicsCompressorNode that catches peaks the headroom can't tame when
 * heavy FX stack on top of busy mixes.
 */
export class Master {
  readonly input: GainNode;
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
    this.destination = ctx.destination;
    this.limiterCfg = config.limiter ?? null;
    this.rewire();
  }

  setHeadroom(db: number): void {
    this.headroomDb = db;
    this.input.gain.value = dbToLinear(db);
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
    try {
      this.input.disconnect();
      this.limiterNode?.disconnect();
      this._meterAnalyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.limiterNode = null;
    this._meterAnalyser = null;
    this._meterBuf = null;
  }

  private rewire(): void {
    try {
      this.input.disconnect();
      this.limiterNode?.disconnect();
    } catch {
      /* fresh */
    }
    this.limiterNode = null;
    if (!this.limiterCfg) {
      this.input.connect(this.destination);
      return;
    }
    const cfg = this.limiterCfg;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = cfg.threshold ?? -1;
    limiter.knee.value = 0;
    limiter.ratio.value = Math.max(20, cfg.ratio ?? 20);
    limiter.attack.value = cfg.attack ?? 0.001;
    limiter.release.value = cfg.release ?? 0.05;
    this.input.connect(limiter);
    limiter.connect(this.destination);
    this.limiterNode = limiter;
  }
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
