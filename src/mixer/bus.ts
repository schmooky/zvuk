import type { FxInsert } from '../fx/types';
import type { Voice } from '../sources/voice';
import type { BusConfig, ConcurrencyConfig, FadeCurve } from '../types';
import { applyRamp } from './curve';

/**
 * A Bus is a named mix bucket with its own gain stage, optional FX inserts,
 * a voice-concurrency limit, and an optional sidechain key.
 *
 * Voices are connected to bus.input. The master receives bus.output.
 *
 * level/mute use 10ms ramps to avoid clicks; raw gain.value writes would
 * pop audibly on browsers that don't smooth the parameter.
 */
export class Bus {
  readonly name: string;
  readonly input: GainNode;
  /** Sub-bus where FX inserts go. Currently == input; reserved for FX chain. */
  readonly fxInput: GainNode;
  /** Output node — connect to master.input or another bus.input for sends. */
  readonly output: GainNode;

  private _level: number;
  private _muted: boolean;
  private _baseLevel: number;
  private readonly ctx: AudioContext;
  private _concurrency: ConcurrencyConfig | null;
  private _voices = new Set<Voice>();
  private _fxChain: FxInsert[] = [];

  constructor(ctx: AudioContext, name: string, config: BusConfig = {}) {
    this.ctx = ctx;
    this.name = name;
    this._level = config.level ?? 1;
    this._muted = config.mute ?? false;
    this._baseLevel = this._level;
    this._concurrency = config.concurrency ?? null;

    this.input = ctx.createGain();
    this.fxInput = ctx.createGain();
    this.output = ctx.createGain();

    // input -> fxInput -> output
    // FX inserts will splice into the (fxInput -> output) hop later.
    this.input.connect(this.fxInput);
    this.fxInput.connect(this.output);

    this.output.gain.value = this._muted ? 0 : this._level;
  }

  get level(): number {
    return this._level;
  }

  set level(v: number) {
    this._level = clamp01(v);
    this._baseLevel = this._level;
    if (!this._muted) this.rampOutput(this._level, 10);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;
    this.rampOutput(v ? 0 : this._level, 10);
  }

  fadeTo(target: number, durationMs: number, curve: FadeCurve = 'linear'): Promise<void> {
    const to = clamp01(target);
    this._level = to;
    this._baseLevel = to;
    return this.ramp(to, durationMs, curve);
  }

  /** Active voice count on this bus. */
  get voiceCount(): number {
    return this._voices.size;
  }

  /** Read-only iterator over active voices. */
  voices(): readonly Voice[] {
    return Array.from(this._voices);
  }

  /** Concurrency config — read it for UI, mutate via setConcurrency. */
  get concurrency(): ConcurrencyConfig | null {
    return this._concurrency;
  }

  setConcurrency(c: ConcurrencyConfig | null): void {
    this._concurrency = c;
  }

  /**
   * Called by Engine right before adding a new Voice. Returns a Voice that
   * was stolen to make room (so the engine can release it from its tracking),
   * or null if no steal was needed (or the new voice itself was rejected,
   * in which case onReject is invoked instead).
   */
  applyConcurrencyOnSpawn(newVoice: Voice, onReject: () => void): Voice | null {
    const c = this._concurrency;
    if (!c) return null;
    // The new voice is already tracked at this point; only steal once we
    // *exceed* max, not when we hit it exactly.
    if (this._voices.size <= c.max) return null;

    const strategy = c.steal ?? 'oldest';
    if (strategy === 'none') {
      onReject();
      return null;
    }

    const victim = pickVictim(this._voices, strategy, newVoice);
    if (!victim) {
      onReject();
      return null;
    }
    victim.stop();
    return victim;
  }

  /** Engine-only: register an active voice. */
  trackVoice(v: Voice): void {
    this._voices.add(v);
  }

  /** Engine-only: deregister a finished voice. */
  releaseVoice(v: Voice): void {
    this._voices.delete(v);
  }

  /** Add an FX insert to the bus's FX chain (post-input, pre-output). */
  addFx(fx: FxInsert): void {
    this._fxChain.push(fx);
    this.rewireFxChain();
  }

  removeFx(fx: FxInsert): void {
    const idx = this._fxChain.indexOf(fx);
    if (idx === -1) return;
    this._fxChain.splice(idx, 1);
    this.rewireFxChain();
  }

  fx(): readonly FxInsert[] {
    return this._fxChain;
  }

  private rewireFxChain(): void {
    try {
      this.fxInput.disconnect();
      for (const fx of this._fxChain) fx.output.disconnect();
    } catch {
      /* fresh */
    }
    let head: AudioNode = this.fxInput;
    for (const fx of this._fxChain) {
      head.connect(fx.input);
      head = fx.output;
    }
    head.connect(this.output);
  }

  private rampOutput(to: number, durationMs: number): void {
    void this.ramp(to, durationMs, 'linear');
  }

  private ramp(to: number, durationMs: number, curve: FadeCurve): Promise<void> {
    const param = this.output.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, to, durationMs, curve);
    return wait(durationMs);
  }

  dispose(): void {
    try {
      this.input.disconnect();
      this.fxInput.disconnect();
      this.output.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((res) => setTimeout(res, ms));
}

function pickVictim(
  voices: ReadonlySet<Voice>,
  strategy: NonNullable<ConcurrencyConfig['steal']>,
  newVoice: Voice,
): Voice | null {
  let victim: Voice | null = null;
  for (const v of voices) {
    if (v === newVoice) continue;
    if (!victim) {
      victim = v;
      continue;
    }
    switch (strategy) {
      case 'oldest':
        if (v.startedAt < victim.startedAt) victim = v;
        break;
      case 'lowest-priority':
        if (v.priority < victim.priority) victim = v;
        break;
      case 'quietest':
        // Voice doesn't expose a meter yet — fall back to oldest.
        if (v.startedAt < victim.startedAt) victim = v;
        break;
      default:
        break;
    }
  }
  return victim;
}
