import { describe, expect, it } from 'vitest';
import { Compressor, Filter, Reverb, createEngine } from '../src/index';

describe('Bus FX inserts', () => {
  it('attaches a Compressor without throwing', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const bus = engine.bus('music');
    const comp = new Compressor(engine.context, { threshold: -20, ratio: 4 });
    bus.addFx(comp);
    expect(bus.fx()).toContain(comp);
    comp.bypassed = true;
    expect(comp.bypassed).toBe(true);
    bus.removeFx(comp);
    expect(bus.fx()).not.toContain(comp);
    await engine.close();
  });

  it('Filter exposes input/output and disposes cleanly', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const f = new Filter(engine.context, { type: 'lowpass', frequency: 800, q: 1.2 });
    expect(f.input).toBeDefined();
    expect(f.output).toBeDefined();
    f.setFrequency(2000);
    f.setType('highpass');
    f.dispose();
    await engine.close();
  });

  it('Reverb generates a synthetic IR when none is provided', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const r = new Reverb(engine.context, { wet: 0.4, decay: { seconds: 0.5 } });
    expect(r.input).toBeDefined();
    expect(r.output).toBeDefined();
    r.setWet(0.1);
    r.bypassed = true;
    r.dispose();
    await engine.close();
  });
});
