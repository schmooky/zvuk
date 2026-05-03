import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Master limiter', () => {
  it('creates engine with limiter config without errors', async () => {
    const engine = createEngine({
      buses: { music: {} },
      master: { headroom: -3, limiter: { threshold: -1, ratio: 20 } },
    });
    await engine.unlock();
    await engine.close();
  });
});

describe('Crossfade helper', () => {
  it('fades incoming voice up, outgoing voices down', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('intro', 'mock://intro.wav', { bus: 'music' });
    await engine.loadSound('main', 'mock://main.wav', { bus: 'music' });
    const old = engine.sound('intro').play({ loop: true });
    const fresh = engine.crossfade('intro', 'main', { ms: 50 });
    expect(fresh.sourceName).toBe('main');
    await new Promise((r) => setTimeout(r, 100));
    await expect(old.ended).resolves.toBeUndefined();
    fresh.stop();
    await fresh.ended;
    await engine.close();
  });
});
