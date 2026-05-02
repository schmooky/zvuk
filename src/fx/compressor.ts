import type { FxInsert } from './types';

export interface CompressorConfig {
  /** dB at which compression begins. Default -24. */
  threshold?: number;
  /** dB range over which the curve smoothly transitions into compression. Default 30. */
  knee?: number;
  /** Compression ratio. Default 12. */
  ratio?: number;
  /** Attack time in seconds. Default 0.003. */
  attack?: number;
  /** Release time in seconds. Default 0.25. */
  release?: number;
  /** Make-up gain in dB applied after compression. Default 0. */
  makeupGain?: number;
}

/**
 * Dynamics compressor as a bus FX insert. Wraps DynamicsCompressorNode and a
 * make-up gain node, and exposes `input`/`output` so the Bus can wire it into
 * its FX chain. Bypass is a graph swap, not a parameter — when bypassed, the
 * input is connected directly to the output (avoids the compressor's
 * non-zero look-ahead latency leaking into the dry signal).
 */
export class Compressor implements FxInsert {
  readonly input: GainNode;
  readonly output: GainNode;
  private compressor: DynamicsCompressorNode;
  private makeup: GainNode;
  private ctx: AudioContext;
  private _bypassed = false;

  constructor(ctx: AudioContext, config: CompressorConfig = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.compressor = ctx.createDynamicsCompressor();
    this.makeup = ctx.createGain();
    this.applyConfig(config);
    this.wire();
  }

  applyConfig(c: CompressorConfig): void {
    const t = this.ctx.currentTime;
    if (c.threshold != null) this.compressor.threshold.setValueAtTime(c.threshold, t);
    if (c.knee != null) this.compressor.knee.setValueAtTime(c.knee, t);
    if (c.ratio != null) this.compressor.ratio.setValueAtTime(c.ratio, t);
    if (c.attack != null) this.compressor.attack.setValueAtTime(c.attack, t);
    if (c.release != null) this.compressor.release.setValueAtTime(c.release, t);
    if (c.makeupGain != null) {
      this.makeup.gain.setValueAtTime(10 ** (c.makeupGain / 20), t);
    }
  }

  /** Live gain reduction in dB (read-only, negative when compressing). */
  get reduction(): number {
    return this.compressor.reduction;
  }

  get bypassed(): boolean {
    return this._bypassed;
  }

  set bypassed(v: boolean) {
    if (this._bypassed === v) return;
    this._bypassed = v;
    this.wire();
  }

  dispose(): void {
    try {
      this.input.disconnect();
      this.compressor.disconnect();
      this.makeup.disconnect();
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private wire(): void {
    try {
      this.input.disconnect();
      this.compressor.disconnect();
      this.makeup.disconnect();
    } catch {
      /* fresh */
    }
    if (this._bypassed) {
      this.input.connect(this.output);
    } else {
      this.input.connect(this.compressor);
      this.compressor.connect(this.makeup);
      this.makeup.connect(this.output);
    }
  }
}
