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
} as const;
