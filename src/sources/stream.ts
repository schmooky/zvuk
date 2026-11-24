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
  private urls: string[];
  private urlIndex = 0;
  private destination: AudioNode;
  private el: HTMLAudioElement | null = null;
  private node: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private disposed = false;
  private wantPlaying = false;
  private resolveEnded: (() => void) | null = null;
  private _ended: Promise<void> = Promise.resolve();

  /**
   * `urls` is a codec ladder in preference order. When the element reports
   * a media error on one, the next is tried, and playback resumes if it was
   * playing.
   */
  constructor(name: string, ctx: AudioContext, urls: string | readonly string[], destination: AudioNode) {
    this.name = name;
    this.ctx = ctx;
    this.urls = typeof urls === 'string' ? [urls] : [...urls];
    if (this.urls.length === 0) throw new Error(`Stream "${name}" needs at least one URL`);
    this.destination = destination;
  }

  /** The URL the element is using now. */
  get url(): string {
    return this.urls[this.urlIndex]!;
  }

  /**
   * Resolves when the current playback ends: the media reached its end
   * (never, while `loop` is on), `stop()` ran, or the stream was disposed.
   * Each `play()` from a stopped state starts a new one.
   */
  get ended(): Promise<void> {
    return this._ended;
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
    el.addEventListener('ended', () => this.settleEnded());
    el.addEventListener('error', () => this.handleError());
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

  /**
   * Start or resume playback. Resolves `true` once the element is playing,
   * `false` when the browser refused (autoplay policy before a user gesture,
   * or no playable source). v1 resolved `void` either way, so a blocked play
   * was indistinguishable from a working one; retry from a gesture handler
   * on `false`.
   */
  async play(options: { volume?: number; loop?: boolean } = {}): Promise<boolean> {
    this.ensure();
    if (!this.el) return false;
    if (this.gain) this.gain.gain.value = clamp01(options.volume ?? 1);
    this.el.loop = options.loop ?? false;
    if (!this.resolveEnded) {
      this._ended = new Promise<void>((r) => {
        this.resolveEnded = r;
      });
    }
    this.wantPlaying = true;
    try {
      await this.el.play();
      return true;
    } catch {
      this.wantPlaying = false;
      return false;
    }
  }

  pause(): void {
    this.wantPlaying = false;
    this.el?.pause();
  }

  stop(): void {
    this.wantPlaying = false;
    this.settleEnded();
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

  private settleEnded(): void {
    const r = this.resolveEnded;
    this.resolveEnded = null;
    r?.();
  }

  /** Move to the next URL of the ladder on a media error. */
  private handleError(): void {
    const el = this.el;
    if (!el || this.disposed) return;
    if (this.urlIndex >= this.urls.length - 1) {
      // Out of fallbacks: nothing will play, so nothing will end either.
      this.wantPlaying = false;
      this.settleEnded();
      return;
    }
    this.urlIndex++;
    el.src = this.url;
    if (this.wantPlaying) void el.play().catch(() => void 0);
  }

  dispose(): void {
    this.disposed = true;
    this.wantPlaying = false;
    this.settleEnded();
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
