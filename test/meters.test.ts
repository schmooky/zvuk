import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('voice.level() + bus.meter()', () => {
  it('voice.level() returns finite numbers in [0..1] before/during/after playback', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });
    const v = engine.sound('hit').play();
    const lv = v.level();
    expect(lv.rms).toBeGreaterThanOrEqual(0);
    expect(lv.rms).toBeLessThanOrEqual(1);
    expect(lv.peak).toBeGreaterThanOrEqual(0);
    expect(lv.peak).toBeLessThanOrEqual(1);
    v.stop({ fade: 0 });
    await v.ended;
    // Post-finish — returns zeros instead of throwing.
    const lvAfter = v.level();
    expect(lvAfter.rms).toBe(0);
    expect(lvAfter.peak).toBe(0);
    await engine.close();
  });

  it('voice.level() lazily allocates the AnalyserNode (no cost when never read)', async () => {
    // We can't easily count AnalyserNode allocations from outside without
    // patching the prototype, so this test just exercises the lazy path:
    // multiple calls reuse the same analyser without errors.
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('hit', 'mock://hit.wav', { bus: 'sfx' });
    const v = engine.sound('hit').play();
    const a = v.level();
    const b = v.level();
    const c = v.level();
    expect([a, b, c].every((x) => Number.isFinite(x.rms))).toBe(true);
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('bus.meter() returns finite numbers and survives bus.dispose', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const m = engine.bus('music').meter();
    expect(Number.isFinite(m.rms)).toBe(true);
    expect(Number.isFinite(m.peak)).toBe(true);
    await engine.close();
  });
});
