import { applyRamp, equalPowerCurve } from '../mixer/curve';
import type { FadeOptions, MusicPlayOptions, MusicState, SkipToOutroOptions, StopOptions } from '../types';

const DEFAULT_STOP_FADE_SEC = 0.008;
const SKIP_NOW_FADE_SEC = 0.05;

interface MusicBuffers {
  intro?: AudioBuffer;
  loop: AudioBuffer;
  outro?: AudioBuffer;
}

interface MusicDeps {
  ctx: AudioContext;
  buffers: MusicBuffers;
  destination: AudioNode;
  loopCrossfade: number;
  defaultStopFade?: number;
}

/**
 * Stinger → loop → outro music asset. The pattern every casino slot,
 * action game, and rhythm game uses for combat/win/menu music: an intro
 * that plays once, a body that loops cleanly until you ask it to stop,
 * and an outro tail that plays once at the natural loop boundary so the
 * music ends musically instead of cutting off mid-bar.
 *
 * Construct via `engine.loadMusic(name, parts)`; spawn live instances via
 * `music.play()`. Each instance is a `MusicVoice` you can fade, pause,
 * resume, stop, or `skipToOutro()` independently.
 */
export class Music {
  readonly name: string;
  private deps: MusicDeps;
  private live = new Set<MusicVoice>();

  constructor(name: string, deps: MusicDeps) {
    this.name = name;
    this.deps = deps;
  }

  get loopDuration(): number {
    return this.deps.buffers.loop.duration;
  }

  get hasIntro(): boolean {
    return this.deps.buffers.intro != null;
  }

  get hasOutro(): boolean {
    return this.deps.buffers.outro != null;
  }

  play(options: MusicPlayOptions = {}): MusicVoice {
    const voice = new MusicVoice({
      ctx: this.deps.ctx,
      buffers: this.deps.buffers,
      destination: this.deps.destination,
      loopCrossfade: this.deps.loopCrossfade,
      defaultStopFade: this.deps.defaultStopFade,
      options,
    });
    this.live.add(voice);
    void voice.ended.then(() => this.live.delete(voice));
    return voice;
  }

  /** Live playback instances spawned from this asset. */
  voices(): readonly MusicVoice[] {
    return Array.from(this.live);
  }

  /**
   * Stop every live instance. `engine.close()` uses this — without it a
   * music voice kept its source nodes running past the engine that owned
   * them, the way streams used to.
   */
  stopAll(opts: StopOptions = {}): void {
    for (const v of Array.from(this.live)) v.stop(opts);
    this.live.clear();
  }
}

interface MusicVoiceDeps {
  ctx: AudioContext;
  buffers: MusicBuffers;
  destination: AudioNode;
  loopCrossfade: number;
  defaultStopFade?: number;
  options: MusicPlayOptions;
}

/**
 * One live playback instance of a `Music` asset. Tracks which part is
 * currently sounding (`'intro' | 'loop' | 'outro' | 'ended'`), exposes
 * `fade`/`pause`/`resume`/`stop`, and adds two music-specific operations:
 *
 * - `skipToOutro({ at: 'loop-end' })` — wait for the current loop iteration
 *   to complete, then play the outro at the natural loop boundary.
 * - `skipToOutro({ at: 'now' })` — fade the loop out (~50 ms) and start
 *   the outro immediately. Right call for "user pressed Stop."
 *
 * `stop()` is the click-free cut — no outro. Use `skipToOutro` if you want
 * the music to end musically.
 */
export class MusicVoice {
  readonly ended: Promise<void>;

  private ctx: AudioContext;
  private buffers: MusicBuffers;
  private destination: AudioNode;
  private gain: GainNode;
  private state: MusicState = 'intro';
  private done = false;
  private resolveEnded!: () => void;
  private stopFade: number;
  private loopCrossfadeSec: number;

