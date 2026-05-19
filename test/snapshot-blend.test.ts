import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Snapshot.blendWith / engine.blendSnapshots', () => {
  it('t=0 snaps to the first snapshot', async () => {
    const engine = createEngine({ buses: { music: { level: 0.2 }, sfx: { level: 0.2 } } });
    await engine.unlock();

    engine.bus('music').level = 0.2;
    engine.bus('sfx').level = 0.2;
    const calm = engine.captureSnapshot('calm');

    engine.bus('music').level = 1.0;
    engine.bus('sfx').level = 0.9;
    const combat = engine.captureSnapshot('combat');

    // Mutate the live mix to something else, then blend at t = 0.
    engine.bus('music').level = 0.5;
    engine.bus('sfx').level = 0.5;
    engine.blendSnapshots(calm, combat, 0);

    expect(engine.bus('music').level).toBeCloseTo(0.2);
    expect(engine.bus('sfx').level).toBeCloseTo(0.2);
    await engine.close();
  });

  it('t=1 snaps to the second snapshot', async () => {
    const engine = createEngine({ buses: { music: { level: 0.2 }, sfx: { level: 0.2 } } });
    await engine.unlock();

    const calm = engine.captureSnapshot('calm');
    engine.bus('music').level = 1.0;
    engine.bus('sfx').level = 0.9;
    const combat = engine.captureSnapshot('combat');

    engine.bus('music').level = 0.0;
    engine.blendSnapshots(calm, combat, 1);

    expect(engine.bus('music').level).toBeCloseTo(1.0);
    expect(engine.bus('sfx').level).toBeCloseTo(0.9);
    await engine.close();
  });

  it('t=0.5 lerps levels halfway', async () => {
    const engine = createEngine({ buses: { music: { level: 0.2 }, sfx: { level: 0.4 } } });
    await engine.unlock();

    const calm = engine.captureSnapshot('calm'); // music=0.2, sfx=0.4
    engine.bus('music').level = 0.8;
    engine.bus('sfx').level = 1.0;
    const combat = engine.captureSnapshot('combat'); // music=0.8, sfx=1.0

    engine.blendSnapshots(calm, combat, 0.5);

    // halfway: music = (0.2 + 0.8) / 2 = 0.5, sfx = (0.4 + 1.0) / 2 = 0.7
    expect(engine.bus('music').level).toBeCloseTo(0.5);
    expect(engine.bus('sfx').level).toBeCloseTo(0.7);
    await engine.close();
  });

  it('clamps t outside [0, 1]', async () => {
    const engine = createEngine({ buses: { music: { level: 0.2 } } });
    await engine.unlock();

    const a = engine.captureSnapshot('a'); // music = 0.2
    engine.bus('music').level = 1.0;
    const b = engine.captureSnapshot('b'); // music = 1.0

    engine.bus('music').level = 0.5;
    engine.blendSnapshots(a, b, -2);
    expect(engine.bus('music').level).toBeCloseTo(0.2);

    engine.blendSnapshots(a, b, 3);
    expect(engine.bus('music').level).toBeCloseTo(1.0);

    await engine.close();
  });

  it('lerps parameters too', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();

    const intensity = engine.parameter('intensity', 0);
    intensity.set(0.2);
    const calm = engine.captureSnapshot('calm');
    intensity.set(0.8);
    const combat = engine.captureSnapshot('combat');

    intensity.set(0); // anything; blend should overwrite
    engine.blendSnapshots(calm, combat, 0.25);
    expect(intensity.value).toBeCloseTo(0.2 * 0.75 + 0.8 * 0.25);

    engine.blendSnapshots(calm, combat, 0.75);
    expect(intensity.value).toBeCloseTo(0.2 * 0.25 + 0.8 * 0.75);

    await engine.close();
  });

  it('mute flips at t = 0.5 (no interpolation)', async () => {
    const engine = createEngine({ buses: { music: { level: 0.8, mute: false } } });
    await engine.unlock();

    const unmuted = engine.captureSnapshot('unmuted');
    engine.bus('music').muted = true;
    const muted = engine.captureSnapshot('muted');

    engine.blendSnapshots(unmuted, muted, 0.49);
    expect(engine.bus('music').muted).toBe(false);

    engine.blendSnapshots(unmuted, muted, 0.5);
    expect(engine.bus('music').muted).toBe(true);

    await engine.close();
  });

  it('skips buses that exist in only one snapshot', async () => {
    const engine = createEngine({ buses: { music: { level: 0.5 } } });
    await engine.unlock();

    // Build two snapshots with disjoint bus sets — only `music` overlaps.
    const a = engine.snapshot('a', {
      buses: { music: { level: 0.2, muted: false }, only_in_a: { level: 0.1, muted: false } },
      parameters: {},
    });
    const b = engine.snapshot('b', {
      buses: { music: { level: 1.0, muted: false }, only_in_b: { level: 0.9, muted: false } },
      parameters: {},
    });

    // Must not throw.
    engine.blendSnapshots(a, b, 0.5);
    expect(engine.bus('music').level).toBeCloseTo(0.6);
    await engine.close();
  });

  it('drives the mix continuously via a Parameter subscriber', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {} } });
    await engine.unlock();

    engine.bus('music').level = 0.2;
    engine.bus('sfx').level = 0.4;
    const calm = engine.captureSnapshot('calm');
    engine.bus('music').level = 1.0;
    engine.bus('sfx').level = 1.0;
    const combat = engine.captureSnapshot('combat');

    const tension = engine.parameter('tension', 0);
    tension.subscribe((t) => engine.blendSnapshots(calm, combat, t));

    tension.set(0);
    expect(engine.bus('music').level).toBeCloseTo(0.2);
    expect(engine.bus('sfx').level).toBeCloseTo(0.4);

    tension.set(1);
    expect(engine.bus('music').level).toBeCloseTo(1.0);
    expect(engine.bus('sfx').level).toBeCloseTo(1.0);

    tension.set(0.25);
    expect(engine.bus('music').level).toBeCloseTo(0.2 * 0.75 + 1.0 * 0.25);

    await engine.close();
  });

  it('Snapshot.blendWith matches engine.blendSnapshots', async () => {
    const engine = createEngine({ buses: { music: { level: 0.2 } } });
    await engine.unlock();

    const a = engine.captureSnapshot('a');
    engine.bus('music').level = 0.8;
    const b = engine.captureSnapshot('b');

    a.blendWith(b, 0.5);
    expect(engine.bus('music').level).toBeCloseTo(0.5);

    engine.blendSnapshots(a, b, 0.5);
    expect(engine.bus('music').level).toBeCloseTo(0.5);

    await engine.close();
  });
});
