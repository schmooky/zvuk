import { describe, expect, it } from 'vitest';
import { createEngine, Reverb } from '../src/index';

// Reach the private dry/wet gain nodes to assert the bypass behavior the
// public surface only exposes indirectly.
type Gains = { dry: { gain: { value: number } }; wet: { gain: { value: number } } };

describe('Reverb bypass', () => {
  it('passes dry at unity / silences wet, and restores the configured wet on un-bypass', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const r = new Reverb(engine.context, { wet: 0.6 });
    const g = r as unknown as Gains;

    expect(g.dry.gain.value).toBeCloseTo(0.4);
    expect(g.wet.gain.value).toBeCloseTo(0.6);

    r.bypassed = true;
    expect(g.dry.gain.value).toBe(1); // transparent, not 1 - wet
    expect(g.wet.gain.value).toBe(0);

    r.bypassed = false;
    expect(g.dry.gain.value).toBeCloseTo(0.4); // restored, NOT a hardcoded 0.3
    expect(g.wet.gain.value).toBeCloseTo(0.6);

    await engine.close();
  });

  it('un-bypass restores the last setWet value', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const r = new Reverb(engine.context, { wet: 0.3 });
    const g = r as unknown as Gains;

    r.setWet(0.8);
    r.bypassed = true;
    r.bypassed = false;
    expect(g.wet.gain.value).toBeCloseTo(0.8);
    expect(g.dry.gain.value).toBeCloseTo(0.2);

    await engine.close();
  });

  it('setWet while bypassed is remembered and applied on un-bypass', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const r = new Reverb(engine.context, { wet: 0.3 });
    const g = r as unknown as Gains;

    r.bypassed = true;
    r.setWet(0.5); // must not disturb the transparent bypass state
    expect(g.dry.gain.value).toBe(1);
    expect(g.wet.gain.value).toBe(0);

    r.bypassed = false;
    expect(g.wet.gain.value).toBeCloseTo(0.5);
    expect(g.dry.gain.value).toBeCloseTo(0.5);

    await engine.close();
  });
});
