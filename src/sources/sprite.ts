import { SpriteRegionNotFoundError } from '../errors';
import type { PlayOptions, SoundLimit } from '../types';
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
    validateRegions(name, this.regions, sound.duration);
  }

  /** Cap simultaneous voices of this sprite (all regions) and/or set a cooldown. */
  setLimit(limit: SoundLimit | null): void {
    this.sound.setLimit(limit);
  }

  /** Duration of the sprite's whole buffer in seconds. */
  get duration(): number {
    return this.sound.duration;
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
    if (!r) throw new SpriteRegionNotFoundError(this.name, name, Object.keys(this.regions));
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

/**
 * Regions are checked once at load. A region past the end of the buffer used
 * to play silence or a truncated tail with no hint why.
 */
function validateRegions(sprite: string, regions: SpriteMap, bufferDuration: number): void {
  // Encoders pad a few ms at the end; allow a frame's worth of slack.
  const slack = 0.05;
  for (const [key, r] of Object.entries(regions)) {
    const bad =
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.duration) ||
      r.start < 0 ||
      r.duration <= 0 ||
      r.start + r.duration > bufferDuration + slack;
    if (bad) {
      throw new RangeError(
        `Sprite "${sprite}" region "${key}" (start ${r.start}, duration ${r.duration}) does not fit ` +
          `the ${bufferDuration.toFixed(3)} s buffer. Regions need start >= 0, duration > 0 and ` +
          'start + duration within the buffer.',
      );
    }
  }
}
