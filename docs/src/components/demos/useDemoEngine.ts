import { useEffect, useRef, useState } from 'react';
import { type Engine, type EngineConfig, createEngine } from 'zvuk';

/**
 * One engine per demo, lazy-constructed, closed on unmount.
 * StrictMode-safe: the engine is created from the first interaction, not
 * mount, so React's double-mount in dev doesn't create two contexts.
 */
export function useDemoEngine(config: EngineConfig) {
  const engineRef = useRef<Engine | null>(null);
  const configRef = useRef(config);
  const [state, setState] = useState<'cold' | 'unlocking' | 'live' | 'closed'>('cold');
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

  return { engine: engineRef, state, error, ensureEngine, unlock };
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
