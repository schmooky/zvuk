import { applyRamp, scheduleSegmentEnvelope } from '../mixer/curve';
import { afterAudio, waitAudio } from '../runtime/wait';
import type { Spatializer } from '../spatial/spatializer';
import type { AudioLevel, FadeOptions, PlayOptions, StopOptions } from '../types';

/** Lifecycle cues a voice emits on `voice.cues()`. */
export type VoiceCue = 'started' | 'paused' | 'resumed' | 'ended';

const DEFAULT_STOP_FADE_SEC = 0.008;
/** Shortest crossfade a rate change re-seams the loop with. */
const RESEAM_SEC = 0.03;

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
  /**
   * A concurrency limit refused this voice. It is built already finished:
   * no source node starts, no `started` cue fires, `ended` is resolved.
   */
  rejected?: boolean;
}

interface CrossfadeSegment {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Audio time the segment starts sounding. */
  startTime: number;
  /** Offset into the loop region (buffer seconds) the segment starts from. */
  offset: number;
  /** Playback rate the segment was started at. */
  rate: number;
  /** Crossfade window this segment fades out over (output seconds). */
  xf: number;
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
  /**
   * Audio time the voice starts (or started) sounding. Equal to the time of
   * the `play()` call unless `play({ at })` scheduled it later.
   */
  readonly startedAt: number;
  /** Name of the Sound that spawned this voice (if any). Used for crossfade. */
  readonly sourceName: string | undefined;
  /**
   * True when a concurrency limit or cooldown refused this voice. A rejected
   * voice never made a sound; every method on it is a no-op.
   */
  readonly rejected: boolean;

  /** Resolves when playback finishes (natural end, stop(), or abort). */
  readonly ended: Promise<void>;

  private ctx: AudioContext;
  private gain!: GainNode;
  private source!: AudioBufferSourceNode;
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
  // Cancel handle for the region bound. Audio-clock driven, not wall-clock:
  // the engine parks its context on every tab hide, and a region that still
  // has audio owed must not be cut because wall time went by while it was
  // frozen.
  private regionTimer: (() => void) | null = null;
  // Fires the `started` cue at a scheduled start.
  private startTimer: (() => void) | null = null;
  private stopFade: number;
  private signal: AbortSignal | undefined;
  private onAbort: (() => void) | null = null;
  // Loop-crossfade state. Inactive when crossfadeSec === 0.
  // In crossfade mode, `source` is the most-recently-armed segment and the
  // `crossfadeChain` carries every segment currently scheduled or live so
  // that stop/pause/setPlaybackRate can fan out across them.
  private crossfadeSec = 0;
  private crossfadeRegionStart = 0;
  private crossfadeRegionLen = 0;
  private crossfadeChain: CrossfadeSegment[] = [];
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
    const now = ctx.currentTime;
    const at = options.at;
    const startAt = at != null && Number.isFinite(at) && at > now ? at : now;
    this.startedAt = startAt;
    this.startCtxTime = startAt;
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
    this.rejected = deps.rejected === true;

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    if (this.rejected) {
      this.done = true;
      this.resolveEnded();
      return;
    }

    this.gain = ctx.createGain();
    const initialVolume = clamp01(resolveJittered(options.volume ?? 1));
    const fadeIn = Math.max(0, options.fadeIn ?? 0);
    if (fadeIn > 0) {
      // Ramp 0 → target volume over `fadeIn` seconds from the start time.
      // Mirror MusicVoice semantics so the convenience reads identically.
      this.gain.gain.setValueAtTime(0, startAt);
      this.gain.gain.linearRampToValueAtTime(initialVolume, startAt + fadeIn);
    } else {
      this.gain.gain.value = initialVolume;
    }
    this.gain.connect(destination);

    if (options.signal) {
      if (options.signal.aborted) {
        // Defer so callers can attach .ended before we resolve.
        queueMicrotask(() => this.stop());
      } else {
        // Kept so finish() can take it off again: a long-lived scene signal
        // used to hold every voice it ever touched until it aborted.
        this.signal = options.signal;
        this.onAbort = () => this.stop();
        options.signal.addEventListener('abort', this.onAbort, { once: true });
      }
    }

    if (this.shouldUseLoopCrossfade(options)) {
      this.crossfadeSec = options.loopCrossfade!;
      this.crossfadeRegionStart = options.loopStart ?? this.startOffset;
      const regionEnd = options.loopEnd ?? buffer.duration;
      this.crossfadeRegionLen = Math.max(0, regionEnd - this.crossfadeRegionStart);
      // Spawn the first segment + arm the chain. `source` is set inside.
      this.source = this.startCrossfadeChain(startAt, 0);
    } else {
      this.source = this.createSourceNode(this.basePitch);
      this.bindSourceLifecycle(this.source, () => {});
      try {
        this.source.start(startAt, this.startOffset);
      } catch {
        /* already started */
      }
      this.armRegionTimer(this.regionDuration, startAt - now);
    }

