import { applyRamp, scheduleSegmentEnvelope } from '../mixer/curve';
import { afterAudio, waitAudio } from '../runtime/wait';
import type { FadeOptions, MusicPlayOptions, MusicState, SkipToOutroOptions, StopOptions } from '../types';

const DEFAULT_STOP_FADE_SEC = 0.008;
const SKIP_NOW_FADE_SEC = 0.05;
/** Fade on the loop when the outro cuts in mid-buffer, on a bar or a beat. */
const GRID_CUT_FADE_SEC = 0.01;
/** `onBeat` fires this far ahead of each beat, so callers can schedule on it. */
const BEAT_LOOKAHEAD_SEC = 0.05;

interface MusicBuffers {
  intro?: AudioBuffer;
  loop: AudioBuffer;
  outro?: AudioBuffer;
}

/** Tempo grid of a music asset. */
export interface MusicGrid {
  bpm: number;
  beatsPerBar: number;
  /** Seconds from the start of playback to the first downbeat. */
  offset: number;
}

interface MusicDeps {
  ctx: AudioContext;
  buffers: MusicBuffers;
  destination: AudioNode;
  loopCrossfade: number;
  defaultStopFade?: number;
  grid?: { bpm: number; beatsPerBar?: number; offset?: number };
}

/** One beat of a music grid, passed to `onBeat` listeners. */
export interface BeatEvent {
  /** Audio time of the beat. Schedule on it: `sound.play({ at: e.time })`. */
  readonly time: number;
  /** Beats since the grid's first downbeat, from 0. */
  readonly beat: number;
  /** Bar number, from 0. */
  readonly bar: number;
  /** Beat within the bar, from 0. 0 is the downbeat. */
  readonly beatInBar: number;
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

  /** The tempo grid, or undefined when the asset was loaded without `bpm`. */
  get grid(): Readonly<MusicGrid> | undefined {
    const g = this.deps.grid;
    if (!g) return undefined;
    return {
      bpm: g.bpm,
      beatsPerBar: g.beatsPerBar ?? 4,
      offset: g.offset ?? this.deps.buffers.intro?.duration ?? 0,
    };
  }

