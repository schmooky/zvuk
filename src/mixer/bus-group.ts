import type { FadeCurve } from '../types';
import type { Bus } from './bus';

/**
 * A logical handle that addresses several buses at once. Doesn't change
 * the audio graph — applies operations (level, fade, mute, solo) to every
 * member in parallel. Useful when several buses form a sub-mix that should
 * always be controlled together: combat = weapons + enemies + environment;
 * voice = dialogue + effort sounds; etc.
 *
 * Construct via `engine.busGroup(name, members)`; look up via
 * `engine.busGroup(name)`. Snapshots and parameters can target a group
 * instead of repeating bus names.
 */
export class BusGroup {
  readonly name: string;
  readonly members: readonly Bus[];

  constructor(name: string, members: readonly Bus[]) {
    this.name = name;
    this.members = members;
  }

  /** Set the level on every member. Same 10 ms ramp as direct `bus.level =`. */
  set level(v: number) {
    for (const b of this.members) b.level = v;
  }

  /**
   * Read the current level. Returns the average across members — useful
   * when every member shares a level (the common case) and informational
   * otherwise.
   */
  get level(): number {
    if (this.members.length === 0) return 0;
    let sum = 0;
    for (const b of this.members) sum += b.level;
    return sum / this.members.length;
  }

  set muted(v: boolean) {
    for (const b of this.members) b.muted = v;
  }

  /** True if every member is currently muted. */
  get muted(): boolean {
    if (this.members.length === 0) return false;
    return this.members.every((b) => b.muted);
  }

  /**
   * Fade every member to `target` over `duration` seconds. Returns when
   * the slowest leg completes — in practice they're all equal because
   * each member uses the same duration.
   */
  fadeTo(target: number, duration: number, curve: FadeCurve = 'linear'): Promise<void> {
    return Promise.all(this.members.map((b) => b.fadeTo(target, duration, curve))).then(() => undefined);
  }

  /** Solo every member of the group. Engine handles the global mute-the-rest rule. */
  solo(on = true): void {
    for (const b of this.members) b.solo(on);
  }

  /** Un-solo every member. */
  unsolo(): void {
    this.solo(false);
  }
}
