import { applyRamp } from '../mixer/curve';
import type { Spatializer } from '../spatial/spatializer';
import type { AudioLevel, FadeOptions, PlayOptions, StopOptions } from '../types';

type VoiceCue = 'started' | 'paused' | 'resumed' | 'ended';

const DEFAULT_STOP_FADE_SEC = 0.008;

interface VoiceDeps {
  ctx: AudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  options: PlayOptions;
  onEnded: (v: Voice) => void;
  spatializer?: Spatializer;
  sourceName?: string;
  /** Engine-level default click-free fade for stop() (seconds). */
  defaultStopFade?: number;
}

/**
 * One playback instance, returned from sound.play(). Owns its source node
 * and gain stage; disposes itself on natural end, signal abort, or stop().
 *
 * Voice constructor is package-private — callers obtain instances via
 * Sound.play().
 */
export class Voice {
  readonly id: number;
  readonly priority: number;
  readonly bus: string | undefined;
  readonly startedAt: number;
  /** Name of the Sound that spawned this voice (if any). Used for crossfade. */
  readonly sourceName: string | undefined;

  /** Resolves when playback finishes (natural end, stop(), or abort). */
  readonly ended: Promise<void>;

  private ctx: AudioContext;
  private gain: GainNode;
  private source: AudioBufferSourceNode;
  private buffer: AudioBuffer;
  private loop: boolean;
  private basePitch: number;
  private done = false;
  private stopping = false;
  private paused = false;
  private resolveEnded!: () => void;
  private cueListeners = new Set<(c: VoiceCue) => void>();
  private startCtxTime: number;
  private pausedOffset = 0;
  private currentOffset = 0;
  private _spatializer: Spatializer | undefined;
  private startOffset: number;
  private regionDuration: number | undefined;
  private loopStart: number | undefined;
  private loopEnd: number | undefined;
  private regionTimer: ReturnType<typeof setTimeout> | null = null;
  private stopFade: number;
  // Loop-crossfade state. Inactive when crossfadeSec === 0.
  // In crossfade mode, `source` is the most-recently-armed segment and the
  // `crossfadeChain` carries every segment currently scheduled or live so
  // that stop/pause/setPlaybackRate can fan out across them.
  private crossfadeSec = 0;
  private crossfadeRegionStart = 0;
  private crossfadeRegionLen = 0;
  private crossfadeChain: { source: AudioBufferSourceNode; gain: GainNode; startTime: number }[] = [];
  private crossfadeArmTimer: ReturnType<typeof setTimeout> | null = null;
  // Lazily-allocated meter tap. Created on first level() read; kept alive
  // until finish(). The tap connects voice gain → analyser as a sibling of
  // gain → destination, so the audio path is unchanged and the analyser is
  // a passive read-only observer.
  private levelAnalyser: AnalyserNode | null = null;
  private levelBuf: Float32Array | null = null;

  static nextId = 1;

