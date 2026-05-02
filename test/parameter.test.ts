import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Parameter', () => {
  it('caches parameters by name', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    const p1 = engine.parameter('intensity', 0.3);
    const p2 = engine.parameter('intensity');
    expect(p1).toBe(p2);
    expect(p1.value).toBe(0.3);
    await engine.close();
  });

  it('subscribers fire on set and on initial subscribe', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    const p = engine.parameter('x', 0.5);
    const seen: number[] = [];
    const off = p.subscribe((v) => seen.push(v));
    p.set(0.8);
    p.set(0.8); // dedup
    p.set(0.2);
    off();
    p.set(1);
    expect(seen).toEqual([0.5, 0.8, 0.2]);
    await engine.close();
  });

  it('bindTo maps [0..1] to [from..to] with curve', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    const p = engine.parameter('mix', 0);
    let captured = -1;
    p.bindTo((v) => { captured = v; }, { from: 100, to: 1100, curve: 'linear' });
    p.set(0.5);
    expect(captured).toBe(600);
    await engine.close();
  });
});

describe('Snapshot', () => {
  it('captures and applies bus levels with fade', async () => {
    const engine = createEngine({
      buses: { music: { level: 0.8 }, sfx: { level: 1 } },
    });
    await engine.unlock();
    const snap = engine.captureSnapshot('menu');

    engine.bus('music').level = 0.1;
    engine.bus('sfx').level = 0.2;

    await snap.apply({ fadeMs: 0 });
    expect(engine.bus('music').level).toBeCloseTo(0.8);
    expect(engine.bus('sfx').level).toBeCloseTo(1);

    await engine.close();
  });
});
