import { useEffect, useRef, useState } from 'react';
import type { BusConfig, Engine, EngineConfig, EngineState } from '@schmooky/zvuk';
import {
  applyBusConfig,
  getDemoEngine,
  getDemoState,
  stopVoicesOn,
  subscribeDemoState,
  unlockDemoEngine,
} from './sharedEngine';

/**
 * Hook onto the page's shared engine.
 *
 * The signature is unchanged from when every demo owned its own engine: pass
 * the bus shape you want to demonstrate, get back a ref, a state, and an
 * unlock. What changed underneath is that there is now one AudioContext, one
 * unlock gesture and one decode cache for the whole page.
 *
 * On unmount the hook stops whatever is still sounding on the buses this
 * demo declared. It cannot close the engine any more, because the engine
 * isn't its to close.
 */
export function useDemoEngine(config: EngineConfig) {
  const engineRef = useRef<Engine | null>(null);
  const configRef = useRef(config);
  const [state, setState] = useState<EngineState>(getDemoState());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeDemoState(setState);
    setState(getDemoState());
    const buses = Object.keys(configRef.current.buses ?? {});
    return () => {
      unsubscribe();
      stopVoicesOn(buses);
    };
  }, []);

  function ensureEngine(): Engine {
    const engine = getDemoEngine();
    engineRef.current = engine;
    return engine;
  }

  async function unlock(): Promise<Engine | null> {
    try {
      const engine = await unlockDemoEngine();
      engineRef.current = engine;
      // Levels and concurrency are per-demo; apply them once the graph exists.
      applyBusConfig(configRef.current.buses as Record<string, BusConfig> | undefined);
      return engine;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  return { engine: engineRef, state, error, setError, ensureEngine, unlock };
}

/**
 * Decode a user-supplied audio File and (re)register it under `name` via
 * `createSound`. We decode the bytes ourselves and hand the engine a finished
 * AudioBuffer — bypassing the codec-ladder / MIME guessing that a `blob:` URL
 * would trip on. `decodeAudioData` sniffs the bytes, so anything the browser
 * can decode (wav / mp3 / ogg / webm / m4a / flac …) just works. Returns the
 * decoded buffer for demos that also need raw sample access.
 */
export async function decodeFileToSound(
  engine: Engine,
  name: string,
  file: File,
  bus?: string,
): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  const buffer = await engine.context.decodeAudioData(data);
  if (engine.hasSound(name)) engine.removeSound(name);
  engine.createSound(name, buffer, bus ? { bus } : {});
  return buffer;
}

/**
 * The demo sound set.
 *
 * Everything here is normalised to a consistent loudness with a -1.5 dBTP
 * ceiling: the raw set spanned 22 dB of peak level and four files were
 * already clipping, which on a shared bus is unusable. One-shots sit at
 * -18 LUFS, beds 6 dB or more under, because beds play underneath things.
 */
export const SAMPLES = {
  /**
   * Buffered beds. Arbitrary 12 s trims out of longer loops, so the seam is
   * masked at runtime with `loopCrossfade` — which is a feature these demos
   * want to be showing anyway.
   */
  stream: ['/audio/stream.webm', '/audio/stream.m4a'],
  fire: ['/audio/fire.webm', '/audio/fire.m4a'],

  /**
   * Long ambience, streamed rather than decoded. 68 and 72 seconds, which is
   * about 24 MB of PCM each if you decode them, and the reason `loadStream`
   * exists. Left at full length because they are seamless loops and a trim
   * would put a click at the loop point.
   */
  rain: ['/audio/rain.webm', '/audio/rain.m4a'],
  birds: ['/audio/birds.webm', '/audio/birds.m4a'],

  /** Pickups and stingers. */
  gem: ['/audio/gem.webm', '/audio/gem.m4a'],
  heart: ['/audio/heart.webm', '/audio/heart.m4a'],
  chime: ['/audio/chime.webm', '/audio/chime.m4a'],
  chimeQuick: ['/audio/chime-quick.webm', '/audio/chime-quick.m4a'],
  bells1: ['/audio/bells-1.webm', '/audio/bells-1.m4a'],
  bells2: ['/audio/bells-2.webm', '/audio/bells-2.m4a'],

  /** Single takes, for demos that want one specific hit. */
  chips1: ['/audio/chips-1.webm', '/audio/chips-1.m4a'],
  chips2: ['/audio/chips-2.webm', '/audio/chips-2.m4a'],
  diceRoll1: ['/audio/dice-roll-1.webm', '/audio/dice-roll-1.m4a'],
  diceShake2: ['/audio/dice-shake-2.webm', '/audio/dice-shake-2.m4a'],
} as const;

/**
 * Alternate takes of the same action, for `engine.loadVariants`. A pure
 * random picker repeats itself often enough to sound broken, which is the
 * whole reason the strategies exist.
 */
export const VARIANTS = {
  diceRoll: [
    ['/audio/dice-roll-1.webm', '/audio/dice-roll-1.m4a'],
    ['/audio/dice-roll-2.webm', '/audio/dice-roll-2.m4a'],
    ['/audio/dice-roll-3.webm', '/audio/dice-roll-3.m4a'],
    ['/audio/dice-roll-4.webm', '/audio/dice-roll-4.m4a'],
  ],
  chips: [
    ['/audio/chips-1.webm', '/audio/chips-1.m4a'],
    ['/audio/chips-2.webm', '/audio/chips-2.m4a'],
    ['/audio/chips-3.webm', '/audio/chips-3.m4a'],
  ],
  diceShake: [
    ['/audio/dice-shake-2.webm', '/audio/dice-shake-2.m4a'],
    ['/audio/dice-shake-3.webm', '/audio/dice-shake-3.m4a'],
    ['/audio/dice-shake-4.webm', '/audio/dice-shake-4.m4a'],
  ],
} as const;

/** Crossfade window used by the bed demos to hide an arbitrary trim point. */
export const BED_LOOP_CROSSFADE = 0.4;