  constructor(deps: VoiceDeps) {
    const { ctx, buffer, destination, options } = deps;
    this.id = Voice.nextId++;
    this.ctx = ctx;
    this.priority = options.priority ?? 0;
    this.bus = options.bus;
    this.sourceName = deps.sourceName;
    this.startedAt = ctx.currentTime;
    this.buffer = buffer;
    this.loop = options.loop ?? false;
    this.basePitch = resolveJittered(options.pitch ?? 1, 1);
    this._spatializer = deps.spatializer;
    this.startOffset = options.offset ?? 0;
    this.currentOffset = this.startOffset;
    this.regionDuration = options.duration;
    this.loopStart = options.loopStart;
    this.loopEnd = options.loopEnd;
    this.stopFade = Math.max(0, deps.defaultStopFade ?? DEFAULT_STOP_FADE_SEC);

    this.gain = ctx.createGain();
    const initialVolume = clamp01(resolveJittered(options.volume ?? 1));
    const fadeIn = Math.max(0, options.fadeIn ?? 0);
    if (fadeIn > 0) {
      // Ramp 0 → target volume over `fadeIn` seconds. Mirror MusicVoice
      // semantics so the convenience reads identically across sources.
      this.gain.gain.setValueAtTime(0, ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(initialVolume, ctx.currentTime + fadeIn);
    } else {
      this.gain.gain.value = initialVolume;
    }
    this.gain.connect(destination);

    this.startCtxTime = ctx.currentTime;

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    if (options.signal) {
      if (options.signal.aborted) {
        // Defer so callers can attach .ended before we resolve.
        queueMicrotask(() => this.stop());
      } else {
        options.signal.addEventListener('abort', () => this.stop(), { once: true });
      }
    }

    if (this.shouldUseLoopCrossfade(options)) {
      this.crossfadeSec = options.loopCrossfade!;
      this.crossfadeRegionStart = options.loopStart ?? this.startOffset;
      const regionEnd = options.loopEnd ?? buffer.duration;
      this.crossfadeRegionLen = Math.max(0, regionEnd - this.crossfadeRegionStart);
      // Spawn the first segment + arm the chain. `source` is set inside.
      this.source = this.startCrossfadeChain(ctx.currentTime);
    } else {
      this.source = this.createSourceNode(this.basePitch);
      this.bindSourceLifecycle(this.source, () => {});
      try {
        this.source.start(0, this.startOffset);
      } catch {
        /* already started */
      }
      this.armRegionTimer(this.regionDuration);
    }

    queueMicrotask(() => this.emit('started'));
    // Hook end notification for the parent.
    void this.ended.then(() => deps.onEnded(this));
  }

  private shouldUseLoopCrossfade(options: PlayOptions): boolean {
    if (!this.loop) return false;
    const cf = options.loopCrossfade;
    if (cf == null || cf <= 0) return false;
    const start = options.loopStart ?? this.startOffset;
    const end = options.loopEnd ?? this.buffer.duration;
    const len = end - start;
    // Crossfade only makes sense if the region is at least 2× the window —
    // otherwise the next segment starts before the previous one's fade-in
    // ends, and the math collapses. Silent fallback to native loop.
    return len > cf * 2;
  }

  fade(opts: FadeOptions): Promise<void> {
    const param = this.gain.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, clamp01(opts.to), opts.duration, opts.curve ?? 'linear');
    return new Promise((res) => setTimeout(res, Math.max(0, opts.duration) * 1000));
  }

  /**
   * Stop the voice. Applies a short linear gain ramp (default ~8 ms) before
   * the source node actually stops, to suppress the digital click that
   * would otherwise fire if the source is cut mid-waveform on a non-zero
   * crossing. Pass `{ fade: 0 }` for an instant hard cut, or a longer
   * duration for an explicit tail.
   *
   * Re-entrant calls during an in-progress stop are no-ops — the first
   * stop wins. The voice's `.ended` promise resolves when the audio
   * actually stops (i.e. after the ramp completes).
   */
  stop(opts: StopOptions = {}): void {
    if (this.done || this.stopping) return;
    const fade = Math.max(0, opts.fade ?? this.stopFade);

    if (this.crossfadeArmTimer != null) {
      clearTimeout(this.crossfadeArmTimer);
      this.crossfadeArmTimer = null;
    }

    if (fade === 0) {
      this.stopAllSources(0);
      this.finish('ended');
      return;
    }

    this.stopping = true;
    const now = this.ctx.currentTime;
    const stopAt = now + fade;

    // We own the finish lifecycle for the click-free path; detach onended on
    // every live source so they don't race our setTimeout below.
    for (const src of this.activeSources()) src.onended = null;

    if (this.regionTimer != null) {
      clearTimeout(this.regionTimer);
      this.regionTimer = null;
    }

    try {
      const param = this.gain.gain;
      param.cancelScheduledValues(now);
      // Pin the current value so linearRampToValueAtTime has a defined "from"
      // even if there were no prior scheduled events on this param.
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(0, stopAt);
      this.stopAllSources(stopAt);
    } catch {
      // Schedule failed (e.g. source already stopped) — fall through to a
      // hard finish so we don't leak a node graph.
      this.finish('ended');
      return;
    }

    setTimeout(() => this.finish('ended'), fade * 1000);
  }

