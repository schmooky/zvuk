import type { PlayOptions, SoundLimit } from '../types';
import type { Sound } from './sound';
import type { Voice } from './voice';

/**
 * Strategy for picking which variant fires on each `play()`:
 *
 * - `'random'` — uniform random pick. Cheap; can play the same one twice
 *   in a row, which sounds robotic.
 * - `'no-repeat'` (default) — uniform random, but never the same as the
 *   previous pick. The fix every casino slot uses for SFX variants.
 * - `'shuffle-bag'` — Tetris-style: cycle through every variant in a
 *   random shuffle, then reshuffle once the bag empties. Guarantees
 *   every variant gets played roughly equally.
 */
export type VariantStrategy = 'random' | 'no-repeat' | 'shuffle-bag';

export interface VariantsOptions {
  strategy?: VariantStrategy;
  /**
   * Relative weight per variant, in load order. `[3, 1, 1]` makes the first
   * take three times as likely as each of the others. Missing entries
   * default to 1; a weight of 0 never plays (unless every weight is 0).
   * `'no-repeat'` still never repeats; `'shuffle-bag'` puts
   * `round(weight)` copies of each take in the bag.
   */
  weights?: readonly number[];
}

/**
 * A bundle of N alternate sounds that play one at a time. The classic
 * casino-slot pattern: every coin / win / reel-stop trigger plays a
 * randomised variant so stacked SFX don't sound robotic.
 *
 * Construct via `engine.loadVariants(name, urlSets)`; spawn voices via
 * `engine.variants(name).play()`. The picker strategy is configurable
 * (`'random'` | `'no-repeat'` | `'shuffle-bag'`).
 */
export class Variants {
  readonly name: string;
  readonly count: number;
  private sounds: Sound[];
  private strategy: VariantStrategy;
  private weights: number[];
  private lastIndex = -1;
  private bag: number[] = [];

  constructor(name: string, sounds: Sound[], options: VariantsOptions = {}) {
    if (sounds.length === 0) throw new Error(`Variants "${name}" requires at least one sound`);
    this.name = name;
    this.sounds = sounds;
    this.count = sounds.length;
    this.strategy = options.strategy ?? 'no-repeat';
    this.weights = normalizeWeights(options.weights, sounds.length);
  }

  /**
   * Cap simultaneous voices across the whole bundle and/or set a retrigger
   * cooldown. Every variant shares this one limit.
   */
  setLimit(limit: SoundLimit | null): void {
    this.sounds[0]!.setLimit(limit);
  }

  /** The bundle's current limit (empty object when unlimited). */
  get soundLimit(): Readonly<SoundLimit> {
    return this.sounds[0]!.soundLimit;
  }

  /** Change the pick weights. Same rules as `VariantsOptions.weights`. */
  setWeights(weights: readonly number[] | null): void {
    this.weights = normalizeWeights(weights ?? undefined, this.count);
    this.bag = [];
  }

  /**
   * Index of the variant the most recent `play()` picked, or `-1` before the
   * first one. Read it when something outside the mix has to follow the
   * pick: a subtitle for the line that actually fired, a telemetry event, an
   * animation keyed to which take you got.
   */
  get lastPick(): number {
    return this.lastIndex;
  }

  /** Spawn a Voice on a randomly-picked variant. */
  play(options: PlayOptions = {}): Voice {
    return this.sounds[this.pick()]!.play(options);
  }

  /** Force the next pick to use a specific variant index. Useful for tests. */
  playIndex(index: number, options: PlayOptions = {}): Voice {
    const i = ((index % this.count) + this.count) % this.count;
    this.lastIndex = i;
    return this.sounds[i]!.play(options);
  }

  private pick(): number {
    const i = this.choose();
    this.lastIndex = i;
    return i;
  }

  private choose(): number {
    const n = this.count;
    // A one-take bundle still records its pick: `lastPick` used to read -1
    // forever on one.
    if (n === 1) return 0;

    if (this.strategy === 'random') return weightedPick(this.weights, -1);

    if (this.strategy === 'shuffle-bag') {
      if (this.bag.length === 0) {
        const bag: number[] = [];
        for (let i = 0; i < n; i++) {
          const copies = Math.round(this.weights[i]!);
          for (let k = 0; k < copies; k++) bag.push(i);
        }
        if (bag.length === 0) for (let i = 0; i < n; i++) bag.push(i);
        // Fisher–Yates shuffle.
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j]!, bag[i]!];
        }
        // Avoid an immediate repeat at the bag boundary.
        if (bag.length > 1 && bag[0] === this.lastIndex) {
          const swap = bag.findIndex((v) => v !== this.lastIndex);
          if (swap > 0) [bag[0], bag[swap]] = [bag[swap]!, bag[0]!];
        }
        this.bag = bag;
      }
      return this.bag.shift()!;
    }

    // 'no-repeat' — weighted pick among the variants that aren't the
    // previous one. With n=2 this alternates strictly. Before the first play
    // there is no previous pick to avoid: the old code skipped index 0 then,
    // so the first take of a bundle could never open it.
    return weightedPick(this.weights, this.lastIndex);
  }
}

function normalizeWeights(weights: readonly number[] | undefined, n: number): number[] {
  const out = Array.from({ length: n }, (_, i) => {
    const w = weights?.[i];
    return w == null || !Number.isFinite(w) ? 1 : Math.max(0, w);
  });
  return out.some((w) => w > 0) ? out : out.map(() => 1);
}

/** Weighted random index, never `exclude` unless it is the only choice. */
function weightedPick(weights: readonly number[], exclude: number): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (i !== exclude) total += weights[i]!;
  if (total <= 0) {
    // Only the excluded take has weight; fall back to uniform over the rest.
    const others = weights.map((_, i) => i).filter((i) => i !== exclude);
    return others[Math.floor(Math.random() * others.length)] ?? 0;
  }
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (i === exclude) continue;
    r -= weights[i]!;
    if (r < 0) return i;
  }
  for (let i = weights.length - 1; i >= 0; i--) if (i !== exclude && weights[i]! > 0) return i;
  return 0;
}
