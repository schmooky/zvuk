import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Snapshot', () => {
  it('captureSnapshot freezes a copy of the live mix state', async () => {
    const engine = createEngine({ buses: { music: { level: 0.6 }, sfx: { level: 1.0 } } });
    await engine.unlock();

    const snap = engine.captureSnapshot('preset');
    expect(snap.name).toBe('preset');
    expect(snap.state.buses.music?.level).toBeCloseTo(0.6);
    expect(snap.state.buses.sfx?.level).toBeCloseTo(1.0);

    // Mutate the engine after capture — snapshot must be unaffected.
    engine.bus('music').level = 0.1;
    expect(snap.state.buses.music?.level).toBeCloseTo(0.6);

    await engine.close();
  });

  it('apply with fade: 0 snaps levels and resolves immediately', async () => {
    const engine = createEngine({ buses: { music: { level: 0.8 } } });
    await engine.unlock();

    const snap = engine.captureSnapshot('quiet');
    engine.bus('music').level = 0.1;

    const t0 = Date.now();
    await snap.apply({ fade: 0 });
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(50);
    expect(engine.bus('music').level).toBeCloseTo(0.8);
    await engine.close();
  });

  it('apply with fade ramps over the requested duration', async () => {
    const engine = createEngine({ buses: { music: { level: 1.0 } } });
    await engine.unlock();

    const snap = engine.captureSnapshot('full');
    engine.bus('music').level = 0;

    const t0 = Date.now();
    await snap.apply({ fade: 0.12 });
    const elapsed = Date.now() - t0;

    // Loose floor — happy-dom timer drift can vary; just confirm we waited.
    expect(elapsed).toBeGreaterThanOrEqual(100);
    await engine.close();
  });

  it('apply restores the muted flag', async () => {
    const engine = createEngine({ buses: { music: { level: 0.5, mute: true } } });
    await engine.unlock();

    expect(engine.bus('music').muted).toBe(true);

    const snap = engine.captureSnapshot('muted');
    engine.bus('music').muted = false;
    expect(engine.bus('music').muted).toBe(false);

    await snap.apply({ fade: 0 });
    expect(engine.bus('music').muted).toBe(true);
    await engine.close();
  });

  it('apply silently skips buses that no longer exist on the engine', async () => {
    // Build a snapshot from explicit state that includes a phantom bus.
    const engine = createEngine({ buses: { music: { level: 0.8 } } });
    await engine.unlock();

    const snap = engine.snapshot('phantom', {
      buses: {
        music: { level: 0.2, muted: false },
        ghost: { level: 0.5, muted: false },
      },
      parameters: {},
    });

    // Must not throw on the unknown 'ghost' bus.
    await expect(snap.apply({ fade: 0 })).resolves.toBeUndefined();
    expect(engine.bus('music').level).toBeCloseTo(0.2);
    await engine.close();
  });

  it('apply restores parameter values discretely (no ramp)', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();

    const intensity = engine.parameter('intensity', 0.3);
    const snap = engine.captureSnapshot('cue');

    intensity.set(0.9);
    expect(intensity.value).toBeCloseTo(0.9);

    await snap.apply({ fade: 0.2 });
    // Parameters snap immediately even when fade > 0 — documented behaviour.
    expect(intensity.value).toBeCloseTo(0.3);
    await engine.close();
  });

  it('captureSnapshot taken later reflects the post-mutation state', async () => {
    const engine = createEngine({ buses: { music: { level: 0.5 } } });
    await engine.unlock();

    const before = engine.captureSnapshot('before');
    engine.bus('music').level = 0.9;
    const after = engine.captureSnapshot('after');

    expect(before.state.buses.music?.level).toBeCloseTo(0.5);
    expect(after.state.buses.music?.level).toBeCloseTo(0.9);
    await engine.close();
  });
});
