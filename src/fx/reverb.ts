import type { FxInsert } from './types';

export interface ReverbConfig {
  /** Wet/dry mix (0 = dry, 1 = full wet). Default 0.3. */
  wet?: number;
  /** A loaded impulse-response buffer. If omitted, a synthetic decay is generated. */
  impulse?: AudioBuffer;
  /** Synthetic decay parameters (used when `impulse` is omitted). */
  decay?: {
    /** RT60-style decay in seconds. Default 1.5. */
    seconds?: number;
    /** Pre-delay in seconds. Default 0. */
    preDelay?: number;
  };
}

/**
 * Convolution reverb. Mixes a dry signal with a wet path that runs through
 * a ConvolverNode. If no impulse response is provided, a synthetic noise
 * decay is generated — quick and free, but not as nice as a real IR.
 */
export class Reverb implements FxInsert {
  readonly input: GainNode;
  readonly output: GainNode;
  private dry: GainNode;
  private wet: GainNode;
  private convolver: ConvolverNode;
  private preDelay: DelayNode;
  private ctx: AudioContext;
  private _bypassed = false;
  /** Active wet mix (0..1), so bypass can restore it instead of guessing. */
  private _wet: number;

  constructor(ctx: AudioContext, config: ReverbConfig = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.preDelay = ctx.createDelay(1.0);
    this.convolver = ctx.createConvolver();

    const wetMix = config.wet ?? 0.3;
    this._wet = wetMix;
    this.dry.gain.value = 1 - wetMix;
    this.wet.gain.value = wetMix;

    if (config.impulse) {
      this.convolver.buffer = config.impulse;
    } else {
      this.convolver.buffer = this.synthIR(config.decay?.seconds ?? 1.5);
    }
    this.preDelay.delayTime.value = config.decay?.preDelay ?? 0;

    this.input.connect(this.dry).connect(this.output);
    this.input.connect(this.preDelay).connect(this.convolver).connect(this.wet).connect(this.output);
  }

  setWet(mix: number): void {
    const m = Math.max(0, Math.min(1, mix));
    this._wet = m;
    if (this._bypassed) return; // remembered; applied when un-bypassed
    const t = this.ctx.currentTime;
    this.dry.gain.setValueAtTime(1 - m, t);
    this.wet.gain.setValueAtTime(m, t);
  }

  setImpulse(buffer: AudioBuffer): void {
    this.convolver.buffer = buffer;
  }

  get bypassed(): boolean {
    return this._bypassed;
  }

  set bypassed(v: boolean) {
    if (this._bypassed === v) return;
    this._bypassed = v;
    const t = this.ctx.currentTime;
    if (v) {
      // Transparent bypass: pass dry at unity, silence the wet path.
      this.dry.gain.setValueAtTime(1, t);
      this.wet.gain.setValueAtTime(0, t);
    } else {
      // Restore the configured/last-set mix (not a hardcoded default).
      this.dry.gain.setValueAtTime(1 - this._wet, t);
      this.wet.gain.setValueAtTime(this._wet, t);
    }
  }

  dispose(): void {
    try {
      this.input.disconnect();
      this.dry.disconnect();
      this.wet.disconnect();
      this.preDelay.disconnect();
      this.convolver.disconnect();
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  /** Generate a synthetic exponential-decay impulse response. */
  private synthIR(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const ir = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * (1 - t) ** 3;
      }
    }
    return ir;
  }
}
