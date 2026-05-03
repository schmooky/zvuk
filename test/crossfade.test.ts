import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * Crossfade should only fade out voices whose sourceName matches `from`.
 * Other-source voices on the same bus must be left alone — the helper is
 * "swap this music track", not "kill everything else".
 */
describe('Engine.crossfade source-filter precision', () => {
  it('only stops voices whose sourceName matches `from`', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('intro', 'mock://intro.wav', { bus: 'music' });
    await engine.loadSound('main', 'mock://main.wav', { bus: 'music' });
    await engine.loadSound('ambient', 'mock://ambient.wav', { bus: 'music' });

    const intro = engine.sound('intro').play({ loop: true });
    const ambient = engine.sound('ambient').play({ loop: true });

    expect(intro.sourceName).toBe('intro');
    expect(ambient.sourceName).toBe('ambient');

    const fresh = engine.crossfade('intro', 'main', { ms: 30 });
    expect(fresh.sourceName).toBe('main');

    await new Promise((r) => setTimeout(r, 80));

    // intro should have been stopped by the crossfade.
    await expect(intro.ended).resolves.toBeUndefined();
    // ambient must still be live.
    expect(engine.activeVoices()).toContain(ambient);

    fresh.stop();
    ambient.stop();
    await Promise.all([fresh.ended, ambient.ended]);
    await engine.close();
  });
});
