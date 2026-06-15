import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

type Eng = ReturnType<typeof createEngine>;

/** Last scheduled value on the bus output gain — i.e. is the bus audible? */
function outputGain(engine: Eng, bus: string): number {
  return engine.bus(bus).output.gain.value;
}

describe('Bus fade respects mute / solo', () => {
  it('fadeTo on a muted bus does not un-mute it', async () => {
    const engine = createEngine({ buses: { music: { level: 0.5, mute: true } } });
    await engine.unlock();
    expect(outputGain(engine, 'music')).toBe(0);

    await engine.bus('music').fadeTo(0.8, 0);
    // Still muted → still silent, but the target level is remembered.
    expect(engine.bus('music').muted).toBe(true);
    expect(outputGain(engine, 'music')).toBe(0);
    expect(engine.bus('music').level).toBeCloseTo(0.8);

    // Unmuting applies the stored level.
    engine.bus('music').muted = false;
    expect(outputGain(engine, 'music')).toBeCloseTo(0.8);
    await engine.close();
  });

  it('applying a snapshot with a muted bus keeps it silent', async () => {
    const engine = createEngine({ buses: { music: { level: 0.5, mute: true } } });
    await engine.unlock();
    const snap = engine.captureSnapshot('muted');

    // Drift away: unmute and raise the level.
    engine.bus('music').muted = false;
    engine.bus('music').level = 0.9;
    expect(outputGain(engine, 'music')).toBeCloseTo(0.9);

    await snap.apply({ fade: 0 });
    expect(engine.bus('music').muted).toBe(true);
    // The fadeTo inside apply() must NOT un-mute the bus.
    expect(outputGain(engine, 'music')).toBe(0);
    await engine.close();
  });

  it('fadeTo on a solo-veiled bus stays silent until the veil lifts', async () => {
    const engine = createEngine({ buses: { music: { level: 1 }, sfx: { level: 1 } } });
    await engine.unlock();

    engine.bus('sfx').solo(); // veils music
    expect(outputGain(engine, 'music')).toBe(0);

    await engine.bus('music').fadeTo(0.4, 0);
    expect(outputGain(engine, 'music')).toBe(0); // veiled → still silent

    engine.bus('sfx').unsolo(); // lifting the veil applies the stored level
    expect(outputGain(engine, 'music')).toBeCloseTo(0.4);
    await engine.close();
  });
});
