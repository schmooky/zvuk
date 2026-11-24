import { glideTo } from '../mixer/curve';
import { BypassSwitch, FX_GLIDE_SEC } from './bypass';
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
 * Biquad filter as a bus FX insert. Frequency, Q and gain changes glide over
 * ~10 ms, and bypass crossfades to the dry signal, so a sweep driven from a
 * slider or a `Parameter` doesn't zipper or click.
 */
export class Filter implements FxInsert {
  readonly input: GainNode;
  readonly output: GainNode;
  private filter: BiquadFilterNode;
  private ctx: AudioContext;
  private bypass: BypassSwitch;

  constructor(ctx: AudioContext, config: FilterConfig = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = config.type ?? 'lowpass';
    this.filter.frequency.value = config.frequency ?? 1000;
    this.filter.Q.value = config.q ?? 1;
    this.filter.gain.value = config.gain ?? 0;
    this.bypass = new BypassSwitch(ctx, this.input, this.filter, this.filter, this.output);
  }

  setFrequency(hz: number): void {
    glideTo(this.filter.frequency, hz, this.ctx.currentTime, FX_GLIDE_SEC);
  }

  setQ(q: number): void {
    glideTo(this.filter.Q, q, this.ctx.currentTime, FX_GLIDE_SEC);
  }

  setType(t: FilterKind): void {
    this.filter.type = t;
  }

  /** Set the filter gain in dB. Only affects `peaking` (the one shelf-like mode exposed). */
  setGain(db: number): void {
    glideTo(this.filter.gain, db, this.ctx.currentTime, FX_GLIDE_SEC);
  }

  get bypassed(): boolean {
    return this.bypass.bypassed;
  }

  set bypassed(v: boolean) {
    this.bypass.bypassed = v;
  }

  dispose(): void {
    this.bypass.dispose();
    for (const n of [this.input, this.filter, this.output]) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
