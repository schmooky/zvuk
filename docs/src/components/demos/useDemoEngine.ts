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

export const SAMPLES = {
  music: ['/audio/card-shuffle.webm', '/audio/card-shuffle.m4a'],
  chip: ['/audio/chip-lay-1.webm', '/audio/chip-lay-1.m4a'],
  collide: ['/audio/chips-collide-1.webm', '/audio/chips-collide-1.m4a'],
  dice: ['/audio/dice-throw-1.webm', '/audio/dice-throw-1.m4a'],
  card: ['/audio/card-place-1.webm', '/audio/card-place-1.m4a'],
  slide: ['/audio/card-slide-1.webm', '/audio/card-slide-1.m4a'],
  // Two music beds for the Crossfade demo, trimmed to 60 s and streamed
  // rather than decoded. The pair used to ship as 7.6 MB of MP3 — nearly the
  // whole audio payload of the site — and decoding three minutes of stereo
  // costs tens of megabytes of PCM before a note plays.
  musicA: ['/audio/music-a.webm', '/audio/music-a.m4a'],
  musicB: ['/audio/music-b.webm', '/audio/music-b.m4a'],
  // Kenney digital-audio pack (CC0). Useful for arcade-flavoured one-shots.
  // These shipped as .ogg only, which Safari cannot decode — so eight demos
  // threw DecodeError on every Apple device.
  laser: ['/audio/laser1.webm', '/audio/laser1.m4a'],
  laserAlt: ['/audio/laser2.webm', '/audio/laser2.m4a'],
  powerUp: ['/audio/powerUp1.webm', '/audio/powerUp1.m4a'],
  powerUpAlt: ['/audio/powerUp2.webm', '/audio/powerUp2.m4a'],
  phaseJump: ['/audio/phaseJump1.webm', '/audio/phaseJump1.m4a'],
  phaseJumpAlt: ['/audio/phaseJump2.webm', '/audio/phaseJump2.m4a'],
  zap: ['/audio/zap1.webm', '/audio/zap1.m4a'],
  zapAlt: ['/audio/zap2.webm', '/audio/zap2.m4a'],
} as const;
