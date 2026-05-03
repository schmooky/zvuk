import { bench, describe } from 'vitest';
import '../test/setup';
import { createEngine } from '../src/index';

describe('decode + cache hit', () => {
  bench(
    'first-time decode',
    async () => {
      const engine = createEngine({ buses: { sfx: {} } });
      await engine.unlock();
      // unique URL per iteration to bypass the LRU cache
      const url = `mock://decode-${Math.random().toString(36).slice(2)}.wav`;
      await engine.loadSound('s', url, { bus: 'sfx' });
      await engine.close();
    },
    { iterations: 50 },
  );

  bench(
    'cache hit — same URL, fresh engine',
    async () => {
      const engine = createEngine({ buses: { sfx: {} } });
      await engine.unlock();
      await engine.loadSound('s1', 'mock://stable.wav', { bus: 'sfx' });
      await engine.loadSound('s2', 'mock://stable.wav', { bus: 'sfx' });
      await engine.close();
    },
    { iterations: 50 },
  );
});
