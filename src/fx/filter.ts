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

export class Filter implements FxInsert {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;
  private bypassPath: GainNode;
  private direct: GainNode;
  private ctx: AudioContext;
  private _bypassed = false;

  constructor(ctx: AudioContext, config: FilterConfig = {}) {
    this.ctx = ctx;
    const node = ctx.createBiquadFilter();
    node.type = config.type ?? 'lowpass';
    node.frequency.value = config.frequency ?? 1000;
    node.Q.value = config.q ?? 1;
    node.gain.value = config.gain ?? 0;
    this.input = node;
    this.output = node;
    this.bypassPath = ctx.createGain();
    this.direct = ctx.createGain();
    this.direct.connect(node);
  }

  setFrequency(hz: number): void {
    this.input.frequency.setValueAtTime(hz, this.ctx.currentTime);
  }

  setQ(q: number): void {
    this.input.Q.setValueAtTime(q, this.ctx.currentTime);
  }

  setType(t: FilterKind): void {
    this.input.type = t;
  }

  get bypassed(): boolean {
    return this._bypassed;
  }

  set bypassed(v: boolean) {
    if (this._bypassed === v) return;
    this._bypassed = v;
    this.input.frequency.value = v ? 22050 : (this.input.frequency.value || 1000);
  }

  dispose(): void {
    try {
      this.input.disconnect();
      this.bypassPath.disconnect();
      this.direct.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
