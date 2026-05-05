import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('click-free stop()', () => {
  it('schedules a gain ramp to 0 before stopping the source', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    // Reach into the voice's gain node via a typed indexer — the test setup
    // mock's FakeAudioParam reflects the latest scheduled value into .value,
    // so after the ramp completes, gain should be 0.
    const gain = (v as unknown as { gain: GainNode }).gain;

    v.stop();
    await v.ended;

    expect(gain.gain.value).toBe(0);
    await engine.close();
  });

  it('fade: 0 keeps the old hard-stop semantics', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    const gain = (v as unknown as { gain: GainNode }).gain;
    const startValue = gain.gain.value;

    v.stop({ fade: 0 });
    await v.ended;

    // Hard path: no ramp scheduled, gain stays at its pre-stop value.
    expect(gain.gain.value).toBe(startValue);
    await engine.close();
  });

  it('engine config voice.stopFade overrides the default', async () => {
    const engine = createEngine({
      buses: { sfx: {} },
      voice: { stopFade: 0.05 },
    });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    const t0 = Date.now();
    v.stop();
    await v.ended;
    const elapsed = Date.now() - t0;

    // Default 8 ms → ~50 ms means a measurable difference. Generous bounds
    // to keep this stable under CI scheduling jitter.
    expect(elapsed).toBeGreaterThanOrEqual(40);
    await engine.close();
  });

  it('engine config voice.stopFade: 0 reverts to hard stop globally', async () => {
    const engine = createEngine({
      buses: { sfx: {} },
      voice: { stopFade: 0 },
    });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    const gain = (v as unknown as { gain: GainNode }).gain;
    const startValue = gain.gain.value;

    v.stop();
    await v.ended;

    expect(gain.gain.value).toBe(startValue);
    await engine.close();
  });

  it('per-call fade overrides engine default', async () => {
    const engine = createEngine({
      buses: { sfx: {} },
      voice: { stopFade: 0 },
    });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    const gain = (v as unknown as { gain: GainNode }).gain;

    v.stop({ fade: 0.01 });
    await v.ended;

    expect(gain.gain.value).toBe(0);
    await engine.close();
  });

  it('re-entrant stop() during a fade is a no-op', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ volume: 1 });

    v.stop();
    // Second call before the ramp completes — should not crash, schedule a
    // second ramp, or fire onEnded twice. Engine voice tracking would catch
    // the latter via its Set semantics, but we want stop() itself to be
    // strictly idempotent during the fade window.
    expect(() => v.stop()).not.toThrow();
    expect(() => v.stop({ fade: 0 })).not.toThrow();

    await v.ended;
    await engine.close();
  });

  it('voice.ended resolves once even with multiple stop() calls', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play();

    let endedCount = 0;
    v.ended.then(() => {
      endedCount += 1;
    });

    v.stop();
    v.stop();
    v.stop();

    await v.ended;
    // Give the event loop a turn so any spurious resolutions could land.
    await new Promise((r) => setTimeout(r, 20));

    expect(endedCount).toBe(1);
    await engine.close();
  });

  it('abort signal still triggers click-free stop by default', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const ctrl = new AbortController();
    const v = engine.sound('blip').play({ signal: ctrl.signal, volume: 1 });

    const gain = (v as unknown as { gain: GainNode }).gain;

    ctrl.abort();
    await v.ended;

    expect(gain.gain.value).toBe(0);
    await engine.close();
  });
});