  private activeSources(): AudioBufferSourceNode[] {
    if (this.inCrossfadeMode) return this.crossfadeChain.map((e) => e.source);
    return [this.source];
  }

  private stopAllSources(when: number): void {
    for (const src of this.activeSources()) {
      try {
        if (when === 0) src.stop();
        else src.stop(when);
      } catch {
        /* already stopped */
      }
    }
  }

  /**
   * Pause this voice. Tracks the playback offset so resume() picks up
   * where it left off. No-op on a finished voice.
   */
  pause(): void {
    if (this.done || this.paused) return;
    const offset = this.computeOffset();
    this.pausedOffset = offset;
    this.currentOffset = offset;
    this.paused = true;
    if (this.regionTimer != null) {
      clearTimeout(this.regionTimer);
      this.regionTimer = null;
    }
    if (this.crossfadeArmTimer != null) {
      clearTimeout(this.crossfadeArmTimer);
      this.crossfadeArmTimer = null;
    }
    for (const src of this.activeSources()) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (this.inCrossfadeMode) this.crossfadeChain = [];
    this.emit('paused');
  }

  /** Resume from the offset captured on pause(). No-op when not paused. */
  resume(): void {
    if (this.done || !this.paused) return;
    this.paused = false;
    this.startCtxTime = this.ctx.currentTime;
    if (this.inCrossfadeMode) {
      // Restart a fresh chain. Resume keys off the loop region — we don't
      // try to re-enter mid-segment because each segment owns a stop timer.
      this.source = this.startCrossfadeChain(this.startCtxTime);
    } else {
      this.source = this.createSourceNode(this.basePitch);
      this.bindSourceLifecycle(this.source, () => {});
      try {
        this.source.start(0, this.pausedOffset);
      } catch {
        /* already started */
      }
      if (this.regionDuration != null) {
        const consumed = Math.max(0, this.pausedOffset - this.startOffset);
        const remaining = Math.max(0, this.regionDuration - consumed);
        this.armRegionTimer(remaining);
      }
    }
    this.emit('resumed');
  }

  /** Whether the voice is currently paused (and thus retaining its offset). */
  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Live playback-rate setter. Optional ramp via curve.
   * Setting while paused only updates the value used on the next start.
   */
  setPlaybackRate(rate: number, opts: { duration?: number; curve?: FadeOptions['curve'] } = {}): void {
    if (this.done) return;
    const r = Math.max(0, rate);
    const duration = Math.max(0, opts.duration ?? 0);
    if (!this.paused) {
      // Snapshot offset at the previous rate before we change it.
      this.currentOffset = this.computeOffset();
      this.startCtxTime = this.ctx.currentTime;
    }
    this.basePitch = r;
    if (this.paused) return;
    // Apply to every live source — single-source mode = one entry, crossfade
    // mode = the current live segment + any future ones (newly spawned
    // segments pick up basePitch in spawnCrossfadeSegment).
    for (const src of this.activeSources()) {
      const param = src.playbackRate;
      if (duration === 0) {
        param.value = r;
      } else {
        applyRamp(param, this.ctx.currentTime, r, duration, opts.curve ?? 'linear');
      }
    }
  }

  get playbackRate(): number {
    return this.basePitch;
  }

  /** The Spatializer attached to this voice (if any). Use for live setPan/setPosition. */
  get spatializer(): Spatializer | undefined {
    return this._spatializer;
  }