  // Live audio sources + their per-segment gain nodes. The chain is the
  // (1+) loop iterations under crossfade-mode; when crossfade is off this
  // is at most one live loop source.
  private introSource: AudioBufferSourceNode | null = null;
  private outroSource: AudioBufferSourceNode | null = null;
  private loopChain: { source: AudioBufferSourceNode; gain: GainNode; startTime: number }[] = [];
  private loopArmTimer: ReturnType<typeof setTimeout> | null = null;
  private outroTimer: ReturnType<typeof setTimeout> | null = null;
  // Wall-clock anchor for the loop chain — when the next iteration is due
  // to start in audioContext time. Used by skipToOutro({ at: 'loop-end' }).
  private nextLoopBoundaryAt = Number.POSITIVE_INFINITY;

  constructor(deps: MusicVoiceDeps) {
    this.ctx = deps.ctx;
    this.buffers = deps.buffers;
    this.destination = deps.destination;
    this.loopCrossfadeSec = Math.max(0, deps.loopCrossfade);
    this.stopFade = Math.max(0, deps.defaultStopFade ?? DEFAULT_STOP_FADE_SEC);

    this.gain = this.ctx.createGain();
    const initialVolume = clamp01(deps.options.volume ?? 1);
    const fadeIn = Math.max(0, deps.options.fadeIn ?? 0);
    if (fadeIn > 0) {
      this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(initialVolume, this.ctx.currentTime + fadeIn);
    } else {
      this.gain.gain.value = initialVolume;
    }
    this.gain.connect(this.destination);

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    this.start(this.ctx.currentTime);
  }

  /** Currently-sounding part. Transitions automatically as parts hand off. */
  get currentPart(): MusicState {
    return this.state;
  }

  fade(opts: FadeOptions): Promise<void> {
    const param = this.gain.gain;
    const now = this.ctx.currentTime;
    applyRamp(param, now, clamp01(opts.to), opts.duration, opts.curve ?? 'linear');
    return new Promise((res) => setTimeout(res, Math.max(0, opts.duration) * 1000));
  }

  /**
   * Stop the music with the same click-free fade-out semantics as
   * `voice.stop()`. Skips the outro — call `skipToOutro` first if you
   * want the music to end musically.
   */
  stop(opts: StopOptions = {}): void {
    if (this.done) return;
    const fade = Math.max(0, opts.fade ?? this.stopFade);
    this.cancelTimers();

    if (fade === 0) {
      this.stopAllSources(0);
      this.finish();
      return;
    }

    const now = this.ctx.currentTime;
    const stopAt = now + fade;
    try {
      const param = this.gain.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(0, stopAt);
      this.stopAllSources(stopAt);
    } catch {
      this.finish();
      return;
    }
    setTimeout(() => this.finish(), fade * 1000);
  }

  /**
   * Schedule the outro. With `at: 'loop-end'` (default) the outro starts
   * at the next natural loop boundary so the music ends musically. With
   * `at: 'now'` the loop fades out (~50 ms) and the outro starts
   * immediately — useful when responsiveness matters more than musicality
   * (e.g. user pressed Stop).
   *
   * No-op if there is no outro buffer, or if the music is already past
   * the loop part. Calling `skipToOutro` more than once is a no-op too —
   * the first call wins.
   */
  skipToOutro(opts: SkipToOutroOptions = {}): void {
    if (this.done) return;
    if (this.state === 'outro' || this.state === 'ended') return;
    if (!this.buffers.outro) {
      // No outro to schedule — fall through to a clean stop instead so
      // calling code doesn't need to branch on `hasOutro`.
      this.stop();
      return;
    }
    const at = opts.at ?? 'loop-end';
    if (at === 'now') {
      this.skipToOutroNow();
    } else {
      this.skipToOutroAtLoopEnd();
    }
  }

  private start(when: number): void {
    if (this.buffers.intro) {
      this.scheduleIntro(when);
      this.scheduleLoopStart(when + this.buffers.intro.duration);
    } else {
      this.state = 'loop';
      this.scheduleLoopStart(when);
    }
  }

  private scheduleIntro(when: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.intro!;
    src.connect(this.gain);
    src.start(when);
    src.onended = () => {
      // Detach by reference so a stop()-driven onended doesn't double-fire.
      if (this.introSource === src) this.introSource = null;
    };
    this.introSource = src;
  }

