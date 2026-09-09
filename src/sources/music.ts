import { applyRamp, scheduleSegmentEnvelope } from '../mixer/curve';
import { afterAudio, waitAudio } from '../runtime/wait';
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
  // Cancel handle for the outro handover. Audio-clock driven — see afterAudio.
  private outroTimer: (() => void) | null = null;
  // Audio time the next crossfade segment is due to start. The chain re-anchors
  // it on every spawn, so it only means anything on the crossfade path — the
  // native-loop path has no chain to re-anchor it and reads the boundary off
  // `loopAnchorAt` instead. Both go through nextLoopBoundary().
  private nextLoopBoundaryAt = Number.POSITIVE_INFINITY;
  // Audio time the loop part starts. On the native-loop path one source loops
  // itself forever from here, so every boundary is a whole number of loop
  // durations past it.
  private loopAnchorAt = Number.POSITIVE_INFINITY;
  // Audio time the intro is scheduled to finish, or -Infinity when there is
  // no intro. Not the same as "an intro duration from now" once playback has
  // started, which is what skipToOutro used to assume.
  private introEndsAt = Number.NEGATIVE_INFINITY;

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
    return waitAudio(this.ctx, opts.duration, this.ended);
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
    // On the audio clock: a suspended context freezes the ramp we just
    // scheduled, and tearing the graph down over a fade that never ran
    // resolves `ended` on audio that is still owed.
    afterAudio(this.ctx, fade, () => this.finish());
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
    try {
      src.start(when);
    } catch {
      /* already started */
    }
    this.introEndsAt = when + this.buffers.intro!.duration;
    src.onended = () => {
      // Detach by reference so a stop()-driven onended doesn't double-fire.
      if (this.introSource === src) this.introSource = null;
    };
    this.introSource = src;
  }

  private scheduleLoopStart(when: number): void {
    if (this.done) return;
    const segment = this.spawnLoopSegment(when, /* fadeIn */ false);
    // Chain off where the segment actually landed, not the deadline we asked
    // for — see spawnLoopSegment on why the two can differ.
    const startedAt = segment.startTime;
    this.loopAnchorAt = startedAt;
    this.nextLoopBoundaryAt = startedAt + this.buffers.loop.duration;

    // When crossfade is on, arm the next segment slightly before the
    // boundary. When it's off, the loop is a single source with native
    // looping — but we still need to flip state from 'intro' to 'loop'
    // at the boundary, so arm a state-flip timer if there's an intro.
    if (this.loopCrossfadeSec > 0 && this.crossfadeViable()) {
      this.armNextLoopSegment(startedAt);
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
        // Flip state at the boundary — on the audio clock, so a tab hide
        // during the intro doesn't report the loop as playing early.
        afterAudio(this.ctx, startedAt - this.ctx.currentTime, () => {
          if (!this.done && this.state === 'intro') this.state = 'loop';
        });
      }
    }
  }

  private spawnLoopSegment(
    when: number,
    fadeIn: boolean,
  ): { source: AudioBufferSourceNode; gain: GainNode; startTime: number } {
    // `when` is a deadline, not a guarantee. A stalled main thread or a hidden
    // tab's throttled timers can wake the arm timer well after it has passed,
    // and both Chromium and WebKit clamp past-dated automation up to the
    // current time — which collapses the segment's two envelope legs onto the
    // same instant and gets the second one refused with NotSupportedError.
    // Rebase the segment onto the clock so every stamp is still ahead of it.
    const now = this.ctx.currentTime;
    const start = Math.max(when, now);
    // Past a full crossfade window there is nothing left to fade against —
    // the previous segment has already gone silent. Coming in at full level
    // keeps the audible gap no longer than the stall itself made it.
    const rampIn = fadeIn && now - when < this.loopCrossfadeSec;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.loop;
    src.loop = false;

    const segGain = this.ctx.createGain();
    scheduleSegmentEnvelope(segGain.gain, start, this.buffers.loop.duration, this.loopCrossfadeSec, {
      fadeIn: rampIn,
      fadeOut: this.crossfadeViable(),
    });
    src.connect(segGain).connect(this.gain);
    try {
      // Crossfade-on path uses an explicit duration so the source ends
      // itself; crossfade-off path uses native looping (handled in
      // scheduleLoopStart by mutating src.loop).
      if (this.crossfadeViable()) {
        src.start(start, 0, this.buffers.loop.duration);
      } else {
        src.start(start);
      }
    } catch {
      /* already started */
    }
    src.onended = () => this.releaseLoopSegment(src, segGain);
    const entry = { source: src, gain: segGain, startTime: start };
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
      // Chain off where the segment actually landed. A late wake-up rebases
      // it onto the clock, and arming from the deadline we missed instead
      // would leave every following wake-up late too — a catch-up burst
      // stacking several segments onto the same instant.
      let startedAt = nextStart;
      try {
        startedAt = this.spawnLoopSegment(nextStart, /* fadeIn */ true).startTime;
      } finally {
        // Re-arm whatever happened above. An exception escaping this
        // callback used to end the loop for good: the music fell silent and
        // stayed that way.
        this.nextLoopBoundaryAt = startedAt + this.buffers.loop.duration;
        this.armNextLoopSegment(startedAt);
      }
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

  /**
   * Audio time of the next natural loop boundary.
   *
   * Under crossfade the chain re-anchors `nextLoopBoundaryAt` every time it
   * spawns a segment, so that marker is current by construction. The
   * native-loop path has no chain — one source loops itself for the whole
   * playback — so its boundaries are a grid off the loop's start, and the
   * answer has to be computed against the clock each time it's asked for.
   * Reading a marker that was written once, at the first boundary, is how
   * `skipToOutro({ at: 'loop-end' })` came to fire instantly on every
   * iteration but the first.
   */
  private nextLoopBoundary(): number {
    if (this.crossfadeViable()) return this.nextLoopBoundaryAt;
    if (!Number.isFinite(this.loopAnchorAt)) return this.loopAnchorAt;
    const elapsed = this.ctx.currentTime - this.loopAnchorAt;
    const dur = this.buffers.loop.duration;
    if (elapsed < 0 || dur <= 0) return this.loopAnchorAt;
    // Strictly the next one: landing on the boundary we are already standing
    // on would schedule the outro into the past.
    return this.loopAnchorAt + (Math.floor(elapsed / dur) + 1) * dur;
  }

  private skipToOutroAtLoopEnd(): void {
    // Disable fresh segment spawns; the boundary computed below tells us when
    // to fire the outro.
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
    // Still in the intro? There is no loop boundary yet, so the outro takes
    // over the moment the intro finishes — at the intro's own scheduled end,
    // not an intro length from now, which would leave a hole as wide as the
    // part of the intro that has already played.
    let outroAt: number;
    if (this.state === 'intro') {
      outroAt = this.introEndsAt;
      // Don't start the loop at all — re-anchor.
      this.cancelLoopArm();
    } else {
      outroAt = this.nextLoopBoundary();
    }

    // A boundary can still be behind us: the main thread may have stalled
    // through it, or the state may not have caught up with the audio thread.
    // Stamping the outro in the past gets clamped to the current time anyway,
    // and drags the loop's stop() along with it — so ask for "now" plainly
    // rather than for a time we know has gone.
    outroAt = Math.max(outroAt, this.ctx.currentTime);

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
      this.outroTimer = afterAudio(this.ctx, when - this.ctx.currentTime, () => this.finish());
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
    this.outroTimer = afterAudio(this.ctx, when - this.ctx.currentTime, () => {
      this.outroTimer = null;
      if (!this.done) this.state = 'outro';
    });
  }

  private cancelTimers(): void {
    if (this.loopArmTimer != null) {
      clearTimeout(this.loopArmTimer);
      this.loopArmTimer = null;
    }
    if (this.outroTimer != null) {
      this.outroTimer();
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
