import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Variants.lastPick', () => {
  it('reports which take actually played', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const variants = await engine.loadVariants(
      'dice',
      [['mock://d1.wav'], ['mock://d2.wav'], ['mock://d3.wav'], ['mock://d4.wav']],
      { bus: 'sfx', strategy: 'no-repeat' },
    );

    expect(variants.lastPick).toBe(-1);

    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      const v = variants.play();
      seen.push(variants.lastPick);
      v.stop({ fade: 0 });
      await v.ended;
    }

    expect(seen).toHaveLength(12);
    for (const i of seen) expect(i).toBeGreaterThanOrEqual(0);
    for (const i of seen) expect(i).toBeLessThan(4);
    // no-repeat is the point: never the same take twice running.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);

    await engine.close();
  });

  it('follows playIndex too', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const variants = await engine.loadVariants('coin', [['mock://a.wav'], ['mock://b.wav']], {
      bus: 'sfx',
    });
    const v = variants.playIndex(1);
    expect(variants.lastPick).toBe(1);
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });
});
