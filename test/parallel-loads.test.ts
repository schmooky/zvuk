import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

/** Order in which fetches were started, to prove they overlap. */
function trackFetchOverlap() {
  let inFlight = 0;
  let peak = 0;
  const real = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (...args) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise((r) => setTimeout(r, 5));
      return await real(...(args as Parameters<typeof fetch>));
    } finally {
      inFlight--;
    }
  });
  return { peak: () => peak, restore: () => spy.mockRestore() };
}

describe('parallel asset loading', () => {
  it('loads intro, loop and outro together', async () => {
    const t = trackFetchOverlap();
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('theme', {
      intro: 'mock://intro.wav',
      loop: 'mock://loop.wav',
      outro: 'mock://outro.wav',
    });
    expect(t.peak()).toBe(3);
    t.restore();
    await engine.close();
  });

  it('loads variants in parallel, capped at the preload concurrency', async () => {
    const t = trackFetchOverlap();
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadVariants(
      'coin',
      ['mock://c1.wav', 'mock://c2.wav', 'mock://c3.wav', 'mock://c4.wav', 'mock://c5.wav', 'mock://c6.wav'],
      { bus: 'sfx' },
    );
    expect(t.peak()).toBeGreaterThan(1);
    expect(t.peak()).toBeLessThanOrEqual(4);
    t.restore();
    await engine.close();
  });
});
