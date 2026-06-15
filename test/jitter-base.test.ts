import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

// Reach the voice's private gain to assert the resolved initial volume.
function voiceVolume(v: unknown): number {
  return (v as { gain: { gain: { value: number } } }).gain.gain.value;
}

describe('VoiceJitter base', () => {
  it('pitch { base } sets the playback rate (jitter centers on base, not 1)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('s', 'mock://s.webm', { bus: 'sfx' });

    expect(engine.sound('s').play({ pitch: { base: 1.5 } }).playbackRate).toBe(1.5);
    // jitter: 0 is deterministic → exactly the base.
    expect(engine.sound('s').play({ pitch: { base: 2, jitter: 0 } }).playbackRate).toBe(2);
    // jitter only still centers on the default 1 (back-compat).
    expect(engine.sound('s').play({ pitch: { jitter: 0 } }).playbackRate).toBe(1);
    // plain number form unchanged.
    expect(engine.sound('s').play({ pitch: 0.5 }).playbackRate).toBe(0.5);

    await engine.close();
  });

  it('volume { base } sets the initial volume', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('s', 'mock://s.webm', { bus: 'sfx' });

    expect(voiceVolume(engine.sound('s').play({ volume: { base: 0.6 } }))).toBeCloseTo(0.6);
    expect(voiceVolume(engine.sound('s').play({ volume: { base: 0.4, jitter: 0 } }))).toBeCloseTo(0.4);

    await engine.close();
  });
});
