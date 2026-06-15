import type { FxInsert } from '../fx/types';
import type { Voice } from '../sources/voice';
import type { AudioLevel, BusConfig, ConcurrencyConfig, FadeCurve, SendOptions } from '../types';
import { applyRamp } from './curve';

/**
 * One configured send from a source bus to a target bus. Returned by
 * `bus.send(target, ...)`; held by callers so the level can be adjusted
 * (or the send removed) at runtime.
 */
export class Send {
  readonly source: Bus;
  readonly target: Bus;
  readonly post: boolean;
  private gainNode: GainNode;
  private ctx: AudioContext;
  private disposed = false;

  constructor(source: Bus, target: Bus, options: SendOptions, ctx: AudioContext) {
    this.source = source;
    this.target = target;
    this.post = options.post ?? true;
    this.ctx = ctx;
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = clamp01(options.amount ?? 1);
    const tap = this.post ? source.output : source.input;
    tap.connect(this.gainNode);
    this.gainNode.connect(target.input);
  }

  /** Live send level (0..1). Setter ramps over 10 ms to avoid clicks. */
  get amount(): number {
    return this.gainNode.gain.value;
  }
  set amount(v: number) {
    if (this.disposed) return;
    applyRamp(this.gainNode.gain, this.ctx.currentTime, clamp01(v), 0.01, 'linear');
  }

  /** Fade the send to `target` over `duration` seconds. */
  fadeTo(target: number, duration: number, curve: FadeCurve = 'linear'): Promise<void> {
    if (this.disposed) return Promise.resolve();
    applyRamp(this.gainNode.gain, this.ctx.currentTime, clamp01(target), duration, curve);
    if (duration <= 0) return Promise.resolve();
    return new Promise((res) => setTimeout(res, duration * 1000));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.gainNode.disconnect();
    } catch {
      /* */
    }
  }
}

/**
 * A Bus is a named mix bucket with its own gain stage, optional FX inserts,
 * a voice-concurrency limit, and an optional sidechain key.
 *
 * Voices are connected to bus.input. The master receives bus.output.
 *
 * level/mute use 10ms ramps to avoid clicks; raw gain.value writes would
 * pop audibly on browsers that don't smooth the parameter. Public time
 * arguments (fadeTo) are seconds.
 */
export class Bus {
  readonly name: string;
  readonly input: GainNode;
  /** Sub-bus the FX chain splices into: input → fxInput → (fx…) → output. */
  readonly fxInput: GainNode;
  /** Output node — connect to master.input or another bus.input for sends. */
  readonly output: GainNode;

  private _level: number;
  private _muted: boolean;
  private _soloed = false;
  /** True while the engine's solo rule is silencing this (non-soloed) bus. */
  private _soloVeiled = false;
  private readonly ctx: AudioContext;
  private _concurrency: ConcurrencyConfig | null;
  private _voices = new Set<Voice>();
  private _fxChain: FxInsert[] = [];
  private _sends: Send[] = [];
  // Lazy meter tap. Connected as a passive sibling of bus.output → master.input
  // so the audio path is unchanged.
  private _meterAnalyser: AnalyserNode | null = null;
  private _meterBuf: Float32Array | null = null;
  /**
   * Engine-injected callback fired when this bus's solo state changes.
   * The Engine uses it to coordinate the global "any soloed → mute the
   * rest" rule across every bus in the graph. Bus does not depend on
   * Engine; the callback is the only escape hatch.
   */
  notifySoloChange?: (bus: Bus, soloed: boolean) => void;

  constructor(ctx: AudioContext, name: string, config: BusConfig = {}) {
    this.ctx = ctx;
    this.name = name;
    this._level = config.level ?? 1;
    this._muted = config.mute ?? false;
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
    if (!this._muted && !this._soloVeiled) this.rampOutput(this._level, 0.01);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;
    this.rampOutput(v || this._soloVeiled ? 0 : this._level, 0.01);
  }

  /** Fade the bus output to `target` over `duration` seconds. */
  fadeTo(target: number, duration: number, curve: FadeCurve = 'linear'): Promise<void> {
    const to = clamp01(target);
    this._level = to;
    // Respect mute / solo: store the target level but don't drive the output
    // gain while the bus is silenced — otherwise a fade would audibly un-mute
    // (or un-solo-veil) it. The stored level is applied when it is unmuted /
    // unveiled.
    if (this._muted || this._soloVeiled) return wait(duration);
    return this.ramp(to, duration, curve);
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
    return [...this._fxChain];
  }

