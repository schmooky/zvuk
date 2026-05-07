import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

describe('loopCrossfade', () => {
  it('default behaviour is unchanged — native source.loop drives the loop when loopCrossfade is unset', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });

    const v = engine.sound('bed').play({ loop: true });
    // Single, native-loop source path is in use; the crossfade chain
    // shouldn't fire. Smoke-test stop() doesn't crash.
    v.stop();
    await engine.close();
  });

  it('loopCrossfade > 0 with loop=true spawns the chain (multiple sources, source.loop===false)', async () => {
    const createSpy = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });

    const before = createSpy.mock.calls.length;
    const v = engine.sound('bed').play({ loop: true, loopCrossfade: 0.05 });
    const after = createSpy.mock.calls.length;
    // First segment is spawned synchronously in the constructor.
    expect(after - before).toBeGreaterThanOrEqual(1);

    // The first source's `loop` flag is false in crossfade mode — the chain
    // owns looping by re-spawning sources at the boundary.
    const firstSource = createSpy.mock.results[before]?.value as unknown as {
      loop: boolean;
    };
    expect(firstSource.loop).toBe(false);

    v.stop({ fade: 0 });
    await v.ended;
    createSpy.mockRestore();
    await engine.close();
  });

  it('falls back silently to native loop when the region is shorter than 2× the crossfade', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });

    // 0.5 s region vs. 1 s crossfade → fall back. No console.warn — this is
    // by design; the option is off-by-default already and is documented as a
    // silent no-op when the region is too short.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v = engine.sound('bed').play({
      loop: true,
      loopStart: 0,
      loopEnd: 0.5,
      loopCrossfade: 1,
    });
    expect(warn).not.toHaveBeenCalled();
    v.stop();
    warn.mockRestore();
    await engine.close();
  });

  it('stop() during crossfade tears down every live source without throwing', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });
    const v = engine.sound('bed').play({ loop: true, loopCrossfade: 0.05 });
    expect(() => v.stop()).not.toThrow();
    await v.ended;
    await engine.close();
  });

  it('loopCrossfade is a no-op when loop is false', async () => {
    const createSpy = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });

    const before = createSpy.mock.calls.length;
    const v = engine.sound('bed').play({ loop: false, loopCrossfade: 0.05 });
    // Single-source path: exactly one createBufferSource call attributable
    // to this voice.
    expect(createSpy.mock.calls.length - before).toBe(1);
    v.stop({ fade: 0 });
    await v.ended;
    createSpy.mockRestore();
    await engine.close();
  });
});
