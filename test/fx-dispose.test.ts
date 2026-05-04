import { describe, expect, it } from 'vitest';
import { Compressor } from '../src/fx/compressor';
import { Ducker } from '../src/fx/ducker';
import { Filter } from '../src/fx/filter';
import { Reverb } from '../src/fx/reverb';
import { createEngine } from '../src/index';

// FakeAudioNode tracks outgoing edges in `_connections`; we reach in to
// assert that dispose() actually tears down wiring where it should.
type WiredNode = { _connections: unknown[] };

describe('FX dispose', () => {
  it('Ducker.dispose disconnects from the source bus (no analyser leak)', async () => {
    const engine = createEngine({ buses: { music: {}, voice: {} } });
    await engine.unlock();

    const voiceBus = engine.bus('voice');
    const fx = new Ducker(engine.context, voiceBus);

    // The source bus's output must hold an outgoing edge to the analyser
    // before dispose, and lose exactly that edge after — without the fix,
    // the analyser (and its 1024-sample Float32Array) stays referenced for
    // the bus's lifetime.
    const busOut = voiceBus.output as unknown as WiredNode;
    const beforeCount = busOut._connections.length;
    expect(beforeCount).toBeGreaterThan(0);

    fx.dispose();

    expect(busOut._connections.length).toBe(beforeCount - 1);
    await engine.close();
  });

  it('Ducker.dispose is safe to call twice', async () => {
    const engine = createEngine({ buses: { music: {}, voice: {} } });
    await engine.unlock();
    const fx = new Ducker(engine.context, engine.bus('voice'));
    expect(() => {
      fx.dispose();
      fx.dispose();
    }).not.toThrow();
    await engine.close();
  });

  it('Compressor.dispose tears down internal wiring without throwing', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const fx = new Compressor(engine.context);
    const fakeIn = fx.input as unknown as WiredNode;
    expect(fakeIn._connections.length).toBeGreaterThan(0);
    fx.dispose();
    expect(fakeIn._connections.length).toBe(0);
    await engine.close();
  });

  it('Reverb.dispose tears down internal wiring without throwing', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const fx = new Reverb(engine.context);
    const fakeIn = fx.input as unknown as WiredNode;
    expect(fakeIn._connections.length).toBeGreaterThan(0);
    fx.dispose();
    expect(fakeIn._connections.length).toBe(0);
    await engine.close();
  });

  it('Filter.dispose is idempotent (input === output, same node)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const fx = new Filter(engine.context);
    expect(fx.input).toBe(fx.output);
    expect(() => {
      fx.dispose();
      fx.dispose();
    }).not.toThrow();
    await engine.close();
  });
});
