import type { FxInsert } from './types';

export type FilterKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'allpass';

export interface FilterConfig {
  type?: FilterKind;
  /** Cutoff/center frequency in Hz. Default 1000. */
  frequency?: number;
  /** Q factor (resonance). Default 1. */
  q?: number;
  /** Gain (dB) — only meaningful for `peaking`. Default 0. */
  gain?: number;
}

/**
 * Biquad filter as a bus FX insert. Bypass is a graph swap, not a parameter
 * trick — when bypassed, input is connected directly to output, leaving the
 * biquad fully detached so its delay-line state can't bleed into the dry
 * signal.
 */
export class Filter implements FxInsert {
  readonly input: GainNode;
  readonly output: GainNode;
  private filter: BiquadFilterNode;
  private ctx: AudioContext;
  private _bypassed = false;

  constructor(ctx: AudioContext, config: FilterConfig = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = config.type ?? 'lowpass';
    this.filter.frequency.value = config.frequency ?? 1000;
    this.filter.Q.value = config.q ?? 1;
    this.filter.gain.value = config.gain ?? 0;
    this.wire();
  }

  setFrequency(hz: number): void {
    this.filter.frequency.setValueAtTime(hz, this.ctx.currentTime);
  }

  setQ(q: number): void {
    this.filter.Q.setValueAtTime(q, this.ctx.currentTime);
  }

  setType(t: FilterKind): void {
    this.filter.type = t;
  }

  /** Set the filter gain in dB. Only affects `peaking` (the one shelf-like mode exposed). */
  setGain(db: number): void {
    this.filter.gain.setValueAtTime(db, this.ctx.currentTime);
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
      this.filter.disconnect();
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private wire(): void {
    try {
      this.input.disconnect();
      this.filter.disconnect();
    } catch {
      /* fresh */
    }
    if (this._bypassed) {
      this.input.connect(this.output);
    } else {
      this.input.connect(this.filter);
      this.filter.connect(this.output);
    }
  }
}
