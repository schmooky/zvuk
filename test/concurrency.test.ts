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

  it("steal: 'quietest' warns once and falls back to oldest until metering ships", async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 2, steal: 'quietest' } } },
    });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const a = engine.sound('hit').play();
      engine.sound('hit').play();
      engine.sound('hit').play();
      const bus = engine.bus('sfx');
      expect(bus.voiceCount).toBe(2);
      // Falls back to 'oldest' — `a` is gone.
      expect(bus.voices()).not.toContain(a);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0] ?? '').toContain("'quietest'");
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
