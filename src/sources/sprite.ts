import { SoundNotFoundError } from '../errors';
import type { PlayOptions } from '../types';
import type { Sound } from './sound';
import type { Voice } from './voice';

export interface SpriteRegion {
  /** Start offset within the buffer, in seconds. */
  start: number;
  /** Region duration in seconds. */
  duration: number;
  /** If true, looping plays this region back-to-back. Default false. */
  loop?: boolean;
}

export interface SpriteMap {
  [name: string]: SpriteRegion;
}

/**
 * One buffer, many named regions, one fetch.
 *
 * Use for cascades, UI variants, low-latency one-shots — anything where the
 * cost of N separate decodes outweighs the cost of N region offsets into a
 * single buffer. Built on top of an underlying Sound (the buffer); regions
 * are cooperative — overlapping regions just produce overlapping voices.
 */
export class Sprite {
  readonly name: string;
  private regions: SpriteMap;
  private sound: Sound;

  constructor(name: string, sound: Sound, regions: SpriteMap) {
    this.name = name;
    this.sound = sound;
    this.regions = { ...regions };
  }

  /** Region names defined on this sprite. */
  list(): readonly string[] {
    return Object.keys(this.regions);
  }

  has(region: string): boolean {
    return region in this.regions;
  }

  region(name: string): SpriteRegion {
    const r = this.regions[name];
    if (!r) throw new SoundNotFoundError(`${this.name}#${name}`);
    return r;
  }

  /**
   * Spawn a Voice playing the named region. The voice stops itself after
   * `region.duration` seconds via an internal scheduleAt — the underlying
   * AudioBufferSourceNode is one big buffer, so we can't rely on its
   * natural-end event for region timing.
   */
  play(region: string, options: SpriteRegionPlayOptions = {}): Voice {
    const r = this.region(region);
    const loop = options.loop ?? r.loop ?? false;
    const voice = this.sound.play({
      ...options,
      loop,
      offset: r.start,
      duration: r.duration,
      loopStart: r.start,
      loopEnd: r.start + r.duration,
    } as PlayOptions);
    return voice;
  }
}

export type SpriteRegionPlayOptions = Omit<PlayOptions, 'loop'> & { loop?: boolean };
