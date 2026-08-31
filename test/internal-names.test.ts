import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * Sprites and variant bundles load their parts under internal registry keys.
 * Those keys used to land in the public sound registry, in did-you-mean
 * suggestions, and on voice.sourceName — which broke engine.crossfade for
 * anything loaded as a variant.
 */
describe('internal registry names', () => {
  it('reports the public name on variant voices', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadVariants('coin', ['mock://c1.wav', 'mock://c2.wav'], { bus: 'sfx' });

    const v = engine.variants('coin').play();
    expect(v.sourceName).toBe('coin');
    expect(engine.hasSound('__variant:coin:0')).toBe(false);

    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('reports the public name on sprite voices', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSprite('ui', 'mock://ui.wav', { click: { start: 0, duration: 0.05 } }, { bus: 'sfx' });

    const v = engine.sprite('ui').play('click');
    expect(v.sourceName).toBe('ui');
    expect(engine.hasSound('__sprite:ui')).toBe(false);

    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('does not offer internal names as did-you-mean suggestions', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSprite('ui', 'mock://ui.wav', { click: { start: 0, duration: 0.05 } }, { bus: 'sfx' });

    expect(() => engine.sound('__sprite:ui')).toThrow(/is not loaded/);
    try {
      engine.sound('__sprite:ui');
    } catch (e) {
      expect((e as Error).message).not.toContain('Did you mean');
    }
    await engine.close();
  });
});
