import type { Parameter } from '../params/parameter';
import type { Bus } from './bus';

export interface SnapshotState {
  buses: Record<string, { level: number; muted: boolean }>;
  parameters: Record<string, number>;
}

export interface ApplyOptions {
  /** Crossfade duration in milliseconds. Default 0 (snap). */
  fadeMs?: number;
}

/**
 * A captured mix-state preset. Capture it once with the engine in a known
 * good state ("menu mood"), then `apply({ fadeMs: 250 })` to crossfade the
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
    const fadeMs = opts.fadeMs ?? 0;
    const tasks: Promise<void>[] = [];

    for (const [name, bs] of Object.entries(this.state.buses)) {
      const bus = this.getBus(name);
      if (!bus) continue;
      bus.muted = bs.muted;
      tasks.push(bus.fadeTo(bs.level, fadeMs));
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
}
