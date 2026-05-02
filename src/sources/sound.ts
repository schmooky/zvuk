import type { Spatializer } from '../spatial/spatializer';
import type { PlayOptions } from '../types';
import { Voice } from './voice';

export interface SoundDeps {
  ctx: AudioContext;
  buffer: AudioBuffer;
  defaultBus: string;
  resolveBusInput: (name: string) => AudioNode;
  resolveSpatializer?: (busName: string, options: PlayOptions['spatializer']) => Spatializer | undefined;
  trackVoice: (v: Voice, bus: string) => void;
  releaseVoice: (v: Voice, bus: string) => void;
  applyConcurrency?: (v: Voice, bus: string) => boolean;
}

/**
 * A loaded sample — owns one decoded AudioBuffer, spawns Voices on play().
 *
 * Sound is created via engine.loadSound() / bank load; constructor is
 * package-private.
 */
export class Sound {
  readonly name: string;
  private deps: SoundDeps;

  constructor(name: string, deps: SoundDeps) {
    this.name = name;
    this.deps = deps;
  }

  get duration(): number {
    return this.deps.buffer.duration;
  }

  play(options: PlayOptions = {}): Voice {
    const bus = options.bus ?? this.deps.defaultBus;
    const busInput = this.deps.resolveBusInput(bus);
    const spatializer = this.deps.resolveSpatializer?.(bus, options.spatializer);
    const destination = spatializer ? spatializer.connectInto(busInput) : busInput;
    const voice = new Voice({
      ctx: this.deps.ctx,
      buffer: this.deps.buffer,
      destination,
      options: { ...options, bus },
      onEnded: (v) => {
        this.deps.releaseVoice(v, bus);
        spatializer?.dispose();
      },
    });
    this.deps.trackVoice(voice, bus);
    const accepted = this.deps.applyConcurrency?.(voice, bus) ?? true;
    if (!accepted) {
      voice.stop();
    }
    return voice;
  }
}
