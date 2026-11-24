import type { Bus } from '../mixer/bus';
import { planSteal, type StealPlan, type VoiceCandidate } from '../mixer/steal';
import type { Spatializer } from '../spatial/spatializer';
import type { PlayOptions, SoundLimit } from '../types';
import { Voice } from './voice';

const ADMIT: StealPlan = { reject: false, victim: null };

/**
 * Per-sound voice limit and retrigger cooldown. One instance can be shared:
 * a variants bundle hands the same limit to every variant, so `max: 3` caps
 * the bundle, not each take.
 *
 * @internal
 */
export class VoiceLimit {
  private config: SoundLimit;
  private voices = new Set<Voice>();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(config: SoundLimit = {}) {
    this.config = { ...config };
  }

  get current(): Readonly<SoundLimit> {
    return this.config;
  }

  set(config: SoundLimit | null): void {
    this.config = { ...(config ?? {}) };
  }

  get count(): number {
    return this.voices.size;
  }

  /** Plan a start at audio time `at`. Pure: stops nothing. */
  plan(at: number, candidate: VoiceCandidate): StealPlan {
    const { cooldown = 0, max, steal = 'oldest' } = this.config;
    if (cooldown > 0 && at - this.lastStart < cooldown) return { reject: true, victim: null };
    if (max == null) return ADMIT;
    return planSteal(this.voices, this.voices.size, max, steal, candidate);
  }

  admit(v: Voice, at: number): void {
    this.voices.add(v);
    this.lastStart = Math.max(this.lastStart, at);
    void v.ended.then(() => this.voices.delete(v));
  }

  release(v: Voice): void {
    this.voices.delete(v);
  }
}

export interface SoundDeps {
  ctx: AudioContext;
  buffer: AudioBuffer;
  defaultBus: string;
  resolveBusInput: (name: string) => AudioNode;
  resolveSpatializer?: (busName: string, options: PlayOptions['spatializer']) => Spatializer | undefined;
  trackVoice: (v: Voice, bus: string) => void;
  releaseVoice: (v: Voice, bus: string) => void;
  /** Bus concurrency decision for a voice that doesn't exist yet. */
  planBus?: (bus: string, candidate: VoiceCandidate) => StealPlan;
  /** Look up the bus a `duck` option names. */
  resolveBus?: (name: string) => Bus;
  /** Shared per-sound limit. */
  limit?: VoiceLimit;
  /** Engine-level default click-free fade for voice.stop() (seconds). */
  defaultStopFade?: number;
  /**
   * Name reported on spawned voices, when it differs from the registry key.
   * Sprites and variant bundles register under internal keys; their voices
   * should still say which public asset they came from so `engine.crossfade`
   * can find them.
   */
  sourceName?: string;
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
  private limit: VoiceLimit;

  constructor(name: string, deps: SoundDeps) {
    this.name = name;
    this.deps = deps;
    this.limit = deps.limit ?? new VoiceLimit();
  }

  get duration(): number {
    return this.deps.buffer.duration;
  }

  /** The decoded buffer every voice of this sound plays. */
  get buffer(): AudioBuffer {
    return this.deps.buffer;
  }

  /**
   * Cap simultaneous voices of this sound and/or set a retrigger cooldown.
   * Pass `null` to remove the limit. On a sound that belongs to a variants
   * bundle this changes the bundle's shared limit.
   */
  setLimit(limit: SoundLimit | null): void {
    this.limit.set(limit);
  }

  /** The current limit (empty object when unlimited). */
  get soundLimit(): Readonly<SoundLimit> {
    return this.limit.current;
  }

  play(options: PlayOptions = {}): Voice {
    const bus = options.bus ?? this.deps.defaultBus;
    const busInput = this.deps.resolveBusInput(bus);
    const ctx = this.deps.ctx;
    const now = ctx.currentTime;
    const at = options.at != null && Number.isFinite(options.at) && options.at > now ? options.at : now;
    const candidate: VoiceCandidate = { priority: options.priority ?? 0 };

    // Decide before anything starts. Both limits are planned before either
    // steals, so a voice the bus would refuse doesn't cost a victim on the
    // sound's own limit first.
    const soundPlan = this.limit.plan(at, candidate);
    const busPlan = soundPlan.reject ? ADMIT : (this.deps.planBus?.(bus, candidate) ?? ADMIT);
    if (soundPlan.reject || busPlan.reject) {
      return new Voice({
        ctx,
        buffer: this.deps.buffer,
        destination: busInput,
        options: { ...options, bus },
        sourceName: this.deps.sourceName ?? this.name,
        rejected: true,
        onEnded: () => {},
      });
    }
    for (const victim of new Set([soundPlan.victim, busPlan.victim])) {
      if (!victim) continue;
      victim.stop();
      // Deregister synchronously — the victim's own end fires a turn later,
      // and the limit has to read true the instant play() returns.
      if (victim.bus) this.deps.releaseVoice(victim, victim.bus);
      this.limit.release(victim);
    }

    const spatializer = this.deps.resolveSpatializer?.(bus, options.spatializer);
    const destination = spatializer ? spatializer.connectInto(busInput) : busInput;
    const voice = new Voice({
      ctx,
      buffer: this.deps.buffer,
      destination,
      options: { ...options, bus },
      spatializer,
      sourceName: this.deps.sourceName ?? this.name,
      defaultStopFade: this.deps.defaultStopFade,
      onEnded: (v) => {
        this.deps.releaseVoice(v, bus);
        spatializer?.dispose();
      },
    });
    this.deps.trackVoice(voice, bus);
    this.limit.admit(voice, at);

    if (options.duck && this.deps.resolveBus) {
      const target = this.deps.resolveBus(options.duck.bus);
      const release = target.duck(options.duck, voice.startedAt);
      void voice.ended.then(release);
    }
    return voice;
  }
}
