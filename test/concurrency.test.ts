import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

describe('Bus concurrency', () => {
  it('caps voice count at max with default oldest-steal', async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 2 } } },
    });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });

    const a = engine.sound('hit').play();
    const b = engine.sound('hit').play();
    const c = engine.sound('hit').play();

    const bus = engine.bus('sfx');
    expect(bus.voiceCount).toBe(2);
    // The oldest (a) should have been stolen.
    expect(bus.voices()).not.toContain(a);
    expect(bus.voices()).toContain(b);
    expect(bus.voices()).toContain(c);

    await engine.close();
  });

  it("steal: 'none' rejects new voices once max is hit", async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 1, steal: 'none' } } },
    });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });

    engine.sound('hit').play();
    const rejected = engine.sound('hit').play();
    await rejected.ended;

    const bus = engine.bus('sfx');
    expect(bus.voiceCount).toBe(1);
    expect(bus.voices()).not.toContain(rejected);

    await engine.close();
  });

  it("steal: 'quietest' picks the quietest voice — no console warnings", async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 2, steal: 'quietest' } } },
    });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // Two voices with deterministically different levels. Ranking reads
      // the voice's own gain unless a meter tap already exists, so setting
      // volume is the production path.
      const loud = engine.sound('hit').play({ volume: 0.9 });
      const quiet = engine.sound('hit').play({ volume: 0.01 });

      // Spawn a third voice — must steal the quietest, not the oldest.
      engine.sound('hit').play();

      const bus = engine.bus('sfx');
      expect(bus.voiceCount).toBe(2);
      expect(bus.voices()).toContain(loud);
      expect(bus.voices()).not.toContain(quiet);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }

    await engine.close();
  });

  it("steal: 'lowest-priority' protects high-priority voices", async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 2, steal: 'lowest-priority' } } },
    });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });

    const high = engine.sound('hit').play({ priority: 10 });
    const low = engine.sound('hit').play({ priority: 0 });
    engine.sound('hit').play({ priority: 5 });

    const bus = engine.bus('sfx');
    expect(bus.voiceCount).toBe(2);
    expect(bus.voices()).toContain(high);
    expect(bus.voices()).not.toContain(low);

    await engine.close();
  });
});