  /**
   * Live amplitude readout. Returns `{ rms, peak }` as linear values in
   * [0..1]. The first call lazily attaches an AnalyserNode to the voice's
   * gain stage; subsequent calls reuse it. Returns zeros once the voice has
   * finished.
   */
  level(): AudioLevel {
    if (this.done) return { rms: 0, peak: 0 };
    if (!this.levelAnalyser) {
      const a = this.ctx.createAnalyser();
      a.fftSize = 512;
      this.gain.connect(a);
      this.levelAnalyser = a;
      this.levelBuf = new Float32Array(a.fftSize);
    }
    const buf = this.levelBuf as Float32Array;
    this.levelAnalyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
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

  /** Async iterator of lifecycle cues — yields started, optional paused, ended. */
  async *cues(): AsyncIterableIterator<VoiceCue> {
    // Already finished before anyone subscribed: still surface the terminal
    // cue so a late consumer observes completion instead of an empty stream.
    if (this.done) {
      yield 'ended';
      return;
    }
    const queue: VoiceCue[] = [];
    let waiter: ((v: IteratorResult<VoiceCue>) => void) | null = null;
    const push = (c: VoiceCue) => {
      if (waiter) {
        const w = waiter;
        waiter = null;
        w({ value: c, done: false });
      } else {
        queue.push(c);
      }
    };
    const sub = (c: VoiceCue) => push(c);
    this.cueListeners.add(sub);

    try {
      while (true) {
        if (queue.length > 0) {
          const next = queue.shift()!;
          yield next;
          if (next === 'ended') return;
          continue;
        }
        if (this.done) {
          // Finished with nothing queued — still end the stream with 'ended'.
          yield 'ended';
          return;
        }
        const next = await new Promise<IteratorResult<VoiceCue>>((res) => {
          waiter = res;
        });
        if (next.done) return;
        yield next.value;
        if (next.value === 'ended') return;
      }
    } finally {
      this.cueListeners.delete(sub);
    }
  }

  private finish(reason: VoiceCue, hook?: (v: Voice) => void): void {
    if (this.done) return;
    this.done = true;
    if (this.regionTimer != null) {
      clearTimeout(this.regionTimer);
      this.regionTimer = null;
    }
    if (this.crossfadeArmTimer != null) {
      clearTimeout(this.crossfadeArmTimer);
      this.crossfadeArmTimer = null;
    }
    try {
      for (const src of this.activeSources()) src.disconnect();
      for (const e of this.crossfadeChain) e.gain.disconnect();
      this.levelAnalyser?.disconnect();
      this.gain.disconnect();
    } catch {
      /* already gone */
    }
    this.levelAnalyser = null;
    this.levelBuf = null;
    this.crossfadeChain = [];
    this.emit(reason);
    this.resolveEnded();
    hook?.(this);
  }

  private emit(c: VoiceCue): void {
    for (const fn of this.cueListeners) fn(c);
  }

  private createSourceNode(rate: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    if (this.loop && this.loopStart != null) src.loopStart = this.loopStart;
    if (this.loop && this.loopEnd != null) src.loopEnd = this.loopEnd;
    src.playbackRate.value = rate;
    src.connect(this.gain);
    return src;
  }

  private armRegionTimer(remainingSec: number | undefined): void {
    if (this.regionTimer != null) {
      clearTimeout(this.regionTimer);
      this.regionTimer = null;
    }
    if (remainingSec == null) return;
    const ms = Math.max(0, remainingSec * 1000) / Math.max(0.0001, this.basePitch);
    this.regionTimer = setTimeout(() => {
      this.regionTimer = null;
      if (!this.done) this.stop();
    }, ms);
  }

  private bindSourceLifecycle(src: AudioBufferSourceNode, hook: (v: Voice) => void): void {
    src.onended = () => {
      if (this.paused) return;
      if (!src.loop) this.finish('ended', hook);
    };
  }

  /**
   * Begin the loop-crossfade chain. Spawns the first segment immediately at
   * full level, then arms a setTimeout to spawn the next one shortly before
   * the boundary. Each subsequent spawn re-arms its own follow-up.
   *
   * Audio scheduling uses absolute `ctx.currentTime` values so drift between
   * setTimeout (wall clock) and the audio thread doesn't cause click-y
   * misalignment — setTimeout only needs to wake us in time to call
   * `source.start(when, ...)` before `when`.
   */
  private startCrossfadeChain(when: number): AudioBufferSourceNode {
    const first = this.spawnCrossfadeSegment(when, /* fadeIn */ false);
    this.armNextCrossfadeSegment(when);
    return first.source;
  }

  private spawnCrossfadeSegment(
    when: number,
    fadeIn: boolean,
  ): { source: AudioBufferSourceNode; gain: GainNode } {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = false;
    src.playbackRate.value = this.basePitch;

    const segGain = this.ctx.createGain();
    if (fadeIn) {
      segGain.gain.setValueAtTime(0, when);
      segGain.gain.linearRampToValueAtTime(1, when + this.crossfadeSec);
    } else {
      segGain.gain.setValueAtTime(1, when);
    }
    // Ramp out at the segment's tail.
    const fadeOutAt = when + this.crossfadeRegionLen - this.crossfadeSec;
    segGain.gain.setValueAtTime(1, fadeOutAt);
    segGain.gain.linearRampToValueAtTime(0, when + this.crossfadeRegionLen);

    src.connect(segGain).connect(this.gain);
    try {
      // Web Audio honours start(when, offset, duration); the source stops
      // itself at `when + duration / playbackRate` without a setTimeout.
      src.start(when, this.crossfadeRegionStart, this.crossfadeRegionLen);
    } catch {
      /* already started */
    }
    src.onended = () => this.releaseCrossfadeSegment(src, segGain);

    const entry = { source: src, gain: segGain, startTime: when };
    this.crossfadeChain.push(entry);
    return entry;
  }

  private armNextCrossfadeSegment(currentSegmentStart: number): void {
    if (this.crossfadeArmTimer != null) {
      clearTimeout(this.crossfadeArmTimer);
      this.crossfadeArmTimer = null;
    }
    const nextStart = currentSegmentStart + this.crossfadeRegionLen - this.crossfadeSec;
    // Wake ~50 ms before nextStart (relative to wall clock) so we have time
    // to call source.start(nextStart, ...) before the audio thread hits it.
    const SAFETY_LEAD_MS = 50;
    const delayMs = Math.max(0, (nextStart - this.ctx.currentTime) * 1000 - SAFETY_LEAD_MS);
    this.crossfadeArmTimer = setTimeout(() => {
      this.crossfadeArmTimer = null;
      if (this.done || this.stopping || this.paused) return;
      this.spawnCrossfadeSegment(nextStart, /* fadeIn */ true);
      this.armNextCrossfadeSegment(nextStart);
    }, delayMs);
  }

  private releaseCrossfadeSegment(src: AudioBufferSourceNode, gain: GainNode): void {
    const idx = this.crossfadeChain.findIndex((e) => e.source === src);
    if (idx >= 0) this.crossfadeChain.splice(idx, 1);
    try {
      src.disconnect();
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  private get inCrossfadeMode(): boolean {
    return this.crossfadeSec > 0;
  }

  private computeOffset(): number {
    if (this.paused) return this.pausedOffset;
    const elapsed = (this.ctx.currentTime - this.startCtxTime) * this.basePitch;
    let offset = this.currentOffset + elapsed;
    if (this.loop) {
      offset = ((offset % this.buffer.duration) + this.buffer.duration) % this.buffer.duration;
    } else {
      offset = Math.min(offset, this.buffer.duration);
    }
    return offset;
  }
}

function resolveJittered(v: number | { base?: number; jitter?: number }, fallbackBase = 1): number {
  if (typeof v === 'number') return v;
  if (!v) return fallbackBase;
  const center = v.base ?? fallbackBase;
  if (v.jitter == null) return center;
  return center + (Math.random() * 2 - 1) * v.jitter;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
