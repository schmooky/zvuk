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
  /** Timestamp of the previous tick (ms), for measuring the real frame delta. */
  private lastTickMs = 0;
  /**
   * Envelope-follower state, 1 = not ducking. It starts at unity: starting
   * at 0 made every freshly-inserted ducker drop its target bus to silence
   * and swell it back over the release time.
   */
  private envelope = 1;
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

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibility);
    }
    this.startLoop();
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
    if (v) {
      // Ramp back to unity rather than writing .value, and park the loop —
      // a bypassed ducker was still burning a frame callback forever.
      this.releaseToUnity();
      this.stopLoop();
    } else {
      // Re-enter from unity so the first tick after un-bypass doesn't chase
      // a stale envelope, and so a loud source isn't mistaken for "already
      // at target" and left un-ducked.
      this.resetEnvelope();
      this.startLoop();
    }
  }

  dispose(): void {
    this.stopLoop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibility);
    }
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

  private tick = (timeMs?: number): void => {
    // Measure the real frame delta (rAF passes a timestamp), clamped so a
    // 120 Hz display doesn't duck twice as fast and a throttled/backgrounded
    // tab doesn't produce a huge jump. Fall back to 1/60 on the first tick.
    let dtSec = 1 / 60;
    if (timeMs != null && this.lastTickMs > 0) {
      dtSec = Math.min(0.1, Math.max(0.001, (timeMs - this.lastTickMs) / 1000));
    }
    if (timeMs != null) this.lastTickMs = timeMs;

    if (this._bypassed) {
      // Loop is parked by the setter; nothing to re-arm.
      this.rafId = null;
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

  /**
   * A hidden tab stops firing rAF, so the envelope freezes wherever it was.
   * Come back to a ducker that was mid-duck and the music stays quiet with
   * nothing driving it back up. Reset to unity on return and let the next
   * few frames re-duck if the source really is still loud.
   */
  private handleVisibility = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.resetEnvelope();
    if (!this._bypassed) this.startLoop();
  };

  private resetEnvelope(): void {
    this.envelope = 1;
    this.targetGain = 1;
    this.lastTickMs = 0;
    this.releaseToUnity();
  }

  private releaseToUnity(): void {
    this.gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.005);
  }

  private startLoop(): void {
    // No rAF under SSR — the rest of the codebase guards on `document`, and
    // constructing a Ducker on the server used to throw here.
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.rafId != null) return;
    this.tick();
  }

  private stopLoop(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
