import { describe, expect, it } from 'vitest';
import { BusNotFoundError, SoundNotFoundError, createEngine } from '../src/index';

describe('createEngine', () => {
  it('does not construct an AudioContext until unlock or play', () => {
    const constructed: { count: number } = { count: 0 };
    const Original = (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext;
    class Counting extends (Original as unknown as new () => AudioContext) {
      constructor() {
        super();
        constructed.count += 1;
      }
    }
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = Counting;

    try {
      const engine = createEngine({ buses: { music: { level: 0.5 } } });
      expect(engine.state).toBe('cold');
      expect(constructed.count).toBe(0);
    } finally {
      (globalThis as unknown as { AudioContext: unknown }).AudioContext = Original;
    }
  });

  it('unlock() transitions cold → unlocking → live and is idempotent', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    const states: string[] = [];
    engine.onStateChange((s) => states.push(s));

    const p1 = engine.unlock();
    const p2 = engine.unlock();
    await Promise.all([p1, p2]);

    expect(engine.state).toBe('live');
    expect(states).toContain('unlocking');
    expect(states).toContain('live');

    await engine.unlock();
    expect(engine.state).toBe('live');
    await engine.close();
  });

  it('exposes declared buses; throws on unknown ones', async () => {
    const engine = createEngine({ buses: { music: { level: 0.8 }, sfx: { level: 1 } } });
    await engine.unlock();

    expect(engine.bus('music').level).toBe(0.8);
    expect(engine.bus('sfx').level).toBe(1);
    expect(() => engine.bus('voice')).toThrow(BusNotFoundError);

    await engine.close();
  });

  it('loads a sound, plays a voice, voice end resolves', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sound = await engine.loadSound('coin', 'mock://coin.wav', { bus: 'sfx' });
    expect(sound.name).toBe('coin');

    const v = engine.sound('coin').play();
    expect(engine.activeVoices()).toContain(v);

    v.stop();
    await v.ended;
    expect(engine.activeVoices()).not.toContain(v);

    await engine.close();
  });

  it('throws SoundNotFoundError for unknown sound names', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    expect(() => engine.sound('missing')).toThrow(SoundNotFoundError);
    await engine.close();
  });

  it('bus.level setter clamps and updates without throwing', async () => {
    const engine = createEngine({ buses: { music: { level: 1 } } });
    await engine.unlock();
    const bus = engine.bus('music');
    bus.level = 0.25;
    expect(bus.level).toBe(0.25);
    bus.level = 1.5;
    expect(bus.level).toBe(1);
    bus.level = -1;
    expect(bus.level).toBe(0);
    await engine.close();
  });

  it('close() makes further unlock() throw EngineClosedError', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.close();
    expect(engine.state).toBe('closed');
    await expect(engine.unlock()).rejects.toThrow();
  });
});
