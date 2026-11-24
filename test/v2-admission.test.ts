import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngine, type Voice } from '../src/index';

async function cues(v: Voice): Promise<string[]> {
  const out: string[] = [];
  for await (const c of v.cues()) out.push(c);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voice admission (B4, B5)', () => {
  it("steal: 'none' rejects before the source starts and never emits started", async () => {
    const engine = createEngine({ buses: { sfx: { concurrency: { max: 1, steal: 'none' } } } });
    await engine.unlock();
    await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });
    const spy = vi.spyOn(AudioContext.prototype, 'createBufferSource');

    const a = engine.sound('coin').play();
    const sourcesAfterFirst = spy.mock.calls.length;
    const b = engine.sound('coin').play();

    expect(a.rejected).toBe(false);
    expect(b.rejected).toBe(true);
    expect(b.isDone).toBe(true);
    // No source node was even built for the rejected voice.
    expect(spy.mock.calls.length).toBe(sourcesAfterFirst);
    expect(await cues(b)).toEqual(['ended']);
    await b.ended;
    expect(engine.bus('sfx').voiceCount).toBe(1);
    await engine.close();
  });

  it("'lowest-priority' rejects a new voice that ranks below every playing one", async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 1, steal: 'lowest-priority' } } },
    });
    await engine.unlock();
    await engine.loadSound('jackpot', 'mock://j.webm', { bus: 'sfx' });
    await engine.loadSound('coin', 'mock://c.webm', { bus: 'sfx' });

    const jackpot = engine.sound('jackpot').play({ priority: 10 });
    const coin = engine.sound('coin').play({ priority: 0 });
    expect(coin.rejected).toBe(true);
    expect(jackpot.isDone).toBe(false);

    // An equal or higher priority still steals.
    const big = engine.sound('coin').play({ priority: 10 });
    expect(big.rejected).toBe(false);
    expect(engine.bus('sfx').voices()).toEqual([big]);
    await engine.close();
  });

  it("'oldest' still steals the voice that started first", async () => {
    const engine = createEngine({ buses: { sfx: { concurrency: { max: 2 } } } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    const a = engine.sound('c').play();
    const b = engine.sound('c').play();
    const c = engine.sound('c').play();
    expect(engine.bus('sfx').voices()).toEqual([b, c]);
    await a.ended;
    await engine.close();
  });
});

describe('per-sound limits (F1)', () => {
  it('caps simultaneous voices of one sound, independent of the bus', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx', limit: { max: 2 } });
    await engine.loadSound('other', 'mock://o.webm', { bus: 'sfx' });
    const s = engine.sound('coin');
    const a = s.play();
    s.play();
    s.play();
    engine.sound('other').play();
    expect(a.isDone || a.rejected).toBe(false);
    expect(
      engine
        .bus('sfx')
        .voices()
        .filter((v) => v.sourceName === 'coin'),
    ).toHaveLength(2);
    expect(engine.bus('sfx').voiceCount).toBe(3);
    await engine.close();
  });

  it('rejects plays inside the cooldown window', async () => {
    vi.useFakeTimers();
    try {
      const engine = createEngine({ buses: { sfx: {} } });
      await engine.unlock();
      await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });
      const s = engine.sound('coin');
      s.setLimit({ cooldown: 0.1 });
      expect(s.play().rejected).toBe(false);
      expect(s.play().rejected).toBe(true);
      vi.advanceTimersByTime(120);
      expect(s.play().rejected).toBe(false);
      s.setLimit(null);
      expect(s.play().rejected).toBe(false);
      await engine.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a variants bundle shares one limit across every take', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const v = await engine.loadVariants('coin', ['mock://1.webm', 'mock://2.webm', 'mock://3.webm'], {
      bus: 'sfx',
      limit: { max: 2, steal: 'none' },
    });
    const results = [v.play(), v.play(), v.play(), v.play()];
    expect(results.filter((r) => !r.rejected)).toHaveLength(2);
    v.setLimit({ max: 3, steal: 'none' });
    expect(v.play().rejected).toBe(false);
    expect(v.soundLimit.max).toBe(3);
    await engine.close();
  });

  it('a sprite limit covers all of its regions', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sp = await engine.loadSprite(
      'ui',
      'mock://ui.webm',
      { a: { start: 0, duration: 0.2 }, b: { start: 0.3, duration: 0.2 } },
      { bus: 'sfx', limit: { max: 1, steal: 'none' } },
    );
    expect(sp.play('a').rejected).toBe(false);
    expect(sp.play('b').rejected).toBe(true);
    await engine.close();
  });
});

describe('variant picks (B6, F2)', () => {
  it("'no-repeat' can open with variant 0", async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const v = await engine.loadVariants('c', ['mock://a.webm', 'mock://b.webm', 'mock://c.webm'], {
      bus: 'sfx',
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    v.play();
    expect(v.lastPick).toBe(0);
    // And never repeats.
    v.play();
    expect(v.lastPick).not.toBe(0);
    await engine.close();
  });

  it('a one-take bundle records lastPick', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const v = await engine.loadVariants('c', ['mock://a.webm'], { bus: 'sfx' });
    expect(v.lastPick).toBe(-1);
    v.play();
    expect(v.lastPick).toBe(0);
    await engine.close();
  });

  it('weights skew random picks and a zero weight never plays', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const v = await engine.loadVariants('c', ['mock://a.webm', 'mock://b.webm', 'mock://c.webm'], {
      bus: 'sfx',
      strategy: 'random',
      weights: [8, 2, 0],
    });
    const counts = [0, 0, 0];
    for (let i = 0; i < 2000; i++) {
      v.play().stop({ fade: 0 });
      counts[v.lastPick]!++;
    }
    expect(counts[2]).toBe(0);
    expect(counts[0]! / counts[1]!).toBeGreaterThan(2.5);
    expect(counts[0]! / counts[1]!).toBeLessThan(6);
    await engine.close();
  });

  it('shuffle-bag holds round(weight) copies of each take', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const v = await engine.loadVariants('c', ['mock://a.webm', 'mock://b.webm'], {
      bus: 'sfx',
      strategy: 'shuffle-bag',
      weights: [3, 1],
    });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      v.play().stop({ fade: 0 });
      seen.push(v.lastPick);
    }
    expect(seen.filter((i) => i === 0)).toHaveLength(3);
    expect(seen.filter((i) => i === 1)).toHaveLength(1);
    await engine.close();
  });
});

describe('createSound limit', () => {
  it('accepts a limit through the public Engine type', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const buf = engine.context.createBuffer(1, 4410, 44100);
    const s = engine.createSound('tone', buf, { bus: 'sfx', limit: { max: 1, steal: 'none' } });
    expect(s.play().rejected).toBe(false);
    expect(s.play().rejected).toBe(true);
    await engine.close();
  });
});
