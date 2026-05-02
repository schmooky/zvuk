import type { AudioContextHost } from './context';

type ScheduledTask = {
  audioTime: number;
  fn: () => void;
  cancelled: boolean;
};

/**
 * Sample-accurate scheduler driven by AudioContext time.
 *
 * Tasks are sorted by their target audio time and dispatched from a setTimeout
 * tick whose interval is computed from the closest pending task. The drift
 * vs ctx.currentTime is bounded by one tick (a few ms) — for true
 * sample-accurate playback, callers should stamp Web Audio API parameters
 * (gain ramps, source.start) directly with the audioTime value passed in.
 */
export class Scheduler {
  private tasks: ScheduledTask[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private host: AudioContextHost) {}

  scheduleAt(audioTime: number, fn: () => void): () => void {
    const task: ScheduledTask = { audioTime, fn, cancelled: false };
    this.tasks.push(task);
    this.tasks.sort((a, b) => a.audioTime - b.audioTime);
    this.reschedule();
    return () => {
      task.cancelled = true;
    };
  }

  private reschedule(): void {
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
    this.timer = null;
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
    this.reschedule();
  }

  dispose(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.tasks = [];
  }
}
