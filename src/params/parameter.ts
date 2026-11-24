import type { FadeCurve } from '../types';

export type ParameterCurve = FadeCurve;

type Subscriber = (value: number) => void;

/**
 * A named float you can drive at runtime. Set it from anywhere; subscribers
 * (bus levels, FX wet, voice gain) update immediately.
 *
 * Bind a target to a parameter with `bindTo` — when the parameter changes,
 * the curve maps [0..1] to a target range and applies the value. Repeated
 * `set` calls override each other (no queue), making parameters ideal for
 * "intensity"/"distance"/"tension" knobs that change continuously.
 */
export class Parameter {
  readonly name: string;
  private _value: number;
  private subs = new Set<Subscriber>();
  private glide: { cancel: () => void; resolve: () => void } | null = null;

  constructor(name: string, initial: number) {
    this.name = name;
    this._value = initial;
  }

  get value(): number {
    return this._value;
  }

  /** Set the value now. Cancels a running `rampTo` glide. */
  set(v: number): void {
    this.cancelGlide();
    this.write(v);
  }

  /** True while a `rampTo` glide is running. */
  get gliding(): boolean {
    return this.glide != null;
  }

  /**
   * Glide to `target` over `seconds`, calling subscribers on every frame
   * along the way. Resolves when the glide lands, or when `set()` or
   * another `rampTo()` interrupts it. An RTPC-style "intensity" knob moved
   * with `rampTo` drives everything bound to it smoothly, without each
   * binding scheduling its own fade.
   *
   * Frames come from `requestAnimationFrame`, falling back to 16 ms timers
   * where there is none (a hidden tab, a worker, SSR). The glide runs on
   * wall time, so a hidden tab still lands on time, just in coarser steps.
   */
  rampTo(target: number, seconds: number, curve: ParameterCurve = 'linear'): Promise<void> {
    this.cancelGlide();
    const duration = Math.max(0, seconds);
    if (duration === 0 || target === this._value) {
      this.write(target);
      return Promise.resolve();
    }
    const from = this._value;
    const rising = target >= from;
    const t0 = nowMs();
    return new Promise<void>((resolve) => {
      let handle: { cancel: () => void } = { cancel: () => {} };
      const step = (): void => {
        const t = Math.min(1, (nowMs() - t0) / (duration * 1000));
        const eased = ease(t, curve, rising);
        this.write(from + (target - from) * eased);
        if (t >= 1) {
          this.glide = null;
          resolve();
          return;
        }
        handle = nextFrame(step);
      };
      this.glide = {
        cancel: () => handle.cancel(),
        resolve,
      };
      handle = nextFrame(step);
    });
  }

  private cancelGlide(): void {
    const g = this.glide;
    if (!g) return;
    this.glide = null;
    g.cancel();
    g.resolve();
  }

  private write(v: number): void {
    if (v === this._value) return;
    this._value = v;
    for (const s of this.subs) s(v);
  }

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    fn(this._value);
    return () => this.subs.delete(fn);
  }

  /**
   * Bind a setter to this parameter. The parameter's [0..1] value (clamped)
   * is mapped to [from..to] via `curve`, then the setter is called with the
   * mapped value. Returns an unbind function.
   */
  bindTo(
    setter: (mapped: number) => void,
    opts: { from?: number; to?: number; curve?: ParameterCurve } = {},
  ): () => void {
    const from = opts.from ?? 0;
    const to = opts.to ?? 1;
    const curve = opts.curve ?? 'linear';
    const rising = to >= from;
    return this.subscribe((v) => {
      const t = Math.max(0, Math.min(1, v));
      const eased = ease(t, curve, rising);
      setter(from + (to - from) * eased);
    });
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function nextFrame(fn: () => void): { cancel: () => void } {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!hidden && typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(() => fn());
    return { cancel: () => cancelAnimationFrame(id) };
  }
  const id = setTimeout(fn, 16);
  return { cancel: () => clearTimeout(id) };
}

function ease(t: number, curve: ParameterCurve, rising = true): number {
  switch (curve) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'equal-power':
      // Constant-power: rising leg sin(t·π/2), falling leg cos(t·π/2) so two
      // opposing legs sum to unity power. See src/mixer/curve.ts for details.
      return rising ? Math.sin((t * Math.PI) / 2) : 1 - Math.cos((t * Math.PI) / 2);
    default:
      return t;
  }
}
