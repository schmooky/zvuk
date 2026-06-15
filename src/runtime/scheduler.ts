import type { TickSource } from '../types';
import type { AudioContextHost } from './context';

type ScheduledTask = {
  audioTime: number;
  fn: () => void;
  cancelled: boolean;
};

/**
 * Audio-clock task scheduler driven by AudioContext time.
 *
 * Tasks are sorted by their target audio time and dispatched from a tick
 * source: an injected `TickSource` (host's render loop — Pixi, GSAP) when
 * configured, otherwise `setTimeout`. This dispatches JS callbacks, so it is
 * NOT sample-accurate — the drift vs `ctx.currentTime` is bounded by one tick
 * (a few ms for setTimeout, ~16 ms at 60 fps for an external ticker). For true
 * sample-accurate playback, callers should stamp Web Audio API parameters
 * (gain ramps, source.start) directly with the `audioTime` they scheduled
 * against (close over it) — that scheduling happens on the audio thread and is
 * unaffected by tab-blur throttling either way.
 *
 * Tick-source mode subscribes lazily — only while there are pending tasks —
 * so a 60 fps host loop isn't waking the scheduler 60 times a second to do
 * nothing.
 */
export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private host: AudioContextHost,
    private tickSource?: TickSource,
  ) {}

  scheduleAt(audioTime: number, fn: () => void): () => void {
    const task: ScheduledTask = { audioTime, fn, cancelled: false };
    this.tasks.push(task);
    this.tasks.sort((a, b) => a.audioTime - b.audioTime);
    this.arm();
    return () => {
      task.cancelled = true;
    };
  }

  private arm(): void {
    if (this.tickSource) {
      if (!this.unsubscribe) {
        this.unsubscribe = this.tickSource.subscribe(() => this.tick());
      }
      return;
    }
    this.rearmTimer();
  }

  private rearmTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const next = this.tasks.find((t) => !t.cancelled);
    if (!next) return;

    const now = this.host.now;
    const delayMs = Math.max(0, (next.audioTime - now) * 1000);
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  private tick(): void {
    if (this.timer != null) {
      // setTimeout-mode tick fired — the timer ref is now spent.
      this.timer = null;
    }
    const now = this.host.now;
    const due: ScheduledTask[] = [];
    const remaining: ScheduledTask[] = [];
    for (const t of this.tasks) {
      if (t.cancelled) continue;
      if (t.audioTime <= now) due.push(t);
      else remaining.push(t);
    }
    this.tasks = remaining;
    for (const t of due) {
      try {
        t.fn();
      } catch (e) {
        // Don't let one bad task starve the rest.
        console.error('[zvuk] scheduled task threw', e);
      }
    }

    if (this.tasks.length === 0) {
      // Idle — release the host ticker subscription so it isn't burning
      // frames on an empty queue.
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
      return;
    }

    if (!this.tickSource) this.rearmTimer();
  }

  dispose(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.tasks = [];
  }
}