  play(options: MusicPlayOptions = {}): MusicVoice {
    const voice = new MusicVoice({
      ctx: this.deps.ctx,
      buffers: this.deps.buffers,
      destination: this.deps.destination,
      loopCrossfade: this.deps.loopCrossfade,
      defaultStopFade: this.deps.defaultStopFade,
      grid: this.grid,
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
  grid?: MusicGrid;
  options: MusicPlayOptions;
}

interface LoopSegment {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Audio time the segment starts sounding. */
  startTime: number;
  /** Offset into the loop buffer the segment starts from. */
  offset: number;
}

type OutroMode = NonNullable<SkipToOutroOptions['at']>;

/**
 * One live playback instance of a `Music` asset. Tracks which part is
 * currently sounding (`'intro' | 'loop' | 'outro' | 'ended'`), exposes
 * `fade`/`pause`/`resume`/`stop`, and adds the music-specific operations:
 *
 * - `skipToOutro({ at: 'loop-end' })` — wait for the current loop iteration
 *   to complete, then play the outro at the natural loop boundary.
 * - `skipToOutro({ at: 'bar' | 'beat' })` — the outro takes over on the next
 *   bar or beat of the tempo grid (needs `bpm` on `loadMusic`).
 * - `skipToOutro({ at: 'now' })` — fade the loop out (~50 ms) and start
 *   the outro immediately. Right call for "user pressed Stop."
 * - `nextBeat()` / `nextBar()` / `onBeat()` — the tempo grid, for stingers
 *   and animations that land on the music.
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
  private grid: MusicGrid | undefined;

  // Live audio sources + their per-segment gain nodes. The chain is the
  // (1+) loop iterations under crossfade-mode; when crossfade is off this
  // is at most one live loop source.
  private introSource: AudioBufferSourceNode | null = null;
  private outroSource: AudioBufferSourceNode | null = null;
  private loopChain: LoopSegment[] = [];
  private loopArmTimer: ReturnType<typeof setTimeout> | null = null;
  // Cancel handle for the outro handover. Audio-clock driven — see afterAudio.
  private outroTimer: (() => void) | null = null;
  // Cancel handle for the intro → loop state flip on the native-loop path.
  private flipTimer: (() => void) | null = null;
  // Audio time the next crossfade segment is due to start. The chain re-anchors
  // it on every spawn, so it only means anything on the crossfade path — the
  // native-loop path has no chain to re-anchor it and reads the boundary off
  // `loopAnchorAt` instead. Both go through nextLoopBoundary().
  private nextLoopBoundaryAt = Number.POSITIVE_INFINITY;
  // Audio time the loop buffer's first sample plays (or would have played,
  // for a loop resumed mid-buffer). On the native-loop path one source loops
  // itself forever from here, so every boundary is a whole number of loop
  // durations past it.
  private loopAnchorAt = Number.POSITIVE_INFINITY;
  // Audio time the intro started and is scheduled to finish, or -Infinity
  // when there is no intro.
  private introStartAt = Number.NEGATIVE_INFINITY;
  private introEndsAt = Number.NEGATIVE_INFINITY;
  // Audio time the outro is scheduled to start, once skipToOutro has run.
  private outroStartAt = Number.POSITIVE_INFINITY;
  private outroMode: OutroMode | null = null;
  // Past this audio time no loop segment may sound: the outro owns it.
  private loopDeadline = Number.POSITIVE_INFINITY;
  // Audio time of the grid's first downbeat. Shifted by every pause.
  private gridZero = 0;
  // Pause state.
  private paused = false;
  private pausedAt = 0;
  private pausedPart: Exclude<MusicState, 'ended'> = 'loop';
  private pausedOffset = 0;
  private beatListeners = new Set<(e: BeatEvent) => void>();
  private beatTimer: (() => void) | null = null;

  constructor(deps: MusicVoiceDeps) {
    this.ctx = deps.ctx;
    this.buffers = deps.buffers;
    this.destination = deps.destination;
    this.loopCrossfadeSec = Math.max(0, deps.loopCrossfade);
    this.stopFade = Math.max(0, deps.defaultStopFade ?? DEFAULT_STOP_FADE_SEC);
    this.grid = deps.grid && deps.grid.bpm > 0 ? deps.grid : undefined;

    const now = this.ctx.currentTime;
    const at = deps.options.at;
    const startAt = at != null && Number.isFinite(at) && at > now ? at : now;

    this.gain = this.ctx.createGain();
    const initialVolume = clamp01(deps.options.volume ?? 1);
    const fadeIn = Math.max(0, deps.options.fadeIn ?? 0);
    if (fadeIn > 0) {
      this.gain.gain.setValueAtTime(0, startAt);
      this.gain.gain.linearRampToValueAtTime(initialVolume, startAt + fadeIn);
    } else {
      this.gain.gain.value = initialVolume;
    }
    this.gain.connect(this.destination);

    this.ended = new Promise<void>((resolve) => {
      this.resolveEnded = resolve;
    });

    this.gridZero = startAt + (this.grid?.offset ?? 0);
    this.start(startAt);
  }

  /** Currently-sounding part. Transitions automatically as parts hand off. */
  get currentPart(): MusicState {
    return this.state;
  }

  /** True while paused. */
  get isPaused(): boolean {
    return this.paused;
  }

  /** The tempo grid, or undefined without `bpm`. */
  get tempo(): Readonly<MusicGrid> | undefined {
    return this.grid;
  }

  fade(opts: FadeOptions): Promise<void> {
    if (this.done) return Promise.resolve();
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

    if (fade === 0 || this.paused) {
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
   * Pause playback. `resume()` picks up in the same part at the same offset,
   * and a `skipToOutro` that was waiting for its boundary is re-issued on
   * resume. The tempo grid shifts by the length of the pause, so beats keep
   * lining up with the music.
   */
  pause(): void {
    if (this.done || this.paused) return;
    const now = this.ctx.currentTime;
    const pos = this.position(now);
    this.pausedPart = pos.part;
    this.pausedOffset = pos.offset;
    this.pausedAt = now;
    // A skip that hasn't reached its boundary yet is re-issued on resume.
    const pendingOutro = this.outroMode != null && now < this.outroStartAt ? this.outroMode : null;
    this.cancelTimers();
    this.clearBeatTimer();
    this.stopAllSources(0);
    this.disconnectSources();
    this.outroMode = pendingOutro;
    this.outroStartAt = Number.POSITIVE_INFINITY;
    this.loopDeadline = Number.POSITIVE_INFINITY;
    this.paused = true;
  }

  /** Resume from where `pause()` left off. No-op when not paused. */
  resume(): void {
    if (this.done || !this.paused) return;
    this.paused = false;
    const now = this.ctx.currentTime;
    this.gridZero += now - this.pausedAt;
    const off = this.pausedOffset;
    const pending = this.outroMode;
    this.outroMode = null;

    if (this.pausedPart === 'intro' && this.buffers.intro) {
      this.state = 'intro';
      this.scheduleIntro(now, off);
      this.scheduleLoopStart(this.introEndsAt, 0);
    } else if (this.pausedPart === 'outro' && this.buffers.outro) {
      this.state = 'outro';
      this.playOutroFrom(now, off);
    } else {
      this.state = 'loop';
      this.scheduleLoopStart(now, off);
    }
    if (pending) this.skipToOutro({ at: pending });
    if (this.beatListeners.size > 0) this.armBeat();
  }

  /**
   * Schedule the outro. With `at: 'loop-end'` (default) the outro starts
   * at the next natural loop boundary so the music ends musically. With
   * `'bar'` or `'beat'` it starts on the next bar or beat of the tempo grid.
   * With `at: 'now'` the loop fades out (~50 ms) and the outro starts
   * immediately — useful when responsiveness matters more than musicality
   * (e.g. user pressed Stop).
   *
   * No-op if the music is already past the loop part, and calling
   * `skipToOutro` more than once is a no-op too — the first call wins.
   * Without an outro buffer this stops the music instead, so calling code
   * doesn't need to branch on `hasOutro`. While paused the request is kept
   * and runs on resume.
   */
  skipToOutro(opts: SkipToOutroOptions = {}): void {
    if (this.done) return;
    if (this.state === 'outro' || this.state === 'ended') return;
    if (this.outroMode != null) return;
    if (!this.buffers.outro) {
      this.stop();
      return;
    }
    let at: OutroMode = opts.at ?? 'loop-end';
    if ((at === 'bar' || at === 'beat') && !this.grid) at = 'loop-end';
    this.outroMode = at;
    if (this.paused) return;
    if (at === 'now') this.skipToOutroNow();
    else if (at === 'loop-end') this.skipToOutroAtLoopEnd();
    else this.skipToOutroOnGrid(at === 'bar' ? this.nextBar()! : this.nextBeat()!);
  }

  /**
   * Audio time of the next beat strictly after `from` (default now), or
   * undefined without `bpm`. Feed it straight to `play({ at })`.
   */
  nextBeat(from: number = this.ctx.currentTime): number | undefined {
    if (!this.grid) return undefined;
    return this.nextGridPoint(from, 60 / this.grid.bpm);
  }

  /** Audio time of the next downbeat strictly after `from`, or undefined without `bpm`. */
  nextBar(from: number = this.ctx.currentTime): number | undefined {
    if (!this.grid) return undefined;
    return this.nextGridPoint(from, (60 / this.grid.bpm) * this.grid.beatsPerBar);
  }

  /**
   * Where `time` (default now) falls on the grid, or undefined without
   * `bpm`. Fractional beats count up between beats.
   */
  beatAt(time: number = this.ctx.currentTime): { beat: number; bar: number; beatInBar: number } | undefined {
    if (!this.grid) return undefined;
    const t = this.paused ? this.pausedAt : time;
    const beat = Math.max(0, (t - this.gridZero) / (60 / this.grid.bpm));
    const whole = Math.floor(beat);
    return {
      beat,
      bar: Math.floor(whole / this.grid.beatsPerBar),
      beatInBar: whole % this.grid.beatsPerBar,
    };
  }

  /**
   * Call `fn` for every beat while the music plays. It runs about 50 ms
   * ahead of each beat with the beat's exact audio time, so work scheduled
   * on `e.time` lands on the beat. Timers can still run late when the main
   * thread stalls; a beat that was missed by more than the lookahead is
   * delivered late, not skipped. Returns an unsubscribe function. No-op
   * without `bpm`.
   */
  onBeat(fn: (e: BeatEvent) => void): () => void {
    if (!this.grid || this.done) return () => {};
    this.beatListeners.add(fn);
    if (this.beatListeners.size === 1 && !this.paused) this.armBeat();
    return () => {
      this.beatListeners.delete(fn);
      if (this.beatListeners.size === 0) this.clearBeatTimer();
    };
  }

  private nextGridPoint(from: number, step: number): number {
    // While paused the grid is frozen: it moves on by the pause's length when
    // playback resumes, so these are the times it would land on if it
    // resumed right now.
    const base = this.paused ? this.gridZero + (this.ctx.currentTime - this.pausedAt) : this.gridZero;
    if (from < base) return base;
    const k = Math.floor((from - base) / step + 1e-6) + 1;
    return base + k * step;
  }

  private armBeat(): void {
    this.clearBeatTimer();
    if (!this.grid || this.done || this.paused) return;
    const now = this.ctx.currentTime;
    const step = 60 / this.grid.bpm;
    // The next beat we haven't announced yet, looking a lookahead ahead.
    const t = this.nextGridPoint(now + BEAT_LOOKAHEAD_SEC - 1e-4, step);
    const beat = Math.round((t - this.gridZero) / step);
    this.beatTimer = afterAudio(this.ctx, Math.max(0, t - now - BEAT_LOOKAHEAD_SEC), () => {
      this.beatTimer = null;
      this.fireBeat(t, beat);
    });
  }

  private fireBeat(t: number, beat: number): void {
    if (this.done || this.paused || !this.grid) return;
    const e: BeatEvent = {
      time: t,
      beat,
      bar: Math.floor(beat / this.grid.beatsPerBar),
      beatInBar: beat % this.grid.beatsPerBar,
    };
    for (const fn of [...this.beatListeners]) fn(e);
    if (this.beatListeners.size === 0 || this.beatTimer) return;
    // Re-arm past this beat, so a slow listener can't fire it twice.
    const step = 60 / this.grid.bpm;
    const next = this.nextGridPoint(Math.max(this.ctx.currentTime, t) + 1e-4, step);
    const nextBeat = Math.round((next - this.gridZero) / step);
    this.beatTimer = afterAudio(
      this.ctx,
      Math.max(0, next - this.ctx.currentTime - BEAT_LOOKAHEAD_SEC),
      () => {
        this.beatTimer = null;
        this.fireBeat(next, nextBeat);
      },
    );
  }

  private clearBeatTimer(): void {
    if (this.beatTimer) {
      this.beatTimer();
      this.beatTimer = null;
    }
  }

  private start(when: number): void {
    if (this.buffers.intro) {
      this.scheduleIntro(when, 0);
      this.scheduleLoopStart(this.introEndsAt, 0);
    } else {
      this.state = 'loop';
      this.scheduleLoopStart(when, 0);
    }
  }

  private scheduleIntro(when: number, offset: number): void {
    const intro = this.buffers.intro!;
    const src = this.ctx.createBufferSource();
    src.buffer = intro;
    src.connect(this.gain);
    try {
      src.start(when, offset);
    } catch {
      /* already started */
    }
    this.introStartAt = when - offset;
    this.introEndsAt = when + (intro.duration - offset);
    src.onended = () => {
      // Detach by reference so a stop()-driven onended doesn't double-fire.
      if (this.introSource === src) this.introSource = null;
    };
    this.introSource = src;
  }

  /** Start the loop part at audio time `when`, `offset` seconds into the loop buffer. */
  private scheduleLoopStart(when: number, offset: number): void {
    if (this.done) return;
    const dur = this.buffers.loop.duration;
    // Too little of the buffer left to fade out of: start the next lap.
    let off = Math.max(0, Math.min(offset, dur));
    if (this.crossfadeViable() && dur - off <= this.loopCrossfadeSec * 2) off = 0;
    const segment = this.spawnLoopSegment(when, /* fadeIn */ false, off);
    // Chain off where the segment actually landed, not the deadline we asked
    // for — see spawnLoopSegment on why the two can differ.
    const startedAt = segment.startTime;
    this.loopAnchorAt = startedAt - off;
    this.nextLoopBoundaryAt = this.loopAnchorAt + dur;

    if (this.crossfadeViable()) {
      this.armNextLoopSegment(this.loopAnchorAt);
    } else {
      // Single-source native loop path: spawnLoopSegment set it looping.
      if (this.state === 'intro') {
        // Flip state at the boundary — on the audio clock, so a tab hide
        // during the intro doesn't report the loop as playing early.
        this.flipTimer = afterAudio(this.ctx, startedAt - this.ctx.currentTime, () => {
          this.flipTimer = null;
          if (!this.done && this.state === 'intro') this.state = 'loop';
        });
      } else {
        this.state = 'loop';
      }
    }
  }

  private spawnLoopSegment(when: number, fadeIn: boolean, offset: number): LoopSegment {
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
    const crossfade = this.crossfadeViable();
    const len = this.buffers.loop.duration - offset;

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.loop;
    src.loop = !crossfade;
    if (!crossfade) {
      src.loopStart = 0;
      src.loopEnd = this.buffers.loop.duration;
    }

    const segGain = this.ctx.createGain();
    scheduleSegmentEnvelope(segGain.gain, start, len, this.loopCrossfadeSec, {
      fadeIn: rampIn,
      fadeOut: crossfade,
    });
    src.connect(segGain).connect(this.gain);
    try {
      // Crossfade-on path uses an explicit duration so the source ends
      // itself; crossfade-off path uses native looping.
      if (crossfade) src.start(start, offset, len);
      else src.start(start, offset);
      if (Number.isFinite(this.loopDeadline)) src.stop(this.loopDeadline);
    } catch {
      /* already started */
    }
    src.onended = () => this.releaseLoopSegment(src, segGain);
    const entry: LoopSegment = { source: src, gain: segGain, startTime: start, offset };
    this.loopChain.push(entry);
    return entry;
  }

  /** `lapStart` is the audio time the current lap's buffer offset 0 plays. */
  private armNextLoopSegment(lapStart: number): void {
    this.cancelLoopArm();
    const nextStart = lapStart + this.buffers.loop.duration - this.loopCrossfadeSec;
    const SAFETY_LEAD_MS = 50;
    const delayMs = Math.max(0, (nextStart - this.ctx.currentTime) * 1000 - SAFETY_LEAD_MS);
    this.loopArmTimer = setTimeout(() => {
      this.loopArmTimer = null;
      if (this.done || this.paused || (this.state !== 'loop' && this.state !== 'intro')) return;
      // The outro owns everything from its start on.
      if (nextStart >= this.loopDeadline) return;
      // Transition from intro → loop happens at the very first loop spawn.
      this.state = 'loop';
      // Chain off where the segment actually landed. A late wake-up rebases
      // it onto the clock, and arming from the deadline we missed instead
      // would leave every following wake-up late too — a catch-up burst
      // stacking several segments onto the same instant.
      let startedAt = nextStart;
      try {
        startedAt = this.spawnLoopSegment(nextStart, /* fadeIn */ true, 0).startTime;
      } finally {
        // Re-arm whatever happened above. An exception escaping this
        // callback used to end the loop for good: the music fell silent and
        // stayed that way.
        this.loopAnchorAt = startedAt;
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
   */
  private nextLoopBoundary(): number {
    if (this.crossfadeViable()) return this.nextLoopBoundaryAt;
    if (!Number.isFinite(this.loopAnchorAt)) return this.loopAnchorAt;
    const elapsed = this.ctx.currentTime - this.loopAnchorAt;
    const dur = this.buffers.loop.duration;
    if (elapsed < 0 || dur <= 0) return this.loopAnchorAt + (elapsed < 0 ? dur : 0);
    // Strictly the next one: landing on the boundary we are already standing
    // on would schedule the outro into the past.
    return this.loopAnchorAt + (Math.floor(elapsed / dur) + 1) * dur;
  }

  /** Which part plays at audio time `t`, and how far into it. */
  private position(t: number): { part: Exclude<MusicState, 'ended'>; offset: number } {
    if (this.outroSource && t >= this.outroStartAt) {
      return { part: 'outro', offset: Math.max(0, t - this.outroStartAt) };
    }
    if (this.buffers.intro && t < this.introEndsAt) {
      return { part: 'intro', offset: Math.max(0, t - this.introStartAt) };
    }
    const dur = this.buffers.loop.duration;
    if (this.crossfadeViable()) {
      let seg: LoopSegment | null = null;
      for (const e of this.loopChain) if (e.startTime <= t && (!seg || e.startTime > seg.startTime)) seg = e;
      if (seg) return { part: 'loop', offset: Math.min(dur, seg.offset + (t - seg.startTime)) };
    }
    if (!Number.isFinite(this.loopAnchorAt) || dur <= 0) return { part: 'loop', offset: 0 };
    const into = Math.max(0, t - this.loopAnchorAt);
    return { part: 'loop', offset: into % dur };
  }

  private skipToOutroAtLoopEnd(): void {
    // Disable fresh segment spawns; the boundary computed below tells us when
    // to fire the outro.
    this.cancelLoopArm();
    // Still in the intro? There is no loop boundary yet, so the outro takes
    // over the moment the intro finishes — at the intro's own scheduled end,
    // not an intro length from now, which would leave a hole as wide as the
    // part of the intro that has already played.
    let outroAt: number;
    if (this.state === 'intro') {
      outroAt = this.introEndsAt;
    } else {
      outroAt = this.nextLoopBoundary();
    }

    // A boundary can still be behind us: the main thread may have stalled
    // through it, or the state may not have caught up with the audio thread.
    // Stamping the outro in the past gets clamped to the current time anyway,
    // and drags the loop's stop() along with it — so ask for "now" plainly
    // rather than for a time we know has gone.
    outroAt = Math.max(outroAt, this.ctx.currentTime);
    this.loopDeadline = outroAt;

    // Tell the in-flight loop segments to stop themselves at outroAt.
    this.stopLoopSourcesAt(outroAt, 0);
    this.scheduleOutro(outroAt);
  }

  /**
   * The outro takes over on a grid point. That point can sit mid-buffer, so
   * the loop gets a 10 ms fade into it; and it can lie beyond the segment
   * that is playing now, so the crossfade chain keeps running up to it.
   */
  private skipToOutroOnGrid(outroAt: number): void {
    const at = Math.max(outroAt, this.ctx.currentTime);
    this.loopDeadline = at;
    if (this.introSource && at < this.introEndsAt) {
      try {
        this.introSource.stop(at);
      } catch {
        /* already stopped */
      }
    }
    this.stopLoopSourcesAt(at, GRID_CUT_FADE_SEC);
    this.scheduleOutro(at);
  }

  private skipToOutroNow(): void {
    this.cancelLoopArm();
    const now = this.ctx.currentTime;
    const fadeEnd = now + SKIP_NOW_FADE_SEC;
    this.loopDeadline = fadeEnd;

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

  private stopLoopSourcesAt(when: number, fadeSec: number): void {
    for (const entry of this.loopChain) {
      if (fadeSec > 0 && entry.startTime < when) {
        const from = Math.max(this.ctx.currentTime, when - fadeSec);
        try {
          entry.gain.gain.setValueAtTime(entry.gain.gain.value, from);
          entry.gain.gain.linearRampToValueAtTime(0, when);
        } catch {
          /* inside a crossfade curve — the boundary cut stands */
        }
      }
      try {
        entry.source.stop(when);
      } catch {
        /* */
      }
    }
  }

  private scheduleOutro(when: number): void {
    this.outroStartAt = when;
    this.playOutroFrom(when, 0);
  }

  private playOutroFrom(when: number, offset: number): void {
    const buf = this.buffers.outro;
    if (!buf) {
      // Without an outro the music is effectively "ending now"; finish
      // when the scheduled time arrives.
      this.outroTimer = afterAudio(this.ctx, when - this.ctx.currentTime, () => this.finish());
      return;
    }
    this.outroStartAt = when - offset;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    try {
      src.start(when, offset);
    } catch {
      /* already started */
    }
    src.onended = () => {
      if (this.paused) return;
      if (this.outroSource === src) this.outroSource = null;
      this.finish();
    };
    this.outroSource = src;
    if (offset > 0) {
      this.state = 'outro';
      return;
    }
    // Flip state at the outro's start, not at scheduling time.
    this.outroTimer = afterAudio(this.ctx, when - this.ctx.currentTime, () => {
      this.outroTimer = null;
      if (!this.done) this.state = 'outro';
    });
  }

  private cancelTimers(): void {
    this.cancelLoopArm();
    if (this.outroTimer != null) {
      this.outroTimer();
      this.outroTimer = null;
    }
    if (this.flipTimer != null) {
      this.flipTimer();
      this.flipTimer = null;
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

  private disconnectSources(): void {
    try {
      if (this.introSource) this.introSource.disconnect();
      for (const e of this.loopChain) {
        e.source.disconnect();
        e.gain.disconnect();
      }
      if (this.outroSource) this.outroSource.disconnect();
    } catch {
      /* */
    }
    this.introSource = null;
    this.outroSource = null;
    this.loopChain = [];
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.state = 'ended';
    this.cancelTimers();
    this.clearBeatTimer();
    this.beatListeners.clear();
    this.disconnectSources();
    try {
      this.gain.disconnect();
    } catch {
      /* */
    }
    this.resolveEnded();
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
