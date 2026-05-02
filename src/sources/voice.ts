import type { FadeOptions, PlayOptions } from '../types';
import { applyRamp } from '../mixer/curve';

type VoiceCue = 'started' | 'paused' | 'ended';

interface VoiceDeps {
  ctx: AudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  options: PlayOptions;
  onEnded: (v: Voice) => void;
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

  /** Resolves when playback finishes (natural end, stop(), or abort). */
  readonly ended: Promise<void>;

  private ctx: AudioContext;
  private gain: GainNode;
  private source: AudioBufferSourceNode;
  private done = false;
  private resolveEnded!: () => void;
  private cueListeners = new Set<(c: VoiceCue) => void>();

  static nextId = 1;

  constructor(deps: VoiceDeps) {
    const { ctx, buffer, destination, options } = deps;
    this.id = Voice.nextId++;
    this.ctx = ctx;
    this.priority = options.priority ?? 0;
    this.bus = options.bus;
    this.startedAt = ctx.currentTime;

    this.gain = ctx.createGain();
    const initialVolume = resolveJittered(options.volume ?? 1);
    this.gain.gain.value = clamp01(initialVolume);
    this.gain.connect(destination);

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = options.loop ?? false;
    this.source.playbackRate.value = resolveJittered(options.pitch ?? 1, 1);
    this.source.connect(this.gain);

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    this.source.onended = () => {
      if (!this.source.loop) this.finish('ended', deps.onEnded);
    };

    if (options.signal) {
      if (options.signal.aborted) {
        // Defer so callers can attach .ended before we resolve.
        queueMicrotask(() => this.stop());
      } else {
        options.signal.addEventListener('abort', () => this.stop(), { once: true });
      }
    }

    try {
      this.source.start(0);
    } catch {
      /* already started */
    }
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
    this.cueListeners.forEach((fn) => fn(c));
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
