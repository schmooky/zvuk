import type { Bus } from '../mixer/bus';
import type { FxInsert } from './types';

export interface DuckerConfig {
  /** How much to attenuate when fully ducking (0..1). Default 0.5 = -6 dB. */
  amount?: number;
  /** Attack in seconds. Default 0.08. */
  attack?: number;
  /** Release in seconds. Default 0.4. */
  release?: number;
  /** Threshold (linear amplitude) on the source bus's RMS to trigger ducking. Default 0.05. */
  threshold?: number;
}

/**
 * Sidechain ducker. Inserts on the *target* bus (e.g. music) and listens to
 * the level of a source bus (e.g. voice). When the source is loud, the
 * target's gain drops; when quiet, it returns.
 *
 * Implementation: an envelope follower running on the source bus's RMS,
 * driving an additional gain node spliced into the target's FX chain.
 *
 * The envelope follower runs on the main thread at ~60 Hz — fine for a
 * speech ducker, not for sample-accurate audio-rate sidechaining. For that,
 * use a custom AudioWorklet (planned).
 */
export class Ducker implements FxInsert {
  readonly input: GainNode;
  readonly output: GainNode;
  private gain: GainNode;
  private analyser: AnalyserNode;
  private buf: Float32Array;
  private rafId: number | null = null;
  private envelope = 0;
  private targetGain = 1;
  private ctx: AudioContext;
  private cfg: Required<DuckerConfig>;
  private _bypassed = false;
  private sourceBus: Bus;

  constructor(ctx: AudioContext, sourceBus: Bus, config: DuckerConfig = {}) {
    this.ctx = ctx;
    this.sourceBus = sourceBus;
    this.cfg = {
      amount: config.amount ?? 0.5,
      attack: config.attack ?? 0.08,
      release: config.release ?? 0.4,
      threshold: config.threshold ?? 0.05,
    };
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.gain = ctx.createGain();
    this.input.connect(this.gain).connect(this.output);

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    sourceBus.output.connect(this.analyser);

    this.tick();
  }

  setAmount(a: number): void {
    this.cfg.amount = Math.max(0, Math.min(1, a));
  }

  setThreshold(t: number): void {
    this.cfg.threshold = Math.max(0, t);
  }

  get bypassed(): boolean {
    return this._bypassed;
  }

  set bypassed(v: boolean) {
    if (this._bypassed === v) return;
    this._bypassed = v;
    if (v) this.gain.gain.value = 1;
  }

  dispose(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    try {
      // Tear down the inbound edge from the source bus first — that's the
      // one that keeps the analyser (and its 1024-sample Float32Array) live
      // for the bus's lifetime if we only disconnect the analyser's outgoing
      // side.
      this.sourceBus.output.disconnect(this.analyser);
    } catch {
      /* not connected */
    }
    try {
      this.input.disconnect();
      this.gain.disconnect();
      this.analyser.disconnect();
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private tick = (): void => {
    if (this._bypassed) {
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const s = this.buf[i] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.buf.length);
    const exceeded = Math.max(0, rms - this.cfg.threshold);
    const target = exceeded > 0 ? 1 - this.cfg.amount : 1;
    // Single-pole envelope follower: τ in seconds → coefficient per frame.
    const dtSec = 1 / 60;
    const useAttack = target < this.envelope;
    const tau = (useAttack ? this.cfg.attack : this.cfg.release) || 0.001;
    const alpha = 1 - Math.exp(-dtSec / tau);
    this.envelope = this.envelope + alpha * (target - this.envelope);
    if (Math.abs(this.envelope - this.targetGain) > 0.001) {
      this.targetGain = this.envelope;
      this.gain.gain.setTargetAtTime(this.envelope, this.ctx.currentTime, 0.005);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };
}
