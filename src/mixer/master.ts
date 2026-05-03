import type { MasterConfig, MasterLimiterConfig } from '../types';

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

  dispose(): void {
    try {
      this.input.disconnect();
      this.limiterNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.limiterNode = null;
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
