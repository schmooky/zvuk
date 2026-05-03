import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Sprite', () => {
  it('loadSprite registers a sprite with named regions', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sprite = await engine.loadSprite(
      'cascade',
      'mock://cascade.wav',
      {
        small: { start: 0, duration: 0.2 },
        medium: { start: 0.25, duration: 0.4 },
        big: { start: 0.7, duration: 0.6 },
      },
      { bus: 'sfx' },
    );
    expect(sprite.name).toBe('cascade');
    expect(sprite.list()).toEqual(['small', 'medium', 'big']);
    expect(sprite.has('small')).toBe(true);
    expect(sprite.has('huge')).toBe(false);
    expect(engine.hasSprite('cascade')).toBe(true);

    const v = engine.sprite('cascade').play('medium');
    expect(v.bus).toBe('sfx');
    v.stop();
    await v.ended;
    await engine.close();
  });

  it('throws on missing region', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sprite = await engine.loadSprite(
      'ui',
      'mock://ui.wav',
      { click: { start: 0, duration: 0.1 } },
      { bus: 'sfx' },
    );
    expect(() => sprite.play('open')).toThrow();
    await engine.close();
  });
});
