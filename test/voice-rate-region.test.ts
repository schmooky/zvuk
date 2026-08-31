import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * The region stop-timer is a wall-clock timeout computed against the
 * playback rate in force when it was armed. Halving the rate doubles how
 * long the region takes to play, so the timer has to be recomputed or the
 * voice is cut off half way through.
 */
describe('setPlaybackRate and duration-bounded voices', () => {
  it('re-arms the region timer when the rate changes', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('clip', 'mock://clip.wav', { bus: 'sfx' });

    // 100 ms of region at 1x. Dropped to 0.25x it should run ~400 ms.
    const v = engine.sound('clip').play({ duration: 0.1 });
    v.setPlaybackRate(0.25);

    let ended = false;
    void v.ended.then(() => {
      ended = true;
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(ended).toBe(false);

    await new Promise((r) => setTimeout(r, 300));
    expect(ended).toBe(true);
    await engine.close();
  });

  it('leaves voices without a region bound alone', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('clip', 'mock://clip.wav', { bus: 'sfx' });
    const v = engine.sound('clip').play({});
    v.setPlaybackRate(2);
    await new Promise((r) => setTimeout(r, 60));
    expect(engine.activeVoices()).toContain(v);
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });
});
