import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Voice lifecycle', () => {
  it('fires onEnded exactly once on natural end via stop()', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });

    let endedCount = 0;
    const v = engine.sound('blip').play();
    void v.ended.then(() => endedCount++);
    v.stop();
    await v.ended;
    // Drain any pending microtasks so a buggy double-resolve would surface.
    await Promise.resolve();
    await Promise.resolve();

    expect(endedCount).toBe(1);
    expect(engine.activeVoices().length).toBe(0);
    await engine.close();
  });

  it('releases voices from engine.activeVoices() after they end', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });

    const voices = Array.from({ length: 25 }, () => engine.sound('blip').play());
    expect(engine.activeVoices().length).toBe(25);

    for (const v of voices) v.stop();
    await Promise.all(voices.map((v) => v.ended));
    // Microtask flush — activeVoices removal happens via .ended.then.
    await Promise.resolve();

    expect(engine.activeVoices().length).toBe(0);
    await engine.close();
  });

  it('aborting via signal removes the voice from active tracking', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });

    const ctrl = new AbortController();
    const v = engine.sound('blip').play({ signal: ctrl.signal });
    expect(engine.activeVoices().length).toBe(1);

    ctrl.abort();
    await v.ended;
    await Promise.resolve();

    expect(engine.activeVoices().length).toBe(0);
    await engine.close();
  });

  it('pause + resume + natural end fires onEnded once', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });

    let endedCount = 0;
    const v = engine.sound('blip').play();
    void v.ended.then(() => endedCount++);

    v.pause();
    expect(v.isPaused).toBe(true);
    v.resume();
    expect(v.isPaused).toBe(false);

    v.stop();
    await v.ended;
    await Promise.resolve();
    await Promise.resolve();

    expect(endedCount).toBe(1);
    await engine.close();
  });
});
