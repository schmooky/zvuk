import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('StreamSound', () => {
  it('registers a stream and is reachable via engine.stream()', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const stream = engine.loadStream('intro', 'mock://intro.m4a', { bus: 'music' });
    expect(stream.name).toBe('intro');
    expect(engine.hasStream('intro')).toBe(true);
    expect(engine.stream('intro')).toBe(stream);
    await engine.close();
  });

  it('exposes the lazy-construction guards (no DOM, no-op shell)', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const stream = engine.loadStream('intro', 'mock://intro.m4a', { bus: 'music' });
    // Without an HTMLAudioElement (no `Audio` constructor in this env),
    // currentTime/duration default to 0 and play() resolves silently.
    expect(stream.currentTime).toBe(0);
    expect(stream.duration).toBe(0);
    await stream.play({ volume: 0.5 });
    stream.pause();
    stream.stop();
    stream.dispose();
    await engine.close();
  });

  it('suggests close stream names on miss', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    engine.loadStream('intro', 'mock://intro.m4a', { bus: 'music' });
    try {
      engine.stream('inrto');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('did you mean "intro"');
    }
    await engine.close();
  });
});
