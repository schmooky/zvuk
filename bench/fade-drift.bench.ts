import { bench, describe } from 'vitest';
import '../test/setup';
import { createEngine } from '../src/index';

describe('fade event drift', () => {
  bench(
    '20 chained 50ms fades on a single bus',
    async () => {
      const engine = createEngine({ buses: { music: {} } });
      await engine.unlock();
      const bus = engine.bus('music');
      for (let i = 0; i < 20; i++) {
        await bus.fadeTo(i % 2 === 0 ? 0 : 1, 0.05, 'equal-power');
      }
      await engine.close();
    },
    { iterations: 4 },
  );
});