    if (startAt > now) {
      this.startTimer = afterAudio(ctx, startAt - now, () => {
        this.startTimer = null;
        if (!this.done) this.emit('started');
      });
    } else {
      queueMicrotask(() => this.emit('started'));
    }
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
    // A fade during a stop would override the ramp to zero, so the source is
    // cut at whatever level the fade had reached — a click, which is what the
    // stop ramp exists to prevent.
    if (this.done || this.stopping) return Promise.resolve();
    const param = this.gain.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, clamp01(opts.to), opts.duration, opts.curve ?? 'linear');
    // Resolves on the audio clock, and early if the voice finishes first —
    // a voice stopped mid-fade shouldn't report for the full duration.
    return waitAudio(this.ctx, opts.duration, this.ended);
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

    this.clearArmTimer();

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
      this.regionTimer();
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

    // On the audio clock: a suspended context freezes the ramp we just
    // scheduled, and tearing the graph down over a fade that never ran breaks
    // the promise `ended` makes about resolving after it completes.
    afterAudio(this.ctx, fade, () => this.finish('ended'));
  }

  private activeSources(): AudioBufferSourceNode[] {
    if (this.inCrossfadeMode) return this.crossfadeChain.map((e) => e.source);
    return this.source ? [this.source] : [];
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
      this.regionTimer();
      this.regionTimer = null;
    }
    this.clearArmTimer();
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
    if (this.inCrossfadeMode) {
      for (const e of this.crossfadeChain) safeDisconnect(e.gain);
      this.crossfadeChain = [];
    }
    this.emit('paused');
  }

  /** Resume from the offset captured on pause(). No-op when not paused. */
  resume(): void {
    if (this.done || !this.paused) return;
    this.paused = false;
    this.startCtxTime = this.ctx.currentTime;
    if (this.inCrossfadeMode) {
      // Pick the loop back up mid-segment, where pause() left it.
      const regionOffset = this.pausedOffset - this.crossfadeRegionStart;
      this.source = this.startCrossfadeChain(this.startCtxTime, regionOffset);
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

  /** True once the voice has finished (or was rejected). */
  get isDone(): boolean {
    return this.done;
  }

  /**
   * Live playback-rate setter. Optional ramp via curve.
   * Setting while paused only updates the value used on the next start.
   *
   * A voice in `loopCrossfade` mode re-seams its loop at the new rate with a
   * short equal-power crossfade, because every seam of the chain is stamped
   * against the rate the segment started at. `duration` is ignored there.
   */
  setPlaybackRate(rate: number, opts: { duration?: number; curve?: FadeOptions['curve'] } = {}): void {
    if (this.done) return;
    const r = Math.max(0, rate);
    const duration = Math.max(0, opts.duration ?? 0);
    if (this.paused) {
      this.basePitch = r;
      return;
    }
    if (this.inCrossfadeMode) {
      if (r === this.basePitch || this.stopping) {
        this.basePitch = r;
        return;
      }
      this.reseamCrossfade(r);
      return;
    }
    // Snapshot offset at the previous rate before we change it.
    this.currentOffset = this.computeOffset();
    this.startCtxTime = Math.max(this.ctx.currentTime, this.startCtxTime);
    this.basePitch = r;
    // The region timer is sized against the old rate. Half speed means twice
    // the time, so re-arm it from what's left of the region rather than
    // cutting the voice off at the original moment.
    if (this.regionTimer != null && this.regionDuration != null) {
      const consumed = Math.max(0, this.currentOffset - this.startOffset);
      this.armRegionTimer(
        Math.max(0, this.regionDuration - consumed),
        this.startCtxTime - this.ctx.currentTime,
      );
    }
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

  /**
   * Cheap loudness proxy for voice stealing, in [0..1].
   *
   * `level()` allocates an AnalyserNode and keeps it for the voice's
   * lifetime, so using it to rank 64 candidates left 64 permanent analysers
   * on the graph — and a freshly created analyser reads silence anyway,
   * because its buffer hasn't filled yet. Reuse a tap that already exists;
   * otherwise read the voice's own gain, which costs nothing.
   *
   * @internal
   */
  levelHint(): number {
    if (this.done) return 0;
    if (this.levelAnalyser) return this.level().rms;
    return this.gain.gain.value;
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
      this.regionTimer();
      this.regionTimer = null;
    }
    if (this.startTimer != null) {
      this.startTimer();
      this.startTimer = null;
    }
    this.clearArmTimer();
    if (this.signal && this.onAbort) this.signal.removeEventListener('abort', this.onAbort);
    this.signal = undefined;
    this.onAbort = null;
    for (const src of this.activeSources()) safeDisconnect(src);
    for (const e of this.crossfadeChain) safeDisconnect(e.gain);
    if (this.levelAnalyser) safeDisconnect(this.levelAnalyser);
    safeDisconnect(this.gain);
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

  private clearArmTimer(): void {
    if (this.crossfadeArmTimer != null) {
      clearTimeout(this.crossfadeArmTimer);
      this.crossfadeArmTimer = null;
    }
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

  /**
   * Arm the region bound. `remainingSec` is in buffer seconds; `leadSec` is
   * output time before the region starts counting (a scheduled start).
   */
  private armRegionTimer(remainingSec: number | undefined, leadSec = 0): void {
    if (this.regionTimer != null) {
      this.regionTimer();
      this.regionTimer = null;
    }
    if (remainingSec == null) return;
    // A looping voice is already bounded by the source node's own
    // loopStart/loopEnd. Stopping it after one region length would make
    // SpriteRegion.loop mean "play once".
    if (this.loop) return;
    const seconds = Math.max(0, leadSec) + Math.max(0, remainingSec) / Math.max(0.0001, this.basePitch);
    this.regionTimer = afterAudio(this.ctx, seconds, () => {
      this.regionTimer = null;
      if (!this.done) this.stop();
    });
  }

  private bindSourceLifecycle(src: AudioBufferSourceNode, hook: (v: Voice) => void): void {
    src.onended = () => {
      if (this.paused) return;
      if (!src.loop) this.finish('ended', hook);
    };
  }

  /**
   * Begin the loop-crossfade chain at `regionOffset` into the loop region.
   * Spawns the first segment immediately at full level, then arms a
   * setTimeout to spawn the next one shortly before the boundary. Each
   * subsequent spawn re-arms its own follow-up.
   *
   * Audio scheduling uses absolute `ctx.currentTime` values so drift between
   * setTimeout (wall clock) and the audio thread doesn't cause click-y
   * misalignment — setTimeout only needs to wake us in time to call
   * `source.start(when, ...)` before `when`.
   */
  private startCrossfadeChain(when: number, regionOffset: number, fadeInSec?: number): AudioBufferSourceNode {
    let offset = Math.max(0, regionOffset);
    // Too little of the segment left to fade out of: start the next lap.
    const rate = Math.max(0.0001, this.basePitch);
    if ((this.crossfadeRegionLen - offset) / rate <= this.segmentXf(rate) * 2) offset = 0;
    const first = this.spawnCrossfadeSegment(when, fadeInSec != null, offset, fadeInSec);
    this.armNextCrossfadeSegment(first);
    return first.source;
  }

  /**
   * Crossfade window for a segment at `rate`, in output seconds. At high
   * pitch a region can be shorter than two windows of output; the window
   * shrinks with it instead of letting the two legs overlap.
   */
  private segmentXf(rate: number): number {
    return Math.min(this.crossfadeSec, this.crossfadeRegionLen / rate / 2.5);
  }

  private spawnCrossfadeSegment(
    when: number,
    fadeIn: boolean,
    offset: number,
    fadeInSec?: number,
  ): CrossfadeSegment {
    // `when` is a deadline, not a guarantee. A stalled main thread (a lazily
    // loaded bundle, a texture upload, any long task) or a hidden tab's
    // throttled timers can wake the arm timer well after it has passed, and
    // both Chromium and WebKit clamp past-dated automation up to the current
    // time — which collapses the segment's two envelope legs onto the same
    // instant and gets the second one refused with NotSupportedError. Rebase
    // the whole segment onto the clock so every stamp is still ahead of it.
    const now = this.ctx.currentTime;
    const start = Math.max(when, now);
    const rate = Math.max(0.0001, this.basePitch);
    const xf = this.segmentXf(rate);
    const inSec = fadeInSec ?? xf;
    // Past a full crossfade window there is nothing left to fade against —
    // the previous segment has already gone silent. Coming in at full level
    // keeps the audible gap no longer than the stall itself made it.
    const rampIn = fadeIn && now - when < inSec;

    // The source plays `lenBuf` buffer seconds, which take `lenBuf / rate`
    // seconds of output. Every stamp below is output time: sizing the
    // envelope and the next seam in buffer seconds left a gap of half the
    // region on every lap at pitch 2.
    const lenBuf = Math.max(0, this.crossfadeRegionLen - offset);
    const segOut = lenBuf / rate;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = false;
    src.playbackRate.value = rate;

    const segGain = this.ctx.createGain();
    scheduleSegmentEnvelope(segGain.gain, start, segOut, xf, {
      fadeIn: rampIn,
      fadeOut: segOut - (rampIn ? inSec : 0) > xf,
      fadeInSec: inSec,
    });

    src.connect(segGain).connect(this.gain);
    try {
      // Web Audio honours start(when, offset, duration); the source stops
      // itself at `start + duration / playbackRate` without a setTimeout.
      src.start(start, this.crossfadeRegionStart + offset, lenBuf);
    } catch {
      /* already started */
    }
    src.onended = () => this.releaseCrossfadeSegment(src, segGain);

    const entry: CrossfadeSegment = { source: src, gain: segGain, startTime: start, offset, rate, xf };
    this.crossfadeChain.push(entry);
    return entry;
  }

  private armNextCrossfadeSegment(current: CrossfadeSegment): void {
    this.clearArmTimer();
    const nextStart =
      current.startTime + (this.crossfadeRegionLen - current.offset) / current.rate - current.xf;
    // Wake ~50 ms before nextStart (relative to wall clock) so we have time
    // to call source.start(nextStart, ...) before the audio thread hits it.
    const SAFETY_LEAD_MS = 50;
    const delayMs = Math.max(0, (nextStart - this.ctx.currentTime) * 1000 - SAFETY_LEAD_MS);
    this.crossfadeArmTimer = setTimeout(() => {
      this.crossfadeArmTimer = null;
      if (this.done || this.stopping || this.paused) return;
      // Chain off where the segment actually landed. A late wake-up rebases
      // it onto the clock, and arming from the deadline we missed instead
      // would leave every following wake-up late too — a catch-up burst
      // stacking several segments onto the same instant.
      let next: CrossfadeSegment | null = null;
      try {
        next = this.spawnCrossfadeSegment(nextStart, /* fadeIn */ true, 0, current.xf);
        this.source = next.source;
      } finally {
        // Re-arm whatever happened above. An exception escaping this
        // callback used to end the chain for good: the voice fell silent
        // and stayed that way until something replaced it.
        this.armNextCrossfadeSegment(
          next ?? { ...current, startTime: nextStart, offset: 0, rate: Math.max(0.0001, this.basePitch) },
        );
      }
    }, delayMs);
  }

  /**
   * Move a crossfading loop to a new rate: fade the live segments out over
   * a short window and start a fresh chain at the new rate from the same
   * position, fading in over that window.
   */
  private reseamCrossfade(rate: number): void {
    const now = this.ctx.currentTime;
    const regionOffset = this.computeOffset() - this.crossfadeRegionStart;
    this.clearArmTimer();
    const seam = Math.min(RESEAM_SEC, this.crossfadeSec);
    for (const e of this.crossfadeChain) {
      applyRamp(e.gain.gain, now, 0, seam, 'linear');
      try {
        e.source.stop(now + seam);
      } catch {
        /* already stopped */
      }
    }
    this.basePitch = rate;
    this.source = this.startCrossfadeChain(now, regionOffset, seam);
  }

  private releaseCrossfadeSegment(src: AudioBufferSourceNode, gain: GainNode): void {
    const idx = this.crossfadeChain.findIndex((e) => e.source === src);
    if (idx >= 0) this.crossfadeChain.splice(idx, 1);
    safeDisconnect(src);
    safeDisconnect(gain);
  }

  private get inCrossfadeMode(): boolean {
    return this.crossfadeSec > 0;
  }

  /** Playback position in buffer seconds. */
  private computeOffset(): number {
    if (this.paused) return this.pausedOffset;
    const now = this.ctx.currentTime;
    if (this.inCrossfadeMode) {
      // The newest segment that has started is the one ahead in the mix.
      let seg: CrossfadeSegment | null = null;
      for (const e of this.crossfadeChain) {
        if (e.startTime <= now && (!seg || e.startTime > seg.startTime)) seg = e;
      }
      if (!seg) return this.crossfadeRegionStart + (this.crossfadeChain[0]?.offset ?? 0);
      const into = seg.offset + (now - seg.startTime) * seg.rate;
      return this.crossfadeRegionStart + Math.min(this.crossfadeRegionLen, Math.max(0, into));
    }
    const elapsed = Math.max(0, now - this.startCtxTime) * this.basePitch;
    const pos = this.currentOffset + elapsed;
    if (!this.loop) return Math.min(pos, this.buffer.duration);
    // Native looping plays on from the start offset, then wraps inside
    // [loopStart, loopEnd). Wrapping by the buffer length put a resumed
    // sprite region somewhere outside its own region.
    const ls = this.loopStart ?? 0;
    const le = this.loopEnd != null && this.loopEnd > ls ? this.loopEnd : this.buffer.duration;
    const len = le - ls;
    if (len <= 0 || pos < le) return pos;
    return ls + ((pos - ls) % len);
  }
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    /* already gone */
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
