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

  constructor(name: string, initial: number) {
    this.name = name;
    this._value = initial;
  }

  get value(): number {
    return this._value;
  }

  set(v: number): void {
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
  bindTo(setter: (mapped: number) => void, opts: { from?: number; to?: number; curve?: ParameterCurve } = {}): () => void {
    const from = opts.from ?? 0;
    const to = opts.to ?? 1;
    const curve = opts.curve ?? 'linear';
    return this.subscribe((v) => {
      const t = Math.max(0, Math.min(1, v));
      const eased = ease(t, curve);
      setter(from + (to - from) * eased);
    });
  }
}

function ease(t: number, curve: ParameterCurve): number {
  switch (curve) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'equal-power':
      return Math.sin((t * Math.PI) / 2) ** 2;
    default:
      return t;
  }
}
