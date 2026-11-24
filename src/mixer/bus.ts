import type { FxInsert } from '../fx/types';
import { waitAudio } from '../runtime/wait';
import type { Voice } from '../sources/voice';
import type { AudioLevel, BusConfig, ConcurrencyConfig, DuckOptions, FadeCurve, SendOptions } from '../types';
import { applyRamp } from './curve';
import { planSteal, type StealPlan, type VoiceCandidate } from './steal';

const ADMIT: StealPlan = { reject: false, victim: null };

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
    return waitAudio(this.ctx, duration);
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
  /** Sub-bus the FX chain splices into: input → fxInput → (fx…) → duck → output. */
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
  // Voice-driven ducking. A gain stage after the FX chain, so the fader
  // (`output.gain`) stays the user's and a duck never fights a fade.
  private readonly duckNode: GainNode;
  private ducks = new Map<number, { depth: number; start: number; attack: number }>();
  private duckSeq = 0;
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
    this.duckNode = ctx.createGain();
    this.output = ctx.createGain();

    // input -> fxInput -> duck -> output
    // FX inserts splice into the (fxInput -> duck) hop.
    this.input.connect(this.fxInput);
    this.fxInput.connect(this.duckNode);
    this.duckNode.connect(this.output);

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
    // Snapshot.blendWith writes mute on every bus on every frame; without
    // this guard each of those is a redundant ramp.
    if (this._muted === v) return;
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
    if (this._muted || this._soloVeiled) return waitAudio(this.ctx, duration);
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
   * Decide whether a voice that doesn't exist yet may play on this bus, and
   * which voice it displaces. Pure: stops nothing. The caller stops the
   * victim and only then starts the new voice, so a rejected voice never
   * makes a sound.
   *
   * @internal
   */
  planConcurrency(candidate: VoiceCandidate): StealPlan {
    const c = this._concurrency;
    if (!c) return ADMIT;
    return planSteal(this._voices, this._voices.size, c.max, c.steal ?? 'oldest', candidate);
  }

  /**
   * Pull this bus down by `amount` from audio time `at` until the returned
   * release function is called. Overlapping ducks take the deepest; the bus
   * comes back up when the last one releases. Used by `play({ duck })`.
   *
   * @returns a release function. Idempotent.
   */
  duck(opts: Omit<DuckOptions, 'bus'>, at: number = this.ctx.currentTime): () => void {
    const id = ++this.duckSeq;
    const depth = 1 - clamp01(opts.amount ?? 0.5);
    const attack = Math.max(0, opts.attack ?? 0.05);
    const release = Math.max(0, opts.release ?? 0.3);
    this.ducks.set(id, { depth, start: Math.max(at, this.ctx.currentTime), attack });
    this.scheduleDucks(attack);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ducks.delete(id);
      this.scheduleDucks(release);
    };
  }

  /** Current duck gain (1 = not ducked). */
  get duckLevel(): number {
    return this.duckNode.gain.value;
  }

  private scheduleDucks(rampSec: number): void {
    const now = this.ctx.currentTime;
    const param = this.duckNode.gain;
    let depth = 1;
    const future: { depth: number; start: number; attack: number }[] = [];
    for (const d of this.ducks.values()) {
      if (d.start <= now) depth = Math.min(depth, d.depth);
      else future.push(d);
    }
    applyRamp(param, now, depth, rampSec, 'linear');
    // Ducks that haven't started yet: stamp each attack at its own start.
    // The ramp above cancelled anything from `now` on, so re-lay them.
    future.sort((a, b) => a.start - b.start);
    let t = now + rampSec;
    for (const d of future) {
      if (d.depth >= depth) continue;
      depth = d.depth;
      const start = Math.max(d.start, t);
      try {
        param.setValueAtTime(param.value, start);
      } catch {
        /* inside a ramp window */
      }
      try {
        param.linearRampToValueAtTime(depth, start + d.attack);
      } catch {
        param.value = depth;
      }
      t = start + d.attack;
    }
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

  /**
   * Take an insert out of the chain. The insert is disconnected but not
   * disposed, so it can be added to another bus. Before v2 its output stayed
   * connected to this bus, so a reverb tail kept sounding and re-adding the
   * insert elsewhere routed it into both buses.
   */
  removeFx(fx: FxInsert): void {
    const idx = this._fxChain.indexOf(fx);
    if (idx === -1) return;
    this._fxChain.splice(idx, 1);
    try {
      fx.output.disconnect();
    } catch {
      /* not connected */
    }
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
    // One try per node: a single throw used to skip every disconnect after
    // it and leave stale edges in the chain.
    for (const node of [this.fxInput, ...this._fxChain.map((fx) => fx.output)]) {
      try {
        node.disconnect();
      } catch {
        /* fresh */
      }
    }
    let head: AudioNode = this.fxInput;
    for (const fx of this._fxChain) {
      head.connect(fx.input);
      head = fx.output;
    }
    head.connect(this.duckNode);
  }

  private rampOutput(to: number, duration: number): void {
    void this.ramp(to, duration, 'linear');
  }

  private ramp(to: number, duration: number, curve: FadeCurve): Promise<void> {
    const param = this.output.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, to, duration, curve);
    return waitAudio(this.ctx, duration);
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
    this.ducks.clear();
    try {
      this.input.disconnect();
      this.fxInput.disconnect();
      this.duckNode.disconnect();
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