  /**
   * Live amplitude readout on the bus output. Returns `{ rms, peak }` as
   * linear values in [0..1]. The first call lazily attaches an AnalyserNode
   * as a passive sibling of `bus.output → master.input`; subsequent calls
   * reuse it.
   *
   * Use this to drive a mixer-dashboard VU meter, drive automation that
   * reacts to overall bus level, or implement custom voice-stealing rules.
   */
  meter(): AudioLevel {
    if (!this._meterAnalyser) {
      const a = this.ctx.createAnalyser();
      a.fftSize = 1024;
      this.output.connect(a);
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

  /**
   * Route a copy of this bus's signal into another bus at the configured
   * level. `target.input` mixes the send naturally with whatever else is
   * already feeding it, so the typical pattern — "send 30 % of music to a
   * dedicated reverb bus" — is just two lines:
   *
   * ```ts
   * const verbSend = engine.bus('music').send(engine.bus('reverb'), { amount: 0.3 });
   * verbSend.amount = 0.5; // turn it up live
   * verbSend.dispose();    // remove the send entirely
   * ```
   *
   * Default tap is post-fader / post-FX (`post: true`); set `post: false`
   * if you want a monitor send that hears the dry pre-fader signal.
   */
  send(target: Bus, options: SendOptions = {}): Send {
    const send = new Send(this, target, options, this.ctx);
    this._sends.push(send);
    return send;
  }

  /** Remove a previously-created send. Idempotent. */
  removeSend(send: Send): void {
    const idx = this._sends.indexOf(send);
    if (idx === -1) return;
    this._sends.splice(idx, 1);
    send.dispose();
  }

  /** Read-only snapshot of every active send originating on this bus. */
  sends(): readonly Send[] {
    return [...this._sends];
  }

  /**
   * Solo this bus. The engine coordinates the global rule: while any bus
   * is soloed, every non-soloed bus is muted. Soloing multiple buses is
   * additive — they all stay audible. Calling `unsolo()` (or `solo(false)`)
   * removes this bus from the soloed set.
   *
   * Solo state is independent of `muted`; un-soloing returns the bus to
   * whatever its `muted` setting was. Useful in mixer UIs where the user
   * wants to A/B a single channel without disturbing the rest of the mix.
   */
  solo(on = true): void {
    if (this._soloed === on) return;
    this._soloed = on;
    this.notifySoloChange?.(this, on);
  }

  /** Turn solo off on this bus. Equivalent to `solo(false)`. */
  unsolo(): void {
    this.solo(false);
  }

  /** True when this bus is in the engine's solo set. */
  get soloed(): boolean {
    return this._soloed;
  }

  /**
   * Engine-only. Apply a transient mute (or restore) driven by the global
   * solo state. Distinct from `muted` so un-soloing returns the bus to its
   * user-visible mute state without re-rendering.
   */
  applySoloVeil(soloMute: boolean): void {
    this._soloVeiled = soloMute;
    const target = this._muted ? 0 : soloMute ? 0 : this._level;
    this.rampOutput(target, 0.01);
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

  private rampOutput(to: number, duration: number): void {
    void this.ramp(to, duration, 'linear');
  }

  private ramp(to: number, duration: number, curve: FadeCurve): Promise<void> {
    const param = this.output.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, to, duration, curve);
    return wait(duration);
  }

  dispose(): void {
    // Tear down sends (their GainNodes stay connected to target buses
    // otherwise) and FX inserts. Both dispose() calls are idempotent, so a
    // bus disposed directly is cleaned up the same as one torn down via
    // engine.close().
    for (const send of this._sends) send.dispose();
    this._sends = [];
    for (const fx of this._fxChain) fx.dispose();
    this._fxChain = [];
    try {
      this.input.disconnect();
      this.fxInput.disconnect();
      this.output.disconnect();
      this._meterAnalyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    this._meterAnalyser = null;
    this._meterBuf = null;
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function wait(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((res) => setTimeout(res, seconds * 1000));
}

function pickVictim(
  voices: ReadonlySet<Voice>,
  strategy: NonNullable<ConcurrencyConfig['steal']>,
  newVoice: Voice,
): Voice | null {
  // Snapshot RMS once per candidate up-front for 'quietest' so the comparison
  // doesn't re-poll the AnalyserNode for every pair.
  const rmsCache: Map<Voice, number> | null = strategy === 'quietest' ? new Map<Voice, number>() : null;
  if (rmsCache) for (const v of voices) if (v !== newVoice) rmsCache.set(v, v.level().rms);

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
      case 'quietest': {
        const a = rmsCache?.get(v) ?? 0;
        const b = rmsCache?.get(victim) ?? 0;
        if (a < b) victim = v;
        break;
      }
      default:
        break;
    }
  }
  return victim;
}