  private scheduleLoopStart(when: number): void {
    if (this.done) return;
    const segment = this.spawnLoopSegment(when, /* fadeIn */ false);
    this.nextLoopBoundaryAt = when + this.buffers.loop.duration;

    // When crossfade is on, arm the next segment slightly before the
    // boundary. When it's off, the loop is a single source with native
    // looping — but we still need to flip state from 'intro' to 'loop'
    // at the boundary, so arm a state-flip timer if there's an intro.
    if (this.loopCrossfadeSec > 0 && this.crossfadeViable()) {
      this.armNextLoopSegment(when);
    } else {
      // Single-source native loop path.
      segment.source.loop = true;
      const lr = this.buffers.loop;
      // Loop the entire buffer.
      segment.source.loopStart = 0;
      segment.source.loopEnd = lr.duration;
      // No automatic state transition needed — when intro ends, the
      // loop source is already running. Flip state when the intro's
      // onended fires (covered by introSource.onended above) — but we
      // also need to update state at start time. Safer to set it here.
      if (!this.buffers.intro) this.state = 'loop';
      else {
        // Schedule a state transition right at the boundary.
        const ms = Math.max(0, (when - this.ctx.currentTime) * 1000);
        setTimeout(() => {
          if (!this.done && this.state === 'intro') this.state = 'loop';
        }, ms);
      }
    }
  }

  private spawnLoopSegment(when: number, fadeIn: boolean): { source: AudioBufferSourceNode; gain: GainNode } {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.loop;
    src.loop = false;

    const segGain = this.ctx.createGain();
    if (fadeIn) {
      // Equal-power fade-in (sin) so it sums to constant power against the
      // previous segment's cos fade-out — no ~3 dB dip at the loop seam.
      segGain.gain.setValueAtTime(0, when);
      segGain.gain.setValueCurveAtTime(equalPowerCurve(0, 1), when, this.loopCrossfadeSec);
    } else {
      segGain.gain.setValueAtTime(1, when);
    }
    if (this.crossfadeViable()) {
      // Equal-power fade-out (cos) at the segment's tail so it sits under the
      // next segment's fade-in.
      const fadeOutAt = when + this.buffers.loop.duration - this.loopCrossfadeSec;
      segGain.gain.setValueAtTime(1, fadeOutAt);
      segGain.gain.setValueCurveAtTime(equalPowerCurve(1, 0), fadeOutAt, this.loopCrossfadeSec);
    }
    src.connect(segGain).connect(this.gain);
    try {
      // Crossfade-on path uses an explicit duration so the source ends
      // itself; crossfade-off path uses native looping (handled in
      // scheduleLoopStart by mutating src.loop).
      if (this.crossfadeViable()) {
        src.start(when, 0, this.buffers.loop.duration);
      } else {
        src.start(when);
      }
    } catch {
      /* already started */
    }
    src.onended = () => this.releaseLoopSegment(src, segGain);
    const entry = { source: src, gain: segGain, startTime: when };
    this.loopChain.push(entry);
    return entry;
  }

  private armNextLoopSegment(currentSegmentStart: number): void {
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
    const nextStart = currentSegmentStart + this.buffers.loop.duration - this.loopCrossfadeSec;
    const SAFETY_LEAD_MS = 50;
    const delayMs = Math.max(0, (nextStart - this.ctx.currentTime) * 1000 - SAFETY_LEAD_MS);
    this.loopArmTimer = setTimeout(() => {
      this.loopArmTimer = null;
      if (this.done || (this.state !== 'loop' && this.state !== 'intro')) return;
      // Transition from intro → loop happens at the very first loop spawn.
      this.state = 'loop';
      this.spawnLoopSegment(nextStart, /* fadeIn */ true);
      this.nextLoopBoundaryAt = nextStart + this.buffers.loop.duration;
      this.armNextLoopSegment(nextStart);
    }, delayMs);
  }

  private crossfadeViable(): boolean {
    return this.loopCrossfadeSec > 0 && this.buffers.loop.duration > this.loopCrossfadeSec * 2;
  }

