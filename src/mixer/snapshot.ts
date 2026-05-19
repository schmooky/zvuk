import type { Parameter } from '../params/parameter';
import type { Bus } from './bus';

export interface SnapshotState {
  buses: Record<string, { level: number; muted: boolean }>;
  parameters: Record<string, number>;
}

export interface ApplyOptions {
  /** Crossfade duration in seconds. Default 0 (snap). */
  fade?: number;
}

/**
 * A captured mix-state preset. Capture it once with the engine in a known
 * good state ("menu mood"), then `apply({ fade: 0.25 })` to crossfade the
 * entire mix back to that snapshot — bus levels, mutes, parameter values,
 * everything in one call.
 *
 * Snapshots are immutable; mutate the engine and re-capture if you need a
 * new one.
 */
export class Snapshot {
  readonly name: string;
  readonly state: SnapshotState;
  private getBus: (name: string) => Bus | undefined;
  private getParam: (name: string) => Parameter | undefined;

  constructor(
    name: string,
    state: SnapshotState,
    getBus: (name: string) => Bus | undefined,
    getParam: (name: string) => Parameter | undefined,
  ) {
    this.name = name;
    this.state = state;
    this.getBus = getBus;
    this.getParam = getParam;
  }

  apply(opts: ApplyOptions = {}): Promise<void> {
    const fade = opts.fade ?? 0;
    const tasks: Promise<void>[] = [];

    for (const [name, bs] of Object.entries(this.state.buses)) {
      const bus = this.getBus(name);
      if (!bus) continue;
      bus.muted = bs.muted;
      tasks.push(bus.fadeTo(bs.level, fade));
    }

    for (const [name, value] of Object.entries(this.state.parameters)) {
      const param = this.getParam(name);
      if (!param) continue;
      // Parameters don't ramp natively; they're discrete values that
      // subscribers convert into ramps. Snap the value directly.
      param.set(value);
    }

    return Promise.all(tasks).then(() => undefined);
  }

  /**
   * Snap the live mix to a linear interpolation between this snapshot and
   * `other`. `t` is clamped to [0, 1]: `t = 0` matches this snapshot,
   * `t = 1` matches `other`, and intermediate values lerp every shared
   * bus level and parameter.
   *
   * Designed to be called continuously (e.g. from a `Parameter` subscriber)
   * — each call snaps instantly. For a one-shot crossfade with a fade
   * duration, use `apply({ fade })` instead.
   *
   * Buses or parameters present in only one of the two snapshots are
   * skipped. Mute flags are not interpolated: `t < 0.5` uses this
   * snapshot's mute, `t >= 0.5` uses `other`'s.
   */
  blendWith(other: Snapshot, t: number): void {
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    const v = 1 - u;

    for (const [name, busA] of Object.entries(this.state.buses)) {
      const busB = other.state.buses[name];
      if (!busB) continue;
      const bus = this.getBus(name);
      if (!bus) continue;
      bus.muted = u < 0.5 ? busA.muted : busB.muted;
      bus.level = busA.level * v + busB.level * u;
    }

    for (const [name, valA] of Object.entries(this.state.parameters)) {
      const valB = other.state.parameters[name];
      if (valB === undefined) continue;
      const param = this.getParam(name);
      if (!param) continue;
      param.set(valA * v + valB * u);
    }
  }
}
