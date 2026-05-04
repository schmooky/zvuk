import { applyRamp } from '../mixer/curve';
import type { Spatializer } from '../spatial/spatializer';
import type { FadeOptions, PlayOptions } from '../types';

type VoiceCue = 'started' | 'paused' | 'resumed' | 'ended';

interface VoiceDeps {
  ctx: AudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  options: PlayOptions;
  onEnded: (v: Voice) => void;
  spatializer?: Spatializer;
  sourceName?: string;
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

    this.gain = ctx.createGain();
    const initialVolume = resolveJittered(options.volume ?? 1);
    this.gain.gain.value = clamp01(initialVolume);
    this.gain.connect(destination);

    this.source = this.createSourceNode(this.basePitch);
    this.startCtxTime = ctx.currentTime;

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    // No-op hook: deps.onEnded fires once via the .ended.then below (covers stop/abort/region too).
    this.bindSourceLifecycle(this.source, () => {});

    if (options.signal) {
      if (options.signal.aborted) {
        // Defer so callers can attach .ended before we resolve.
        queueMicrotask(() => this.stop());
      } else {
        options.signal.addEventListener('abort', () => this.stop(), { once: true });
      }
    }

    try {
      this.source.start(0, this.startOffset);
    } catch {
      /* already started */
    }
    this.armRegionTimer(this.regionDuration);
    queueMicrotask(() => this.emit('started'));
    // Hook end notification for the parent.
    void this.ended.then(() => deps.onEnded(this));
  }

  fade(opts: FadeOptions): Promise<void> {
    const param = this.gain.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, clamp01(opts.to), opts.ms, opts.curve ?? 'linear');
    return new Promise((res) => setTimeout(res, Math.max(0, opts.ms)));
  }

  stop(): void {
    if (this.done) return;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.finish('ended');
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
    try {
      this.source.onended = null;
      this.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.source.disconnect();
    } catch {
      /* already disconnected */
    }
    this.emit('paused');
  }

  /** Resume from the offset captured on pause(). No-op when not paused. */
  resume(): void {
    if (this.done || !this.paused) return;
    this.paused = false;
    this.source = this.createSourceNode(this.basePitch);
    this.bindSourceLifecycle(this.source, () => {});
    this.startCtxTime = this.ctx.currentTime;
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
  setPlaybackRate(rate: number, opts: { ms?: number; curve?: FadeOptions['curve'] } = {}): void {
    if (this.done) return;
    const r = Math.max(0, rate);
    const ms = Math.max(0, opts.ms ?? 0);
    if (!this.paused) {
      // Snapshot offset at the previous rate before we change it.
      this.currentOffset = this.computeOffset();
      this.startCtxTime = this.ctx.currentTime;
    }
    this.basePitch = r;
    if (this.paused) return;
    const param = this.source.playbackRate;
    if (ms === 0) {
      param.value = r;
      return;
    }
    applyRamp(param, this.ctx.currentTime, r, ms, opts.curve ?? 'linear');
  }

  get playbackRate(): number {
    return this.basePitch;
  }

  /** The Spatializer attached to this voice (if any). Use for live setPan/setPosition. */
  get spatializer(): Spatializer | undefined {
    return this._spatializer;
  }

  /** Async iterator of lifecycle cues — yields started, optional paused, ended. */
  async *cues(): AsyncIterableIterator<VoiceCue> {
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
        if (this.done) return;
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
    try {
      this.source.disconnect();
      this.gain.disconnect();
    } catch {
      /* already gone */
    }
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

function resolveJittered(v: number | { jitter?: number }, base = 1): number {
  if (typeof v === 'number') return v;
  if (!v || v.jitter == null) return base;
  const j = v.jitter;
  return base + (Math.random() * 2 - 1) * j;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
