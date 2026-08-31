import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * A looping sprite region is bounded by the source node's own
 * loopStart/loopEnd. Arming the region stop-timer on top of that stopped
 * the voice after a single pass, which made SpriteRegion.loop documented
 * but non-functional.
 */
describe('Sprite region looping', () => {
  it('keeps a looping region alive past one pass', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSprite(
      'ui',
      'mock://ui.wav',
      { hum: { start: 0, duration: 0.04, loop: true } },
      { bus: 'sfx' },
    );

    const v = engine.sprite('ui').play('hum');
    let ended = false;
    void v.ended.then(() => {
      ended = true;
    });

    await new Promise((r) => setTimeout(r, 160));
    expect(ended).toBe(false);
    expect(engine.activeVoices()).toContain(v);

    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('still stops a non-looping region after its duration', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSprite('ui', 'mock://ui.wav', { blip: { start: 0, duration: 0.04 } }, { bus: 'sfx' });

    const v = engine.sprite('ui').play('blip');
    await v.ended;
    expect(engine.activeVoices()).not.toContain(v);
    await engine.close();
  });
});
