import { bench, describe } from 'vitest';
import '../test/setup';
import { createEngine } from '../src/index';

describe('voice spawn rate', () => {
  bench(
    'spawn + immediate stop, 100 voices on one bus',
    async () => {
      const engine = createEngine({ buses: { sfx: { concurrency: { max: 1024 } } } });
      await engine.unlock();
      await engine.loadSound('coin', 'mock://coin.wav', { bus: 'sfx' });
      const voices = [];
      for (let i = 0; i < 100; i++) voices.push(engine.sound('coin').play());
      for (const v of voices) v.stop();
      await Promise.all(voices.map((v) => v.ended));
      await engine.close();
    },
    { iterations: 20 },
  );

  bench(
    'spawn into a stealing bus (max=4, oldest)',
    async () => {
      const engine = createEngine({
        buses: { sfx: { concurrency: { max: 4, steal: 'oldest' } } },
      });
      await engine.unlock();
      await engine.loadSound('coin', 'mock://coin.wav', { bus: 'sfx' });
      for (let i = 0; i < 32; i++) engine.sound('coin').play();
      for (const v of engine.activeVoices()) v.stop();
      await Promise.all(engine.activeVoices().map((v) => v.ended));
      await engine.close();
    },
    { iterations: 20 },
  );
});
