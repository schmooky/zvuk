import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Voice live control', () => {
  it('exposes a spatializer when spawned with one', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ spatializer: { pan: 0.3 } });
    expect(v.spatializer).toBeDefined();
    v.spatializer?.setPan(-0.5);
    v.stop();
    await v.ended;
    await engine.close();
  });

  it('pause + resume captures and resumes from offset', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play();
    v.pause();
    expect(v.isPaused).toBe(true);
    v.resume();
    expect(v.isPaused).toBe(false);
    v.stop();
    await v.ended;
    await engine.close();
  });

  it('setPlaybackRate updates the live rate', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ pitch: 1 });
    v.setPlaybackRate(2);
    expect(v.playbackRate).toBe(2);
    v.stop();
    await v.ended;
    await engine.close();
  });
});
