import { applyRamp } from '../mixer/curve';
import { waitAudio } from '../runtime/wait';
import type { FadeOptions } from '../types';

/**
 * Stream a long media file through HTMLAudioElement → MediaElementAudioSource.
 *
 * Use for music tracks > 30s where decoding the whole file into RAM (the
 * loadSound path) would waste memory and stall on iOS. The element handles
 * progressive download and seek; we just route its output into the engine's
 * bus graph so it picks up the same FX/sidechain as buffer-based voices.
 *
 * Created lazily — the underlying MediaElementAudioSource is only built on
 * first play(), since it can't be reattached to a different bus once created.
 */
export class StreamSound {
  readonly name: string;
  private ctx: AudioContext;
  private url: string;
  private destination: AudioNode;
  private el: HTMLAudioElement | null = null;
  private node: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private disposed = false;

  constructor(name: string, ctx: AudioContext, url: string, destination: AudioNode) {
    this.name = name;
    this.ctx = ctx;
    this.url = url;
    this.destination = destination;
  }

  /** Lazily construct the <audio> element + media-element source on first use. */
  private ensure(): void {
    if (this.el) return;
    if (this.disposed) return;
    if (typeof document === 'undefined' || typeof Audio === 'undefined') {
      // No DOM — Stream is a no-op shell. Tests that don't have happy-dom
      // can still construct/dispose it without errors.
      return;
    }
    const el = new Audio();
    el.src = this.url;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    const create = (
      this.ctx as unknown as {
        createMediaElementSource?: (e: HTMLMediaElement) => MediaElementAudioSourceNode;
      }
    ).createMediaElementSource;
    if (typeof create !== 'function') {
      this.el = el;
      return;
    }
    const node = create.call(this.ctx, el);
    const gain = this.ctx.createGain();
    node.connect(gain);
    gain.connect(this.destination);
    this.el = el;
    this.node = node;
    this.gain = gain;
  }

  async play(options: { volume?: number; loop?: boolean } = {}): Promise<void> {
    this.ensure();
    if (!this.el) return;
    if (this.gain) this.gain.gain.value = clamp01(options.volume ?? 1);
    this.el.loop = options.loop ?? false;
    try {
      await this.el.play();
    } catch {
      /* autoplay rejected; caller can retry from a user gesture */
    }
  }

  pause(): void {
    this.el?.pause();
  }

  stop(): void {
    if (!this.el) return;
    this.el.pause();
    try {
      this.el.currentTime = 0;
    } catch {
      /* element not seekable yet */
    }
  }

  seek(seconds: number): void {
    if (!this.el) return;
    try {
      this.el.currentTime = Math.max(0, seconds);
    } catch {
      /* not seekable yet */
    }
  }

  get currentTime(): number {
    return this.el?.currentTime ?? 0;
  }

  get duration(): number {
    return this.el?.duration ?? 0;
  }

  get paused(): boolean {
    return this.el?.paused ?? true;
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = clamp01(v);
  }

  fade(opts: FadeOptions): Promise<void> {
    if (!this.gain) return Promise.resolve();
    applyRamp(this.gain.gain, this.ctx.currentTime, clamp01(opts.to), opts.duration, opts.curve ?? 'linear');
    return waitAudio(this.ctx, opts.duration);
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.node?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (this.el) {
      this.el.pause();
      this.el.src = '';
    }
    this.el = null;
    this.node = null;
    this.gain = null;
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
