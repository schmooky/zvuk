import { useEffect, useRef, useState } from 'react';
import { type Engine, type EngineConfig, type EngineState, createEngine } from '@schmooky/zvuk';

/**
 * One engine per demo, lazy-constructed, closed on unmount.
 * StrictMode-safe: the engine is created from the first interaction, not
 * mount, so React's double-mount in dev doesn't create two contexts.
 */
export function useDemoEngine(config: EngineConfig) {
  const engineRef = useRef<Engine | null>(null);
  const configRef = useRef(config);
  const [state, setState] = useState<EngineState>('cold');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      void engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  function ensureEngine(): Engine {
    if (engineRef.current) return engineRef.current;
    const engine = createEngine(configRef.current);
    engine.onStateChange((s) => setState(s));
    engineRef.current = engine;
    return engine;
  }

  async function unlock(): Promise<Engine | null> {
    try {
      const engine = ensureEngine();
      await engine.unlock();
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
  // Two music beds for the Crossfade demo. MP3 fallback only — no codec
  // ladder until we transcode them via `npx zvuk transcode`.
  musicA: ['/audio/music-a.mp3'],
  musicB: ['/audio/music-b.mp3'],
  // Kenney digital-audio pack (CC0). Useful for arcade-flavoured one-shots.
  laser: ['/audio/laser1.ogg'],
  laserAlt: ['/audio/laser2.ogg'],
  powerUp: ['/audio/powerUp1.ogg'],
  powerUpAlt: ['/audio/powerUp2.ogg'],
  phaseJump: ['/audio/phaseJump1.ogg'],
  phaseJumpAlt: ['/audio/phaseJump2.ogg'],
  zap: ['/audio/zap1.ogg'],
  zapAlt: ['/audio/zap2.ogg'],
} as const;
