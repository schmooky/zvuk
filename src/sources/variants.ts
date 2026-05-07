import type { PlayOptions } from '../types';
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
  private lastIndex = -1;
  private bag: number[] = [];

  constructor(name: string, sounds: Sound[], options: VariantsOptions = {}) {
    if (sounds.length === 0) throw new Error(`Variants "${name}" requires at least one sound`);
    this.name = name;
    this.sounds = sounds;
    this.count = sounds.length;
    this.strategy = options.strategy ?? 'no-repeat';
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
    const n = this.count;
    if (n === 1) return 0;

    if (this.strategy === 'random') {
      const i = Math.floor(Math.random() * n);
      this.lastIndex = i;
      return i;
    }

    if (this.strategy === 'shuffle-bag') {
      if (this.bag.length === 0) {
        this.bag = Array.from({ length: n }, (_, i) => i);
        // Fisher–Yates shuffle.
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
        }
        // Avoid an immediate repeat at the bag boundary.
        if (n > 1 && this.bag[0] === this.lastIndex) {
          [this.bag[0], this.bag[1]] = [this.bag[1]!, this.bag[0]!];
        }
      }
      const i = this.bag.shift()!;
      this.lastIndex = i;
      return i;
    }

    // 'no-repeat' — pick uniformly from the (n-1) variants that aren't the
    // previous one. With n=2 this alternates strictly; with larger n it
    // looks effectively random but never the same twice in a row.
    let i = Math.floor(Math.random() * (n - 1));
    if (i >= this.lastIndex) i++;
    this.lastIndex = i;
    return i;
  }
}