  private releaseLoopSegment(src: AudioBufferSourceNode, gain: GainNode): void {
    const idx = this.loopChain.findIndex((e) => e.source === src);
    if (idx >= 0) this.loopChain.splice(idx, 1);
    try {
      src.disconnect();
      gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  private skipToOutroAtLoopEnd(): void {
    // Disable fresh segment spawns; the next-loop-end timer (or the
    // nextLoopBoundaryAt marker) tells us when to fire the outro.
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
    // If we're still in the intro, schedule the outro at intro-end +
    // (we can't know the loop boundary until the loop has started). The
    // simplest correct behaviour: start outro right after intro ends if
    // the user calls skipToOutro before the loop. Otherwise honour the
    // computed nextLoopBoundaryAt.
    let outroAt: number;
    if (this.state === 'intro') {
      outroAt = this.ctx.currentTime + (this.buffers.intro?.duration ?? 0);
      // Don't start the loop at all — re-anchor.
      this.cancelLoopArm();
    } else {
      outroAt = this.nextLoopBoundaryAt;
    }

    // Tell the in-flight loop segments to stop themselves at outroAt.
    this.stopLoopSourcesAt(outroAt);
    this.scheduleOutro(outroAt);
  }

  private skipToOutroNow(): void {
    this.cancelLoopArm();
    const now = this.ctx.currentTime;
    const fadeEnd = now + SKIP_NOW_FADE_SEC;

    // Fade out everything currently playing on the loop chain.
    for (const entry of this.loopChain) {
      try {
        const param = entry.gain.gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(0, fadeEnd);
      } catch {
        /* */
      }
      try {
        entry.source.stop(fadeEnd);
      } catch {
        /* already stopped */
      }
    }
    if (this.introSource) {
      try {
        this.introSource.stop(fadeEnd);
      } catch {
        /* */
      }
    }
    this.scheduleOutro(fadeEnd);
  }

  private cancelLoopArm(): void {
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
  }

  private stopLoopSourcesAt(when: number): void {
    for (const entry of this.loopChain) {
      try {
        entry.source.stop(when);
      } catch {
        /* */
      }
    }
  }

  private scheduleOutro(when: number): void {
    const buf = this.buffers.outro;
    if (!buf) {
      // Without an outro the music is effectively "ending now"; finish
      // when the scheduled time arrives.
      const ms = Math.max(0, (when - this.ctx.currentTime) * 1000);
      this.outroTimer = setTimeout(() => this.finish(), ms);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    try {
      src.start(when);
    } catch {
      /* already started */
    }
    src.onended = () => {
      if (this.outroSource === src) this.outroSource = null;
      this.finish();
    };
    this.outroSource = src;
    // Flip state at the outro's start, not at scheduling time.
    const ms = Math.max(0, (when - this.ctx.currentTime) * 1000);
    this.outroTimer = setTimeout(() => {
      this.outroTimer = null;
      if (!this.done) this.state = 'outro';
    }, ms);
  }

  private cancelTimers(): void {
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
    if (this.outroTimer != null) {
      clearTimeout(this.outroTimer);
      this.outroTimer = null;
    }
  }

  private stopAllSources(when: number): void {
    const sources: AudioBufferSourceNode[] = [];
    if (this.introSource) sources.push(this.introSource);
    for (const e of this.loopChain) sources.push(e.source);
    if (this.outroSource) sources.push(this.outroSource);
    for (const src of sources) {
      try {
        src.onended = null;
        if (when === 0) src.stop();
        else src.stop(when);
      } catch {
        /* */
      }
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.state = 'ended';
    this.cancelTimers();
    try {
      if (this.introSource) this.introSource.disconnect();
      for (const e of this.loopChain) {
        e.source.disconnect();
        e.gain.disconnect();
      }
      if (this.outroSource) this.outroSource.disconnect();
      this.gain.disconnect();
    } catch {
      /* */
    }
    this.introSource = null;
    this.outroSource = null;
    this.loopChain = [];
    this.resolveEnded();
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
